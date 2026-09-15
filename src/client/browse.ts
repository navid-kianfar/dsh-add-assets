/**
 * Normalization of the picker's two path sources into one level shape.
 *
 * The sources answer differently on purpose. Project discovery is the Host's own `@file` index: it
 * fuzzy-searches across the whole workspace from a bare query and refuses any path outside it.
 * Machine browsing is this plugin's endpoint: one level at a time from absolute paths, filtered by
 * name. Folding both into {@link BrowseLevel} is what lets the picker render one list, one
 * breadcrumb, and one keyboard model regardless of which capability answered.
 * @module @achasoft/dsh-add-assets/client/browse
 */

import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference/types'
import type { AddAssetsSettings, AssetListing } from '../host/types.ts'
import type { BrowseCrumb, BrowseEntry, BrowseLevel, BrowseScope } from './contract.ts'
import { basename, crumbsOf, dirnameOf, lastSeparator } from './mention.ts'

/**
 * Normalize a project-scope answer.
 *
 * Discovery returns paths only, so the name, parent, and hidden flag are derived here. The parent
 * line is suppressed while browsing a level — every row shares it — and shown while searching,
 * where it is the only thing telling two same-named files apart.
 * @param candidates - what `fileReferences.list` returned.
 * @param directory - the browsed directory, `''` at the workspace root, otherwise slash-terminated.
 * @param searching - whether a filter is active, which decides the parent line.
 * @param rootLabel - display text for the workspace root crumb.
 * @returns the normalized level.
 */
export function projectLevel(
  candidates: readonly FileReferenceCandidate[],
  directory: string,
  searching: boolean,
  rootLabel: string,
): BrowseLevel {
  const entries: BrowseEntry[] = candidates.map((candidate) => {
    const name = basename(candidate.path)
    return {
      name,
      path: candidate.path,
      parent: searching ? dirnameOf(candidate.path) : '',
      kind: candidate.kind,
      hidden: name.startsWith('.'),
    }
  })
  return {
    crumbs: crumbsOf(directory, rootLabel).map(crumb => ({ label: crumb.label, directory: crumb.directory })),
    // Discovery applies its own result cap and does not report having done so, so the picker's own
    // cap is the only truncation it can state honestly.
    entries,
    truncated: false,
  }
}

/**
 * Machine-scope crumbs: the whole chain from the filesystem root, with the Host account's home
 * labelled as such.
 *
 * The chain is never cut at the home. A trail rooted at "Home" reads well on a normal machine, but
 * it leaves `/tmp`, `/Volumes`, or `/opt` with no crumb to reach them by; the root and every
 * ancestor of the home stay one click away instead, and the home crumb's label is what keeps the
 * familiar step recognizable. (The trail scrolls rather than wraps, so the extra steps cost width,
 * not layout.)
 * @param listing - the Host's answer, whose crumbs run from the filesystem root.
 * @param homeLabel - display text for the home crumb.
 * @returns the trail, root first.
 */
export function machineCrumbs(listing: AssetListing, homeLabel: string): readonly BrowseCrumb[] {
  return listing.crumbs.map(crumb => ({
    label: listing.home !== '' && crumb.path === listing.home ? homeLabel : crumb.name,
    directory: crumb.path,
  }))
}

/**
 * A search-field entry that names a path rather than a name fragment: absolute, drive-qualified, or
 * the Host home (`~` alone or followed by a separator — `~backup` is a name).
 */
const TYPED_PATH = /^(?:\/|[A-Za-z]:[\\/]|~(?:[\\/]|$))/u

/**
 * What to ask the Host for, given the browsed directory and the search field.
 *
 * Typing a path browses to it, exactly as the project scope's discovery reads a query containing a
 * `/`: the part up to the last separator is the directory to list and what follows filters it. That
 * is what the field's placeholder has always promised, and it is the way to a directory no crumb
 * names — including `~` back home from `/tmp`.
 * @param directory - the browsed directory; `''` is the Host home.
 * @param filter - the search field's text.
 * @returns the path and name filter for the browse endpoint.
 */
export function machineRequest(directory: string, filter: string): { readonly path: string; readonly query: string } {
  const typed = filter.trimStart()
  if (!TYPED_PATH.test(typed)) return { path: directory, query: filter }
  const cut = lastSeparator(typed)
  if (cut < 0) return { path: typed, query: '' }
  return { path: typed.slice(0, cut + 1), query: typed.slice(cut + 1) }
}

/**
 * The scopes the picker can offer right now.
 *
 * Computed from the live settings value on every render rather than once when the seat is
 * injected: the slot renderer caches a seat's injected share per session, so a roster frozen there
 * would ignore an `outsideWorkspace` change until a reload.
 * @param project - whether this fiber can reach project discovery, fixed for the fiber's life.
 * @param settings - the resolved section, or undefined before it resolves.
 * @returns the roster, project first; empty when neither scope can answer.
 */
export function availableScopes(
  project: boolean,
  settings: Pick<AddAssetsSettings, 'outsideWorkspace'> | undefined,
): readonly BrowseScope[] {
  const machine = settings?.outsideWorkspace !== false
  if (project) return machine ? ['project', 'machine'] : ['project']
  return machine ? ['machine'] : []
}

/**
 * Normalize a machine-scope answer.
 *
 * No row carries a parent line: a machine-scope filter narrows ONE level rather than searching a
 * tree, so every match shares the directory the crumbs already name.
 * @param listing - the Host's level.
 * @param homeLabel - display text for the home crumb.
 * @returns the normalized level.
 */
export function machineLevel(listing: AssetListing, homeLabel: string): BrowseLevel {
  return {
    crumbs: machineCrumbs(listing, homeLabel),
    entries: listing.entries.map(entry => ({
      name: entry.name,
      path: entry.path,
      parent: '',
      kind: entry.kind,
      hidden: entry.hidden,
    })),
    truncated: listing.truncated,
  }
}
