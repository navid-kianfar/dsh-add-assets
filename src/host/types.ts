/**
 * The `add-assets` settings section, shared by both halves: the Host owns the schema and the
 * storage, the browser card edits it, and the composer surfaces read it through the bound scope.
 * @module @achasoft/dsh-add-assets/host/types
 */

/** How the draft attachment preview sizes its cards. */
export type PreviewDensity = 'card' | 'compact'

/** Deployment and user preferences for the composer add-assets plate and the attachment preview. */
export interface AddAssetsSettings {
  /**
   * Hide the composer's resident command button so this plugin's plate is the only `+`.
   *
   * The resident button is drawn inside the harness's own InputBar and no slot owns it, so
   * suppression is the only way to keep one `+` in the tool row. False leaves both buttons visible,
   * which is the honest state for a deployment that would rather not have a plugin reach the
   * harness's own chrome.
   */
  replaceCommandButton: boolean
  /**
   * Offer "from this device" in the files entry: a browser file chooser whose images become
   * composer attachments. False leaves paste and drop as the only ways to attach an image.
   */
  deviceUpload: boolean
  /** Chord opening the workspace file picker; empty disables it. See the `shortcut` module's grammar. */
  filesShortcut: string
  /** Chord opening the workspace folder picker; empty disables it. */
  foldersShortcut: string
  /** Chord opening the slash-command menu; empty disables it. */
  commandShortcut: string
  /** Rows the picker renders per query. The Host applies its own lower cap independently. */
  pickerResultLimit: number
  /** Attachment preview card size. */
  previewDensity: PreviewDensity
  /** Show each attachment's byte size and pixel dimensions beneath its name. */
  previewDetails: boolean
}
