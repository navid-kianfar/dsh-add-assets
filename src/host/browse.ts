/**
 * Host filesystem listing behind the picker's "whole machine" mode.
 *
 * NAMES ONLY. This module reads directory entries and reports their names, kinds, and absolute
 * paths; it never opens a file. That keeps the endpoint the same class of exposure as the Workspace
 * directory browser the harness already serves, widened to name files as well as directories —
 * which is the whole reason it exists, since the file-reference provider deliberately refuses to
 * resolve any path outside the session's working directory.
 *
 * BOUNDED. A level is streamed with `opendir` into a window of at most `maxEntries` candidates, so a
 * directory of two hundred thousand entries costs the Host the window, not the directory: nothing
 * holds every name, sorts every name, or stats every symlink before the cap throws most of them
 * away. It is modelled on the harness's own directory browser (`dsh-host-directory-picker-browse`),
 * widened to files.
 * @module @achasoft/dsh-add-assets/host/browse
 */

import { opendir, stat } from 'node:fs/promises'
import type { Dir, Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { posix, win32 } from 'node:path'
import type { AssetCrumb, AssetEntry, AssetListing } from './types.ts'

/** What a listing failed on, when it did. */
export class AssetBrowseError extends Error {
  /**
   * @param code - the classified failure, chosen so the browser can say something specific.
   * @param message - operator-facing detail.
   */
  constructor(readonly code: 'not-a-directory' | 'unreadable', message: string) {
    super(message)
    this.name = 'AssetBrowseError'
  }
}

/**
 * Symlinks resolved at once while classifying the kept window. Enough that a window of links to a
 * slow mount does not resolve one at a time; few enough that one request cannot flood the thread
 * pool the rest of the Host shares.
 */
const STAT_CONCURRENCY = 8

/**
 * Deterministic name order, independent of the host locale so two machines list one directory the
 * same way.
 * @param left - first name.
 * @param right - second name.
 * @returns negative, zero, or positive in the usual comparator sense.
 */
function compareNames(left: string, right: string): number {
  const lower = left.toLowerCase()
  const other = right.toLowerCase()
  if (lower !== other) return lower < other ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * The path API for a platform. Injectable so the Windows rules are testable on any Host.
 * @param platform - the platform whose path semantics apply.
 * @returns `path.win32` on Windows, `path.posix` everywhere else.
 */
function pathsFor(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix
}

/**
 * Whether a path names one fixed location regardless of process state.
 *
 * `path.isAbsolute` is not that on Windows: it accepts drive-less `\foo` and `/foo`, which resolve
 * against whatever drive the Host process happens to be on. UNC paths (`\\server\share`) are refused
 * too, unlike the harness's own check — listing one makes the Host open a connection to a network
 * server named by the browser, which on Windows can hand that server the account's credentials,
 * and a picker of local files has no reason to do it.
 * @param path - candidate path.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns true for a POSIX-absolute path, or a drive-qualified one (`C:\…`) on Windows.
 */
export function fullyQualified(path: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32' ? /^[A-Za-z]:[\\/]/u.test(path) : posix.isAbsolute(path)
}

/**
 * The ancestor chain from the filesystem root to one directory, inclusive.
 *
 * Every crumb is a jump target, which is what lets the picker walk out of a deep path — including
 * above the home directory — without retyping it.
 * @param absolute - a fully qualified, normalized directory path.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns the chain, root first.
 */
export function crumbsOf(absolute: string, platform: NodeJS.Platform = process.platform): AssetCrumb[] {
  const paths = pathsFor(platform)
  const { root } = paths.parse(absolute)
  const crumbs: AssetCrumb[] = [{ name: root, path: root }]
  let walked = root
  for (const segment of absolute.slice(root.length).split(paths.sep).filter(part => part !== '')) {
    walked = paths.join(walked, segment)
    crumbs.push({ name: segment, path: walked })
  }
  return crumbs
}

/**
 * Resolve the directory a request names.
 *
 * `~` is expanded here rather than in the browser because only the Host knows its home, and a typed
 * `~/Downloads` is the most natural way back from `/tmp`.
 * @param path - blank, `~`, `~/…`, or a fully qualified path.
 * @param home - the Host account's home directory.
 * @param platform - replaces `process.platform` for deterministic tests.
 * @returns the normalized absolute directory, or undefined for any other form — a relative path has
 * no meaning here, since the browser is not in the Host's working directory.
 */
export function resolveStart(
  path: string,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const paths = pathsFor(platform)
  if (path === '') return home
  const tilde = platform === 'win32' ? /^~(?:[\\/]|$)/u : /^~(?:\/|$)/u
  if (tilde.test(path)) return paths.resolve(home, path.slice(2))
  return fullyQualified(path, platform) ? paths.resolve(path) : undefined
}

/** One streamed entry the window may keep, before symlinks are resolved. */
interface Candidate {
  readonly name: string
  /**
   * Window precedence: 0 for a real directory, 1 for everything else. A symlink's kind is unknown
   * until it is stat'ed, and stat-ing every streamed link is exactly the cost the window avoids, so
   * links compete for the window by name among the files and move to the directory group only once
   * they are kept and resolved.
   */
  readonly rank: 0 | 1
  readonly dirent: Dirent
}

/**
 * Window order: real directories first, then by name.
 * @param left - first candidate.
 * @param right - second candidate.
 * @returns comparator result.
 */
function compareCandidates(left: Candidate, right: Candidate): number {
  return left.rank === right.rank ? compareNames(left.name, right.name) : left.rank - right.rank
}

/**
 * Insert one streamed candidate into the ordered window, evicting the last when it overflows.
 * @param window - the window, ordered by {@link compareCandidates}; mutated in place.
 * @param candidate - the entry just read.
 * @param keep - the window bound.
 * @returns true when a candidate was left out, which is what makes the level truncated.
 */
function insertBounded(window: Candidate[], candidate: Candidate, keep: number): boolean {
  const last = window[window.length - 1]
  if (window.length === keep && last !== undefined && compareCandidates(candidate, last) >= 0) return true
  let low = 0
  let high = window.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (compareCandidates(candidate, window[middle]!) < 0) high = middle
    else low = middle + 1
  }
  window.splice(low, 0, candidate)
  if (window.length <= keep) return false
  window.pop()
  return true
}

/**
 * How one kept entry should be reported, once a symlink is followed.
 * @param directory - the listed directory.
 * @param dirent - the entry.
 * @param paths - the platform path API.
 * @returns the kind, or undefined for an entry the picker cannot offer.
 */
async function classify(directory: string, dirent: Dirent, paths: typeof posix): Promise<AssetEntry['kind'] | undefined> {
  if (dirent.isDirectory()) return 'directory'
  if (dirent.isFile()) return 'file'
  try {
    const target = await stat(paths.join(directory, dirent.name))
    return target.isDirectory() ? 'directory' : target.isFile() ? 'file' : undefined
  } catch {
    // A broken or unreadable symlink names nothing the picker could hand to a tool, so it is
    // dropped rather than offered as a path that will fail on use.
    return undefined
  }
}

/**
 * Classify the kept window, resolving symlinks a few at a time and checking the signal between
 * each, so an abandoned request stops stat-ing.
 * @param directory - the listed directory.
 * @param window - the kept candidates.
 * @param signal - caller cancellation.
 * @param paths - the platform path API.
 * @returns each candidate's kind, index-aligned with the window.
 */
async function classifyWindow(
  directory: string,
  window: readonly Candidate[],
  signal: AbortSignal,
  paths: typeof posix,
): Promise<readonly (AssetEntry['kind'] | undefined)[]> {
  const kinds: (AssetEntry['kind'] | undefined)[] = new Array(window.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (let index = next++; index < window.length; index = next++) {
      signal.throwIfAborted()
      kinds[index] = await classify(directory, window[index]!.dirent, paths)
    }
  }
  const workers = Array.from({ length: Math.min(STAT_CONCURRENCY, window.length) }, worker)
  await Promise.all(workers)
  return kinds
}

/** Inputs of one listing. */
export interface AssetListingRequest {
  /** Directory to list: blank or `~` for the Host home, `~/…`, or a fully qualified path. */
  readonly path: string
  /** Case-insensitive substring filter applied to entry names before the cap. */
  readonly query: string
  /** Maximum entries reported for this level, and the size of the window the stream keeps. */
  readonly maxEntries: number
  /** Aborts the scan when the caller supersedes it; checked between every entry read. */
  readonly signal: AbortSignal
}

/**
 * List one directory level of the Host filesystem.
 *
 * The filter runs before the window so a matching entry deep in a large directory is still
 * reachable: capping first would hide it behind thousands of names the user already told us they
 * do not want.
 *
 * ORDER is directories first, then files, each name-sorted — within the window. When the level has
 * more matching entries than `maxEntries`, the window holds the name-first real directories, then
 * the name-first of everything else, and `truncated` is true. A kept symlink that turns out broken
 * is dropped after the window closed, so a truncated level can report slightly fewer entries than
 * the cap.
 * @param request - the directory, filter, cap, and cancellation.
 * @returns the level, its ancestry, and whether the cap cut it.
 * @throws AssetBrowseError when the path is not a fully qualified, readable directory.
 * @throws the signal's reason when the caller aborted.
 */
export async function listAssets(request: AssetListingRequest): Promise<AssetListing> {
  const { query, maxEntries, signal } = request
  signal.throwIfAborted()
  const home = homedir()
  const paths = pathsFor(process.platform)
  const directory = resolveStart(request.path, home)
  if (directory === undefined) {
    throw new AssetBrowseError('unreadable', `"${request.path}" is not a fully qualified path`)
  }
  let handle: Dir
  try {
    handle = await opendir(directory)
  } catch (error: unknown) {
    signal.throwIfAborted()
    const code = (error as { code?: string }).code
    if (code === 'ENOTDIR') throw new AssetBrowseError('not-a-directory', `${directory} is not a directory`)
    throw new AssetBrowseError('unreadable', `${directory} could not be read`)
  }

  const needle = query.trim().toLowerCase()
  const window: Candidate[] = []
  let truncated = false
  try {
    // Leaving this loop by any route — the end, an abort, a read error — closes the handle: that is
    // the `Dir` async iterator's contract.
    for await (const dirent of handle) {
      signal.throwIfAborted()
      if (needle !== '' && !dirent.name.toLowerCase().includes(needle)) continue
      const directoryEntry = dirent.isDirectory()
      if (!directoryEntry && !dirent.isFile() && !dirent.isSymbolicLink()) continue
      const candidate: Candidate = { name: dirent.name, rank: directoryEntry ? 0 : 1, dirent }
      if (insertBounded(window, candidate, maxEntries)) truncated = true
    }
  } catch (error: unknown) {
    signal.throwIfAborted()
    throw new AssetBrowseError('unreadable', `${directory} could not be read: ${(error as Error).message}`)
  }

  const kinds = await classifyWindow(directory, window, signal, paths)
  const entries = window.flatMap((candidate, index): AssetEntry[] => {
    const kind = kinds[index]
    if (kind === undefined) return []
    return [{ name: candidate.name, path: paths.join(directory, candidate.name), kind, hidden: candidate.name.startsWith('.') }]
  })
  // Directories before files, each name-sorted: the picker's primary gesture at any level is
  // descending, and a folder buried among a thousand files is not findable by eye. A resolved
  // symlink to a directory joins the directory group here.
  entries.sort((left, right) =>
    left.kind === right.kind ? compareNames(left.name, right.name) : left.kind === 'directory' ? -1 : 1)

  return { path: directory, home, crumbs: crumbsOf(directory), entries, truncated }
}
