/**
 * The injected shares of this plugin's three registrations, and the small faces they carry.
 * @module @achasoft/dsh-add-assets/client/contract
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference/types'
import type { AddAssetsSettings } from '../host/types.ts'

/** What the plate's two workspace entries need from the Host's file-reference discovery. */
export interface WorkspaceBrowse {
  /**
   * List path candidates for one discovery query.
   * @param query - path text as it would follow `@`: a query containing `/` lists the directory
   *   before the last one, filtered by whatever follows it; a query without one fuzzy-searches the
   *   whole workspace index.
   * @param signal - aborts the wire call when a newer query supersedes this one.
   * @returns the candidates, or an empty list when the Host answered with a failure.
   */
  list(query: string, signal: AbortSignal): Promise<readonly FileReferenceCandidate[]>
}

/** Which of the plate's two workspace entries the picker was opened for. */
export type PickerMode = 'files' | 'folders'

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
  /** Workspace discovery, or undefined when no Host file-reference provider is mounted. */
  browse: WorkspaceBrowse | undefined
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
