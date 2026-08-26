/**
 * The injected shares of this plugin's three registrations, and the small faces they carry.
 * @module @achasoft/dsh-add-assets/client/contract
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { AddAssetsSettings } from '../host/types.ts'

/**
 * Where the picker is looking.
 *
 * `project` is the session's working directory, served by the Host's file-reference discovery: it
 * fuzzy-searches an index and refuses every path outside that directory. `machine` is the Host
 * filesystem, served by this plugin's own endpoint: it lists one level at a time from absolute
 * paths. The two are different capabilities with different guarantees, which is why the picker
 * shows which one it is in rather than blending them.
 */
export type BrowseScope = 'project' | 'machine'

/** Which of the plate's two workspace entries the picker was opened for. */
export type PickerMode = 'files' | 'folders'

/** One row of a browsed level, normalized across both scopes. */
export interface BrowseEntry {
  /** Basename, which is what the row shows. */
  readonly name: string
  /** The path a mention is built from: workspace-relative in `project`, absolute in `machine`. */
  readonly path: string
  /** Parent directory shown under the name while searching; `''` suppresses that line. */
  readonly parent: string
  readonly kind: 'file' | 'directory'
  /** Dot-prefixed name; the picker hides these until asked. */
  readonly hidden: boolean
}

/** One navigable step of a browsed path. */
export interface BrowseCrumb {
  /** Display text. */
  readonly label: string
  /** The directory this crumb navigates to, in the scope's own path form. */
  readonly directory: string
}

/** One listed level, normalized across both scopes. */
export interface BrowseLevel {
  /** Ancestry of the listed directory, root first; the last crumb is the level itself. */
  readonly crumbs: readonly BrowseCrumb[]
  /** Rows in display order: directories before files, each name-sorted. */
  readonly entries: readonly BrowseEntry[]
  /** True when the SOURCE cut the level; the picker's own row cap is applied separately. */
  readonly truncated: boolean
}

/** The picker's data face: which scopes are available, and how to list one level of each. */
export interface AssetBrowse {
  /**
   * Scopes this deployment can actually serve, in the order the picker offers them. A single-entry
   * roster hides the scope switch entirely rather than showing a control with one choice.
   */
  readonly scopes: readonly BrowseScope[]
  /**
   * The directory a scope starts at.
   * @param scope - the scope to open.
   * @returns the initial directory in that scope's own path form.
   */
  start(scope: BrowseScope): string
  /**
   * List one level.
   * @param scope - which capability answers.
   * @param directory - the directory to list, in that scope's own path form.
   * @param filter - the text typed into the search field.
   * @param signal - aborts the wire call when a newer query supersedes this one.
   * @returns the normalized level.
   * @throws when the Host refused or could not read the level; the picker says so.
   */
  list(scope: BrowseScope, directory: string, filter: string, signal: AbortSignal): Promise<BrowseLevel>
}

/** Injected share of the composer plate seat. */
export interface AddAssetsPlateInjected {
  /** Registrant-private reactive sources the renderer binds to `use<Name>` hooks. */
  hooks: {
    /** The bound `add-assets` settings scope: resolved value, layers, revision, and writability. */
    addAssetsSettings: SettingsScope<AddAssetsSettings>
  }
  /**
   * Open the composer's slash-command menu over a synthetic caret span, exactly as the resident
   * button does. Undefined when this deployment composes no trigger pipeline, which is the state
   * that leaves the plate's command entry disabled rather than silently inert.
   * @param caret - the draft offset the menu's token span collapses to.
   * @param draftRev - the draft revision that offset was read at, for the pick-time compare.
   * @param leading - whether the trimmed draft is empty, which the pipeline reads as token position.
   */
  openCommandMenu: ((caret: number, draftRev: number, leading: boolean) => void) | undefined
  /** Path discovery, or undefined when neither scope is available in this deployment. */
  browse: AssetBrowse | undefined
  /**
   * Hand device files to this session's composer through the attachment seat's own add path.
   * @param files - the chosen files.
   * @returns true when an attachment seat was mounted to receive them.
   */
  attachDeviceFiles: (files: readonly File[]) => boolean
}

/** Injected share of the draft attachment preview seat. */
export interface AttachmentPreviewInjected {
  hooks: {
    /** The same bound scope the plate reads; the preview follows `previewDensity` and `previewDetails`. */
    addAssetsSettings: SettingsScope<AddAssetsSettings>
  }
  /**
   * Publish this session's image intake for the plate's device-upload entry.
   * @param sessionId - the session this seat is mounted for.
   * @param add - the composer's own validating add path.
   * @returns a disposer withdrawing the publication.
   */
  publishIntake: (sessionId: string, add: (files: readonly File[]) => void) => () => void
}

/** Injected share of the settings card. */
export interface AddAssetsSettingsInjected {
  hooks: {
    /** The bound `add-assets` settings scope. */
    addAssetsSettings: SettingsScope<AddAssetsSettings>
  }
  /**
   * Store one field of the `add-assets` section; the bound scope owns revision fencing.
   * @param field - the field name inside the namespace.
   * @param value - the JSON-shaped value the control produced.
   * @returns settlement after the write.
   */
  setField: (field: string, value: unknown) => Promise<void>
}
