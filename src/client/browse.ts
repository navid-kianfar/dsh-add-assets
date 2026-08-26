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
import type { AssetListing } from '../host/types.ts'
import type { BrowseCrumb, BrowseEntry, BrowseLevel } from './contract.ts'
import { basename, crumbsOf, dirnameOf } from './mention.ts'

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
 * Machine-scope crumbs, with the Host account's home collapsed to one step.
 *
 * A path under the home directory is five or six crumbs of noise before anything the user
 * recognizes; rooting it at "Home" is what makes the trail readable on a normal machine, and the
 * full chain is still there for anything outside it.
 * @param listing - the Host's answer, whose crumbs run from the filesystem root.
 * @param homeLabel - display text for the home crumb.
 * @returns the trail, root or home first.
 */
export function machineCrumbs(listing: AssetListing, homeLabel: string): readonly BrowseCrumb[] {
  const { home } = listing
  const underHome = home !== '' && (listing.path === home || listing.path.startsWith(`${home}/`))
  if (!underHome) {
    return listing.crumbs.map(crumb => ({ label: crumb.name, directory: crumb.path }))
  }
  const trail: BrowseCrumb[] = [{ label: homeLabel, directory: home }]
  for (const crumb of listing.crumbs) {
    if (crumb.path === home || !crumb.path.startsWith(`${home}/`)) continue
    trail.push({ label: crumb.name, directory: crumb.path })
  }
  return trail
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
