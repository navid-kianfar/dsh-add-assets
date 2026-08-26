/**
 * The package-internal channel between this plugin's two composer seats.
 *
 * Turning a device file into a draft attachment needs the conversation service's private image
 * registry, which no public client face exposes: the only handle on it is the `onAddImages`
 * callback the composer hands to whoever occupies `conversation.input.attachments`. That seat is
 * this plugin's attachment preview, so it publishes the callback here and the plate — a different
 * seat of the same plugin — reads it when the user picks files from their machine.
 * @module @achasoft/dsh-add-assets/client/intake
 */

/** Registry of the per-session image intake, one instance per client plugin fiber. */
export class ImageIntake {
  private readonly bySession = new Map<string, (files: readonly File[]) => void>()

  /**
   * Publish one session's intake.
   * @param sessionId - the session the attachment seat is mounted for.
   * @param add - the composer's own validating add path.
   * @returns a disposer withdrawing this publication, unless a later one already replaced it.
   */
  publish(sessionId: string, add: (files: readonly File[]) => void): () => void {
    this.bySession.set(sessionId, add)
    return () => {
      if (this.bySession.get(sessionId) === add) this.bySession.delete(sessionId)
    }
  }

  /**
   * Hand files to one session's composer.
   * @param sessionId - the session to attach to.
   * @param files - the chosen files; the composer applies its own media-type and size validation.
   * @returns true when an attachment seat was mounted to receive them.
   */
  add(sessionId: string, files: readonly File[]): boolean {
    const add = this.bySession.get(sessionId)
    if (add === undefined) return false
    add(files)
    return true
  }
}
