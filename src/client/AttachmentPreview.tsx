/**
 * The draft attachment preview: one card per pending image or file, the document drop target that
 * adds more, and the full-size preview behind an image card.
 *
 * Referenced PATHS are not shown here: they ride the draft as inline reference chips the composer
 * itself renders, so a second surface for them would state the same thing twice.
 *
 * It occupies `conversation.input.attachments`, which is a single seat — taking it means owning the
 * drop handling too, since the entry it shadows was the one holding those document listeners.
 * @module @achasoft/dsh-add-assets/client/AttachmentPreview
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { AttachmentLightbox } from './AttachmentLightbox.tsx'
import type { LightboxItem } from './AttachmentLightbox.tsx'
import type { AttachmentPreviewInjected } from './contract.ts'
import { attachmentsOwner, uploadStateOf } from './composer-state.ts'
import type { DraftAttachment, DraftUpload } from './composer-state.ts'
import { FileGlyph } from './Glyphs.tsx'
import { detailsLine, formatBytes, formatDimensions, formatLabel } from './format.ts'
import css from './AttachmentPreview.module.css'

/**
 * Full preview props: the composer's attachment share, the injected settings scope, and the copy.
 *
 * The owner share is read through `attachmentsOwner`, never destructured by name: `PropsRuntime`
 * here spells the build-time checkout's callbacks, and the installed composer renamed them.
 */
export type AttachmentPreviewProps =
  PropsRuntime<'conversation.input.attachments'> & InjectFace<AttachmentPreviewInjected> & PropsLocale<'add-assets'>

/** One image's natural size, once the browser has decoded enough of it to report one. */
interface Dimensions {
  readonly width: number
  readonly height: number
}

/**
 * Read each attachment's natural pixel size.
 *
 * The composer only holds the file and an object URL, so dimensions come from decoding the image
 * the browser has already loaded for the thumbnail. A decode that fails leaves the entry absent,
 * and the details line simply omits that segment.
 * @param attachments - the pending attachments, in draft order.
 * @returns dimensions by attachment id, filled in as decodes settle.
 */
function useDimensions(attachments: readonly DraftAttachment[]): ReadonlyMap<string, Dimensions> {
  const [sizes, setSizes] = useState<ReadonlyMap<string, Dimensions>>(new Map())
  // Probed ids, kept out of state on purpose: they gate the decode, and folding them into `sizes`
  // would make this effect depend on its own result.
  const probed = useRef(new Set<string>())
  useEffect(() => {
    let alive = true
    const live = new Set<string>(attachments.map(attachment => attachment.id))
    for (const id of probed.current) {
      if (!live.has(id)) probed.current.delete(id)
    }
    for (const attachment of attachments) {
      // File drafts have no object URL to decode, and no pixel size to report.
      if (attachment.previewUrl === undefined || probed.current.has(attachment.id)) continue
      probed.current.add(attachment.id)
      const src = attachment.previewUrl
      const probe = new Image()
      probe.onload = () => {
        if (!alive) return
        setSizes(current => new Map(current).set(
          attachment.id,
          { width: probe.naturalWidth, height: probe.naturalHeight },
        ))
      }
      probe.src = src
    }
    setSizes((current) => {
      const kept = [...current].filter(([id]) => live.has(id))
      return kept.length === current.size ? current : new Map(kept)
    })
    return () => { alive = false }
  }, [attachments])
  return sizes
}

/**
 * Track a file drag over the document and report whether the invitation should be showing.
 *
 * The counter is what makes a drag across nested elements one drag: `dragenter`/`dragleave` fire
 * per element, so depth rather than a boolean decides when the pointer has actually left.
 * @param canAcceptDrop - whether the composer would take a drop right now; the overlay still shows
 *   while false, saying so, because an invisible refusal reads as a broken page.
 * @param onAddFiles - the composer's own validating add path; undefined refuses every drop.
 * @returns whether a file drag is currently over the document.
 */
