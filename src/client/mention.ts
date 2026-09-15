/**
 * Draft text produced by the picker: `@path` mentions and the level-browsing query the Host's
 * file-reference discovery expects.
 *
 * The mention itself comes from the harness's own `@file` grammar rather than a second copy of the
 * rules, so what this plugin writes into the draft is byte-identical to what the composer's `@`
 * completion writes.
 * @module @achasoft/dsh-add-assets/client/mention
 */

import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar'
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference/types'

/**
 * The complete draft token for one candidate.
 *
 * The shared grammar leaves a quoted DIRECTORY's quote open, because its own caller is a completion
 * menu about to descend another level. A picker insertion is finished text instead, so the quote is
 * closed here.
 * @param candidate - the chosen file or directory.
 * @returns the mention text, or undefined for a path the grammar cannot represent safely.
 */
export function mentionOf(candidate: FileReferenceCandidate): string | undefined {
  const mention = formatFileMention(candidate, false)
  if (mention === undefined) return undefined
  return mention.startsWith('@"') && !mention.endsWith('"') ? `${mention}"` : mention
}

/** One path the picker handed back: what a mention and a chip are both built from. */
export interface PickedPath {
  readonly path: string
  readonly kind: 'file' | 'directory'
}

/** A pick together with the mention made from it. */
export interface PathReference {
  readonly entry: PickedPath
  readonly mention: string
}

/**
 * Make each pick's mention and keep the two together.
 *
 * They are paired BEFORE anything is dropped. Filtering the mentions on their own and then looking
 * them up by the pick's index shifts every mention after an unrepresentable path onto the wrong
 * pick: a chip labelled `budget.xlsx` would send `@…/archive/`. The count of dropped picks is
 * returned so the person is told, rather than finding one missing from the draft.
 * @param paths - the picks, in the order chosen.
 * @returns the representable picks with their mentions, in order, and how many were skipped.
 */
export function pairMentions(paths: readonly PickedPath[]): { readonly references: readonly PathReference[]; readonly skipped: number } {
  const references = paths.flatMap((entry): PathReference[] => {
    const mention = mentionOf(entry)
    return mention === undefined ? [] : [{ entry, mention }]
  })
  return { references, skipped: paths.length - references.length }
}

/**
 * Append mentions to a draft as the user would have typed them: separated by single spaces, with a
 * trailing space so the caret lands ready for the next word.
 * @param draft - the current draft text.
 * @param mentions - mentions in insertion order; an empty list returns the draft unchanged.
 * @returns the next draft.
 */
export function appendMentions(draft: string, mentions: readonly string[]): string {
  if (mentions.length === 0) return draft
  const joined = `${mentions.join(' ')} `
  if (draft === '' || /\s$/u.test(draft)) return draft + joined
  return `${draft} ${joined}`
}

/**
 * The query the Host reads as "list this directory, filtered by this fragment".
 *
 * Discovery switches on the last `/`: a query containing one lists the directory before it, and a
 * query without one fuzzy-searches the whole workspace index. Joining the browsed directory to the
 * typed filter is therefore both the level listing and, at the root with a filter typed, the
 * name search.
 * @param directory - browsed directory, `''` for the workspace root, otherwise slash-terminated.
 * @param filter - the text typed into the picker's search field.
 * @returns the discovery query.
 */
export function browseQuery(directory: string, filter: string): string {
  return directory + filter.trimStart()
}

/** One breadcrumb step: what to show, and the directory it navigates to. */
export interface Crumb {
  /** Display text; the root's label is supplied by the caller from its dictionary. */
  readonly label: string
  /** The directory this crumb navigates to, slash-terminated or `''` for the root. */
  readonly directory: string
}

/**
 * Breadcrumb trail for a browsed directory, root first.
 * @param directory - slash-terminated directory, or `''` at the root.
 * @param rootLabel - display text for the workspace root.
 * @returns the trail; a root directory yields the root crumb alone.
 */
export function crumbsOf(directory: string, rootLabel: string): readonly Crumb[] {
  const crumbs: Crumb[] = [{ label: rootLabel, directory: '' }]
  let walked = ''
  for (const segment of directory.split('/').filter(part => part !== '')) {
    walked += `${segment}/`
    crumbs.push({ label: segment, directory: walked })
  }
  return crumbs
}

/**
 * A path in Windows form: drive-qualified, or the Host home followed by a backslash.
 *
 * The browser cannot ask which platform the Host runs, but a machine-scope path says so itself —
 * the Host only ever reports and accepts drive-qualified paths on Windows. Project paths never
 * match: discovery reports them workspace-relative and always slash-separated.
 */
const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|~\\)/u

/**
 * Index of the last separator in a path.
 *
 * Both separators count on a Windows path, where the Host accepts either. Only `/` counts
 * otherwise, because on POSIX a backslash is an ordinary character a file name may contain.
 * @param path - a workspace-relative path, a Host path, or a typed one.
 * @returns the index, or -1 when the path has no separator.
 */
export function lastSeparator(path: string): number {
  const slash = path.lastIndexOf('/')
  return WINDOWS_PATH.test(path) ? Math.max(slash, path.lastIndexOf('\\')) : slash
}

/**
 * A path without its trailing separator, which marks a directory and is not part of any segment.
 * @param path - any path the picker handles.
 * @returns the path, one trailing separator removed.
 */
function withoutTrailingSeparator(path: string): string {
  return path.length > 0 && lastSeparator(path) === path.length - 1 ? path.slice(0, -1) : path
}

/**
 * The last path segment, which is what a picker row shows.
 * @param path - a workspace-relative or Host path, with or without a trailing separator.
 * @returns the final segment; `''` only for an empty path.
 */
export function basename(path: string): string {
  const trimmed = withoutTrailingSeparator(path)
  return trimmed.slice(lastSeparator(trimmed) + 1)
}

/**
 * The directory part of a path, which is what a picker row shows under the name while searching.
 * @param path - a workspace-relative path.
 * @returns the parent directory, separator-terminated, or `''` when the path sits at the root.
 */
export function dirnameOf(path: string): string {
  const trimmed = withoutTrailingSeparator(path)
  return trimmed.slice(0, lastSeparator(trimmed) + 1)
}

/**
 * The short text an inline reference chip shows in the draft.
 *
 * The draft holds the DISPLAY text of an occurrence while the full `@path` rides along as its
 * hidden serialized form, so this is what a person reads in the composer: the basename, with the
 * trailing slash that marks a directory kept.
 * @param path - the workspace-relative or absolute path.
 * @param kind - whether the path names a directory.
 * @returns the label.
 */
export function labelOf(path: string, kind: 'file' | 'directory'): string {
  return kind === 'directory' ? `${basename(path)}/` : basename(path)
}
