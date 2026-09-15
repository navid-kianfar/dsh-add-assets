/**
 * The composer facts this plugin's two seats derive, kept out of the components so they can be
 * tested against the shapes the INSTALLED harness actually hands a seat.
 *
 * Why this module exists: the package type-checks against a harness checkout, and the harness it
 * runs in is a later release whose composer contract moved underneath it. Three moves broke the
 * seats at render time while `tsc` stayed green:
 *
 * - `conversation.input.left` lost its owner share. The installed composer renders the seat with
 *   `renderSlot('conversation.input.left', {})` (`@deepseek-ai/dsh-client-ui-conversation`
 *   0.1.5-rc.2, `lib/client.js`), so an occupant reading `session` off its props read undefined.
 *   Session lifecycle now arrives through the session standard kit's `useSession` selector
 *   (`@deepseek-ai/dsh-client-ui-session`, `SessionStandardProps`).
 * - `conversation.input.attachments` renamed its callbacks (`onAddImages` → `onAddFiles`,
 *   `onRemoveImage` → `onRemoveAttachment`) and started carrying generic files beside images:
 *   `attachments` is a `kind`-tagged union, and file drafts upload on pick with their progress in
 *   `uploads` and a retry in `onRetryFile`.
 * - The draft moved from a textarea into a Lexical editor, and the spans the input verbs accept
 *   are measured in its DETECT projection, where a reference chip is one placeholder character —
 *   not in the clipboard projection `InputState.draft` spells out, where the same chip is its
 *   whole `@path`.
 *
 * Every read here is structural and tolerates the older spelling, so the package keeps compiling
 * against the checkout it builds with while behaving correctly in the harness that loads it.
 * @module @achasoft/dsh-add-assets/client/composer-state
 */

/** The input machine's submit-plane phase, as `InputState.phase` spells it in both harnesses. */
export type InputPhase = 'plain' | 'adjudicating' | 'claimed' | 'submitting'

/**
 * Whether the plate must refuse every action.
 *
 * The machine refuses writes while a submission is being adjudicated or sent, and a removed session
 * accepts nothing at all; either makes every plate action a write that would be rejected.
 * @param removed - the session's `removed` flag from the session kit's `useSession`; undefined while
 *   the kit has not resolved a snapshot, which reads as "not removed" rather than locking the plate.
 * @param phase - the input machine's current phase.
 * @returns true when the plate should be disabled.
 */
export function plateLocked(removed: boolean | undefined, phase: InputPhase): boolean {
  return removed === true || phase === 'adjudicating' || phase === 'submitting'
}

/** The part of one reference occurrence the span arithmetic needs. */
export interface OccurrenceExtent {
  /** Length of the occurrence in the clipboard projection — its full `@path` text. */
  readonly length: number
}

/**
 * The end of the draft in the editor's detect coordinates.
 *
 * `InputState.draft` is the clipboard projection, in which each chip is expanded to its clipboard
 * text; the editor's span-checked verbs (`insertReference`, the scoped `slash/input-insert-text`
 * event, a trigger source's synthetic hit) measure in the detect projection, in which each chip is
 * a single placeholder. A span at `draft.length` therefore points past the end of the document as
 * soon as the draft holds one chip, and the editor refuses it — which is what silently dropped
 * every path after the first when several were picked at once.
 * @param draft - the clipboard projection of the draft.
 * @param occurrences - the chips in the draft; absent reads as none.
 * @returns the collapsed end-of-draft offset the editor's verbs accept.
 */
export function detectEnd(draft: string, occurrences: readonly OccurrenceExtent[] | undefined): number {
  let end = draft.length
  for (const occurrence of occurrences ?? []) end -= Math.max(0, occurrence.length - 1)
  return Math.max(0, end)
}

/** One pending draft attachment, read structurally across both harness spellings. */
export interface DraftAttachment {
  /** `file` for a generic file draft; an image draft carries `image`, or nothing in older builds. */
  readonly kind?: 'image' | 'file'
  readonly id: string
  readonly file: File
  /** Object URL of an image draft; file drafts have none. */
  readonly previewUrl?: string
}

/** Upload lifecycle of one file draft, as the installed composer publishes it. */
export type DraftUpload =
  | { readonly status: 'uploading'; readonly loaded: number; readonly total?: number }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string }

/** The attachment seat's owner share, normalized to the installed harness's vocabulary. */
export interface AttachmentsOwner {
  readonly attachments: readonly DraftAttachment[]
  /** Whether a document-level drop may add attachments now; false when no add path exists. */
  readonly canAcceptDrop: boolean
  /** The composer's validating add path, or undefined when the owner supplied none. */
  readonly addFiles: ((files: readonly File[]) => void) | undefined
  /** Remove one draft; a no-op when the owner supplied no remover. */
  readonly removeAttachment: (id: string) => void
  /** Upload states of file drafts, keyed by draft id. */
  readonly uploads: Readonly<Record<string, DraftUpload>>
  /** Restart one failed upload, or undefined when this composer cannot. */
  readonly retryFile: ((id: string) => void) | undefined
  readonly dropLimits: { readonly count: number; readonly size: string } | undefined
}

/**
 * Read the attachment seat's owner share from a component's props.
 *
 * The installed spelling wins; the older one is the fallback the package's build-time checkout
 * still declares. A share with no add path at all reports `canAcceptDrop: false`, so the drop target
 * says a drop is refused instead of calling something that is not there.
 * @param props - the seat component's full props.
 * @returns the normalized share.
 */
export function attachmentsOwner(props: object): AttachmentsOwner {
  const share = props as {
    readonly attachments?: readonly DraftAttachment[]
    readonly canAcceptDrop?: boolean
    readonly onAddFiles?: (files: readonly File[]) => void
    readonly onAddImages?: (files: readonly File[]) => void
    readonly onRemoveAttachment?: (id: string) => void
    readonly onRemoveImage?: (id: string) => void
    readonly uploads?: Readonly<Record<string, DraftUpload>>
    readonly onRetryFile?: (id: string) => void
    readonly dropLimits?: { readonly count: number; readonly size: string }
  }
  const addFiles = share.onAddFiles ?? share.onAddImages
  const remove = share.onRemoveAttachment ?? share.onRemoveImage
  return {
    attachments: share.attachments ?? [],
    canAcceptDrop: share.canAcceptDrop === true && addFiles !== undefined,
    addFiles,
    removeAttachment: id => { remove?.(id) },
    uploads: share.uploads ?? {},
    retryFile: share.onRetryFile,
    dropLimits: share.dropLimits,
  }
}

/**
 * What a file draft's card should say about its upload.
 * @param attachment - the draft.
 * @param uploads - the owner's upload states.
 * @returns undefined for an image draft; otherwise the upload state, where an unrecorded file reads
 *   as uploading — the composer starts the upload on pick, before its first progress event lands.
 */
export function uploadStateOf(
  attachment: DraftAttachment,
  uploads: Readonly<Record<string, DraftUpload>>,
): DraftUpload['status'] | undefined {
  if (attachment.kind !== 'file') return undefined
  return uploads[attachment.id]?.status ?? 'uploading'
}