function useFileDrag(canAcceptDrop: boolean, onAddFiles: ((files: readonly File[]) => void) | undefined): boolean {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  useEffect(() => {
    const fileTransfer = (event: DragEvent): DataTransfer | null => {
      const transfer = event.dataTransfer
      return transfer === null || !transfer.types.includes('Files') ? null : transfer
    }
    const reset = (): void => {
      depth.current = 0
      setDragging(false)
    }
    const onDragEnter = (event: DragEvent): void => {
      if (fileTransfer(event) === null) return
      event.preventDefault()
      depth.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent): void => {
      const transfer = fileTransfer(event)
      if (transfer === null) return
      // Preventing the default is what stops the browser from navigating to the dropped file.
      event.preventDefault()
      transfer.dropEffect = canAcceptDrop ? 'copy' : 'none'
    }
    const onDragLeave = (event: DragEvent): void => {
      if (fileTransfer(event) === null) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
      // A drag that leaves through the window edge can skip the balancing leave events entirely.
      const outside = event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      if ((event.target === document.documentElement || event.target === document.body) && outside) reset()
    }
    const onDrop = (event: DragEvent): void => {
      const transfer = fileTransfer(event)
      if (transfer === null) return
      event.preventDefault()
      reset()
      if (canAcceptDrop) onAddFiles?.([...transfer.files])
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [canAcceptDrop, onAddFiles])
  return dragging
}

/** One rendered card: the attachment, its display text, and — for a file — its upload state. */
interface CardItem extends LightboxItem {
  readonly attachment: DraftAttachment
  /** Undefined for an image; a file's upload state otherwise. */
  readonly upload: DraftUpload['status'] | undefined
}

/**
 * Render the composer's pending attachments.
 * @param props - the composer's attachment share, the injected scope and intake publisher, and the
 * namespace-bound translate.
 * @returns the card row, the drop invitation while a file drag is live, and the open preview.
 */
export function AttachmentPreview(props: AttachmentPreviewProps) {
  const { sessionId, useAddAssetsSettings, publishIntake, t } = props
  const {
    attachments, canAcceptDrop, addFiles, removeAttachment, uploads, retryFile, dropLimits,
  } = attachmentsOwner(props)
  const settings = useAddAssetsSettings(snapshot => snapshot.value)
  const [openId, setOpenId] = useState<string | null>(null)
  const sizes = useDimensions(attachments)
  const dragging = useFileDrag(canAcceptDrop, addFiles)

  // The plate's device-upload entry has no other way to reach the composer's intake; this seat is
  // the only holder of it. See the intake module for why the channel exists.
  useEffect(() => {
    if (sessionId === undefined || addFiles === undefined) return undefined
    return publishIntake(sessionId, addFiles)
  }, [addFiles, publishIntake, sessionId])

  const compact = settings?.previewDensity === 'compact'
  const withDetails = settings?.previewDetails !== false && !compact

  const items = useMemo<readonly CardItem[]>(
    () => attachments.map((attachment) => {
      const upload = uploadStateOf(attachment, uploads)
      const isFile = attachment.kind === 'file'
      const fallback = isFile ? t('attachment.file') : t('attachment.pending')
      const name = attachment.file.name === '' ? fallback : attachment.file.name
      const size = sizes.get(attachment.id)
      // A file's upload is the one fact about it that can still go wrong before sending, so while it
      // is unsettled the details line says that instead of the format and size.
      const details = upload === 'uploading'
        ? t('attachment.uploading')
        : upload === 'error'
          ? t('attachment.uploadFailed')
          : detailsLine([
            formatLabel(attachment.file.name, attachment.file.type) ?? (isFile ? t('attachment.file') : t('attachment.image')),
            size === undefined ? undefined : formatDimensions(size.width, size.height),
            formatBytes(attachment.file.size),
          ])
      return { id: attachment.id, src: attachment.previewUrl ?? '', name, details, attachment, upload }
    }),
    [attachments, sizes, t, uploads],
  )

  // Only images page through the full-size preview; a file card has nothing to show there.
  const images = useMemo(() => items.filter(item => item.attachment.previewUrl !== undefined), [items])
  const openIndex = images.findIndex(item => item.id === openId)
  // A preview whose attachment was removed — from inside the preview, or by another surface —
  // closes rather than showing a released object URL.
  useEffect(() => {
    if (openId !== null && !attachments.some(attachment => attachment.id === openId)) setOpenId(null)
  }, [attachments, openId])

  // Removing from inside the preview keeps the preview open on what is left, which is the whole
  // reason to page through attachments there; only the last removal closes it.
  const remove = useCallback((id: string): void => {
    const at = images.findIndex(candidate => candidate.id === id)
    if (at < 0) return
    const survivor = images[at + 1] ?? images[at - 1]
    setOpenId(survivor?.id ?? null)
    removeAttachment(id)
  }, [images, removeAttachment])

  return (
    <>
      {dragging && (
        <div className={css.dropRoot} role="presentation">
          <div className={css.dropMask} aria-hidden />
          <div className={canAcceptDrop ? css.dropCard : css.dropCardBlocked} role="status">
            <span className={css.dropTitle}>
              {t(canAcceptDrop ? 'attachment.drop.title' : 'attachment.drop.blocked')}
            </span>
            {canAcceptDrop && dropLimits !== undefined ? (
              <span className={css.dropLimits}>
                {t('attachment.drop.limits', { count: dropLimits.count, size: dropLimits.size })}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {items.length === 0 ? null : (
        <ul className={compact ? css.railCompact : css.rail} aria-label={t('attachment.group')}>
          {items.map((item) => {
            const failed = item.upload === 'error'
            // An unsettled upload is shown even in the compact and details-off forms: it is state the
            // person has to act on, not a detail they chose to hide.
            const detailsShown = item.upload === 'uploading' || failed || withDetails
            const meta = (
              <span className={css.meta}>
                <span className={css.name}>{item.name}</span>
                {detailsShown && item.details !== ''
                  ? <span className={failed ? css.detailsFailed : css.details}>{item.details}</span>
                  : null}
              </span>
            )
            const glyph = (
              <span className={compact ? css.glyphCompact : css.glyph} aria-hidden>
                <FileGlyph size={compact ? 12 : 18} />
              </span>
            )
            return (
              <li key={item.id} className={compact ? css.chip : css.card}>
                {item.upload === undefined ? (
                  <button
                    type="button"
                    className={css.body}
                    title={t('attachment.open')}
                    onClick={() => { setOpenId(item.id) }}
                  >
                    <img className={compact ? css.thumbCompact : css.thumb} src={item.src} alt={item.name} />
                    {meta}
                  </button>
                ) : failed && retryFile !== undefined ? (
                  <button
                    type="button"
                    className={css.body}
                    aria-label={t('attachment.retry', { name: item.name })}
                    onClick={() => { retryFile(item.id) }}
                  >
                    {glyph}
                    {meta}
                  </button>
                ) : (
                  <span className={css.fileBody} title={item.name}>
                    {glyph}
                    {meta}
                  </span>
                )}
                <button
                  type="button"
                  className={css.remove}
                  aria-label={t('attachment.remove', { name: item.name })}
                  onClick={() => { removeAttachment(item.id) }}
                >
                  <IconCloseFill14 />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {openIndex < 0 ? null : (
        <AttachmentLightbox
          items={images}
          index={openIndex}
          labels={{
            close: t('lightbox.close'),
            previous: t('lightbox.previous'),
            next: t('lightbox.next'),
            position: t('lightbox.position', { index: openIndex + 1, total: images.length }),
            remove: t('attachment.remove', { name: images[openIndex]?.name ?? '' }),
          }}
          onNavigate={(next) => { setOpenId(images[next]?.id ?? null) }}
          onRemove={remove}
          onClose={() => { setOpenId(null) }}
        />
      )}
    </>
  )
}
