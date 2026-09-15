/**
 * The `add-assets` settings section and the Host browse endpoint's wire types, shared by both
 * halves: the Host owns the schema and the storage, the browser card edits it, and the composer
 * surfaces read it through the bound scope.
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
  /**
   * Let the picker browse the Host filesystem outside the session's working directory.
   *
   * The file-reference provider refuses every path outside that directory, so reaching one at all
   * means this plugin's own endpoint listing entry NAMES anywhere the Host account can read. It
   * opens no file.
   *
   * This is a PREFERENCE, not a security boundary. Like every field here it can be changed from the
   * browser's settings card, and the person on the other side of that browser is the authenticated
   * operator whose agent can already run shell commands on the Host. A composition value of false
   * sets the default a person starts from; it does not withhold anything from them. A deployment
   * that must not expose the directory tree to its browser users must not compose this plugin — or
   * a shell-capable agent — for them.
   */
  outsideWorkspace: boolean
  /**
   * Entries the Host reports per browsed level before reporting the listing as truncated. The
   * schema caps it (see `limits`) because it bounds the Host's memory and work per request, and a
   * browser settings write must not be able to lift that.
   */
  browseMaxEntries: number
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

/** One jump target in a browsed path's ancestry. */
export interface AssetCrumb {
  /** Display text: the path segment, or the filesystem root for the first crumb. */
  readonly name: string
  /** Absolute path this crumb navigates to. */
  readonly path: string
}

/** One entry of a browsed Host directory. */
export interface AssetEntry {
  /** Basename, which is what a picker row shows. */
  readonly name: string
  /** Absolute path on the Host. */
  readonly path: string
  /** Symlinks are reported as whatever they resolve to; unresolvable ones are omitted entirely. */
  readonly kind: 'file' | 'directory'
  /** Dot-prefixed name. The Host reports these and the browser decides whether to show them. */
  readonly hidden: boolean
}

/** One listed level of the Host filesystem. */
export interface AssetListing {
  /** Absolute path of the listed directory. */
  readonly path: string
  /** The Host account's home directory, so the browser can root a "Home" crumb. */
  readonly home: string
  /** Ancestor chain from the filesystem root to {@link AssetListing.path} inclusive. */
  readonly crumbs: readonly AssetCrumb[]
  /** Directories first, then files, each name-sorted. */
  readonly entries: readonly AssetEntry[]
  /** True when the level had more matching entries than the configured cap reported. */
  readonly truncated: boolean
}

/** Settled result of one browse call; failures are values, not exceptions. */
export type AssetBrowseResult =
  | { readonly ok: true; readonly listing: AssetListing }
  | {
    readonly ok: false
    /** `disabled`: the deployment turned outside-workspace browsing off. */
    readonly code: 'disabled' | 'not-a-directory' | 'unreadable'
    readonly message: string
  }
