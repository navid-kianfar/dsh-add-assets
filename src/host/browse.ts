/**
 * Host filesystem listing behind the picker's "whole machine" mode.
 *
 * NAMES ONLY. This module reads directory entries and reports their names, kinds, and absolute
 * paths; it never opens a file. That keeps the endpoint the same class of exposure as the Workspace
 * directory browser the harness already serves, widened to name files as well as directories —
 * which is the whole reason it exists, since the file-reference provider deliberately refuses to
 * resolve any path outside the session's working directory.
 * @module @achasoft/dsh-add-assets/host/browse
 */

import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, resolve, sep } from 'node:path'
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
 * The ancestor chain from the filesystem root to one directory, inclusive.
 *
 * Every crumb is a jump target, which is what lets the picker walk out of a deep path without
 * retyping it.
 * @param absolute - an absolute directory path.
 * @returns the chain, root first.
 */
export function crumbsOf(absolute: string): AssetCrumb[] {
  const { root } = parse(absolute)
  const crumbs: AssetCrumb[] = [{ name: root, path: root }]
  let walked = root
  for (const segment of absolute.slice(root.length).split(sep).filter(part => part !== '')) {
    walked = join(walked, segment)
    crumbs.push({ name: segment, path: walked })
  }
  return crumbs
}

/**
 * Resolve the directory a request names.
 * @param path - the requested absolute path; blank or relative falls back to the Host home.
 * @returns the absolute directory to list.
 */
export function resolveStart(path: string): string {
  // A relative path has no meaning here — the browser is not in the Host's working directory — so
  // it is treated as "no path given" rather than resolved against whatever the process cwd is.
  return path !== '' && isAbsolute(path) ? resolve(path) : homedir()
}

/** How one directory entry should be reported, once symlinks are followed. */
async function classify(directory: string, name: string, symbolic: boolean, directoryFlag: boolean, fileFlag: boolean):
Promise<AssetEntry['kind'] | undefined> {
  if (directoryFlag) return 'directory'
  if (fileFlag) return 'file'
  if (!symbolic) return undefined
  try {
    const target = await stat(join(directory, name))
    return target.isDirectory() ? 'directory' : target.isFile() ? 'file' : undefined
  } catch {
    // A broken or unreadable symlink names nothing the picker could hand to a tool, so it is
    // dropped rather than offered as a path that will fail on use.
    return undefined
  }
}

/** Inputs of one listing. */
export interface AssetListingRequest {
  /** Absolute directory to list; blank lists the Host home directory. */
  readonly path: string
  /** Case-insensitive substring filter applied to entry names before the cap. */
  readonly query: string
  /** Maximum entries reported for this level. */
  readonly maxEntries: number
  /** Aborts the scan when the caller supersedes it. */
  readonly signal: AbortSignal
}

/**
 * List one directory level of the Host filesystem.
 *
 * The filter runs before the cap so a matching entry deep in a large directory is still reachable:
 * capping first would hide it behind thousands of names the user already told us they do not want.
 * @param request - the directory, filter, cap, and cancellation.
 * @returns the level, its ancestry, and whether the cap cut it.
 * @throws AssetBrowseError when the path is not a readable directory.
 */
export async function listAssets(request: AssetListingRequest): Promise<AssetListing> {
  const { query, maxEntries, signal } = request
  signal.throwIfAborted()
  const directory = resolveStart(request.path)
  let dirents
  try {
    dirents = await readdir(directory, { withFileTypes: true })
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === 'ENOTDIR') throw new AssetBrowseError('not-a-directory', `${directory} is not a directory`)
    throw new AssetBrowseError('unreadable', `${directory} could not be read`)
  }
  signal.throwIfAborted()

  const needle = query.trim().toLowerCase()
  const entries: AssetEntry[] = []
  for (const dirent of dirents) {
    signal.throwIfAborted()
    if (needle !== '' && !dirent.name.toLowerCase().includes(needle)) continue
    const kind = await classify(
      directory, dirent.name, dirent.isSymbolicLink(), dirent.isDirectory(), dirent.isFile(),
    )
    if (kind === undefined) continue
    entries.push({ name: dirent.name, path: join(directory, dirent.name), kind, hidden: dirent.name.startsWith('.') })
  }
  // Directories before files, each name-sorted: the picker's primary gesture at any level is
  // descending, and a folder buried among a thousand files is not findable by eye.
  entries.sort((left, right) =>
    left.kind === right.kind ? compareNames(left.name, right.name) : left.kind === 'directory' ? -1 : 1)

  return {
    path: directory,
    home: homedir(),
    crumbs: crumbsOf(directory),
    entries: entries.slice(0, maxEntries),
    truncated: entries.length > maxEntries,
  }
}
