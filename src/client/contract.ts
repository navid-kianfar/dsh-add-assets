/**
 * The injected shares of this plugin's three registrations, and the small faces they carry.
 * @module @achasoft/dsh-add-assets/client/contract
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { ReferenceInsert, TokenSpan } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
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

/** The picker's data face: whether project discovery exists, and how to list one level of a scope. */
export interface AssetBrowse {
  /**
   * Whether this fiber can reach project discovery — fixed for the fiber's life, since the curated
   * namespace is injected or not. Which scopes are OFFERED is not decided here: machine browsing
   * follows a setting that can change while the seat is mounted, so the plate derives the roster
   * from the live settings value (see `availableScopes`).
   */
  readonly project: boolean
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
  /** Path discovery; the plate disables its workspace rows while no scope is available. */
  browse: AssetBrowse
  /**
   * Place one path in the draft as an inline reference occurrence: the draft carries a short label
   * the composer renders as a glyph chip, while the full `@path` rides along as the occurrence's
   * hidden serialized form and is what reaches the model.
   *
   * Undefined when this deployment composes no trigger pipeline — occurrences are serialized
   * through a registered source's codec, so without one the picker falls back to writing the plain
   * `@path` text a person could have typed.
   * @param reference - the label, the hidden ref, and the glyph domain.
   * @param span - where to place it, fenced with the draft revision it was read at.
   * @returns true when the machine applied it; false when the revision moved first.
   */
  insertReference: ((reference: ReferenceInsert, span: TokenSpan) => boolean) | undefined
  /**
   * Insert plain text over a span through the scoped `slash/input-insert-text` event — the same
   * span-checked verb a trigger source's text outcome uses.
   *
   * The plate needs it for the one space that keeps a reference from welding onto the preceding
   * word. `inputActions.setDraft` cannot do that job on the installed harness: it rebuilds the whole
   * editor document from plain text, which flattens every chip already in the draft back into its
   * `@path` text.
   *
   * Undefined when the session scope cannot be resolved; the plate then places the reference
   * without the space rather than rewriting the draft.
   * @param text - the text to insert.
   * @param span - where to insert it, in detect coordinates, fenced with the draft revision.
   * @returns true when the editor applied it.
   */
  insertText: ((text: string, span: TokenSpan) => boolean) | undefined
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
