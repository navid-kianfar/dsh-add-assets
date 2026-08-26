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

/**
 * The directory one level above a browsed directory.
 * @param directory - slash-terminated directory, or `''` at the root.
 * @returns the parent, slash-terminated, or `''` when the parent is the root.
 */
export function parentDirectory(directory: string): string {
  const trimmed = directory.endsWith('/') ? directory.slice(0, -1) : directory
  const cut = trimmed.lastIndexOf('/')
  return cut < 0 ? '' : trimmed.slice(0, cut + 1)
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
 * The last path segment, which is what a picker row shows.
 * @param path - a workspace-relative path, with or without a trailing slash.
 * @returns the final segment; `''` only for an empty path.
 */
export function basename(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const cut = trimmed.lastIndexOf('/')
  return cut < 0 ? trimmed : trimmed.slice(cut + 1)
}

/**
 * The directory part of a path, which is what a picker row shows under the name while searching.
 * @param path - a workspace-relative path.
 * @returns the parent directory, slash-terminated, or `''` when the path sits at the root.
 */
export function dirnameOf(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  const cut = trimmed.lastIndexOf('/')
  return cut < 0 ? '' : trimmed.slice(0, cut + 1)
}

/** One `@path` mention found in a draft, with the span that produced it. */
export interface DraftMention {
  /** Offset of the `@` in the draft. */
  readonly start: number
  /** Offset one past the mention's last character. */
  readonly end: number
  /** The workspace-relative or absolute path, unquoted. */
  readonly path: string
  /** A trailing slash is what the shared grammar uses to mean "directory". */
  readonly kind: 'file' | 'directory'
}

/**
 * Every complete `@path` mention in a draft, in document order.
 *
 * The lookbehind is the same word-boundary rule the shared grammar applies at the caret: an `@`
 * inside another token — an email address, a decorator — is not a mention, and neither is one the
 * user is still typing a quote around.
 */
const MENTION = /(?<=^|\s)@(?:"([^"]*)"|([^\s"]+))/gu

/**
 * Scan a draft for the mentions the picker inserts.
 *
 * The draft is the single source of truth for what was added: a chip row derived from it stays
 * correct when the user edits or deletes the text by hand, which a separately held list would not.
 * @param draft - the current draft text.
 * @returns the mentions, in document order.
 */
export function scanMentions(draft: string): readonly DraftMention[] {
  const found: DraftMention[] = []
  for (const match of draft.matchAll(MENTION)) {
    const path = match[1] ?? match[2]
    if (path === undefined || path === '') continue
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      path,
      kind: path.endsWith('/') ? 'directory' : 'file',
    })
  }
  return found
}

/**
 * Remove one mention from a draft, taking the separator that went in with it.
 *
 * A mention was inserted with a trailing space, so removing the text alone would leave a double
 * space behind; the leading space is taken instead when the mention ends the draft, which keeps the
 * remaining text from ending in whitespace it did not have before.
 * @param draft - the current draft text.
 * @param mention - the mention to remove, as scanned from this same draft.
 * @returns the next draft.
 */
export function removeMention(draft: string, mention: DraftMention): string {
  const after = draft.slice(mention.end)
  if (after.startsWith(' ')) return draft.slice(0, mention.start) + after.slice(1)
  const before = draft.slice(0, mention.start)
  return before.endsWith(' ') ? before.slice(0, -1) + after : before + after
}
