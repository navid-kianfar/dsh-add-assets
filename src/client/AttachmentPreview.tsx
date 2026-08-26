/**
 * The draft attachment preview: one card per pending image, the document drop target that adds
 * more, and the full-size preview behind a card.
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
import type { ComposerAttachment } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { AttachmentLightbox } from './AttachmentLightbox.tsx'
import type { LightboxItem } from './AttachmentLightbox.tsx'
import type { AttachmentPreviewInjected } from './contract.ts'
import { detailsLine, formatBytes, formatDimensions, formatLabel } from './format.ts'
import css from './AttachmentPreview.module.css'

/** Full preview props: the composer's attachment share, the injected settings scope, and the copy. */
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
function useDimensions(attachments: readonly ComposerAttachment[]): ReadonlyMap<string, Dimensions> {
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
      if (probed.current.has(attachment.id)) continue
      probed.current.add(attachment.id)
      const probe = new Image()
      probe.onload = () => {
        if (!alive) return
        setSizes(current => new Map(current).set(
          attachment.id,
          { width: probe.naturalWidth, height: probe.naturalHeight },
        ))
      }
      probe.src = attachment.previewUrl
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
 * @param onAddImages - the composer's own validating add path.
 * @returns whether a file drag is currently over the document.
 */
function useFileDrag(canAcceptDrop: boolean, onAddImages: (files: readonly File[]) => void): boolean {
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
      if (canAcceptDrop) onAddImages([...transfer.files])
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
  }, [canAcceptDrop, onAddImages])
  return dragging
}

/**
 * Render the composer's pending attachments.
 * @param props - the composer's attachment share, the injected scope and intake publisher, and the
 * namespace-bound translate.
 * @returns the card row, the drop invitation while a file drag is live, and the open preview.
 */
export function AttachmentPreview({
  attachments, canAcceptDrop, onAddImages, onRemoveImage, dropLimits,
  sessionId, useAddAssetsSettings, publishIntake, t,
}: AttachmentPreviewProps) {
  const settings = useAddAssetsSettings(snapshot => snapshot.value)
  const [openId, setOpenId] = useState<string | null>(null)
  const sizes = useDimensions(attachments)
  const dragging = useFileDrag(canAcceptDrop, onAddImages)

  // The plate's device-upload entry has no other way to reach the composer's image intake; this
  // seat is the only holder of it. See the intake module for why the channel exists.
  useEffect(() => {
    if (sessionId === undefined) return undefined
    return publishIntake(sessionId, onAddImages)
  }, [onAddImages, publishIntake, sessionId])

  const compact = settings?.previewDensity === 'compact'
  const withDetails = settings?.previewDetails !== false && !compact

  const items = useMemo<readonly (LightboxItem & { attachment: ComposerAttachment })[]>(
    () => attachments.map((attachment) => {
      const name = attachment.file.name === '' ? t('attachment.pending') : attachment.file.name
      const size = sizes.get(attachment.id)
      return {
        id: attachment.id,
        src: attachment.previewUrl,
        name,
        details: detailsLine([
          formatLabel(attachment.file.name, attachment.file.type) ?? t('attachment.image'),
          size === undefined ? undefined : formatDimensions(size.width, size.height),
          formatBytes(attachment.file.size),
        ]),
        attachment,
      }
    }),
    [attachments, sizes, t],
  )

  const openIndex = items.findIndex(item => item.id === openId)
  // A preview whose attachment was removed — from inside the preview, or by another surface —
  // closes rather than showing a released object URL.
  useEffect(() => {
    if (openId !== null && !attachments.some(attachment => attachment.id === openId)) setOpenId(null)
  }, [attachments, openId])

  // Removing from inside the preview keeps the preview open on what is left, which is the whole
  // reason to page through attachments there; only the last removal closes it.
  const remove = useCallback((id: string): void => {
    const at = attachments.findIndex(candidate => candidate.id === id)
    if (at < 0) return
    const survivor = attachments[at + 1] ?? attachments[at - 1]
    setOpenId(survivor?.id ?? null)
    onRemoveImage(attachments[at]!.id)
  }, [attachments, onRemoveImage])

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
          {items.map(item => (
            <li key={item.id} className={compact ? css.chip : css.card}>
              <button
                type="button"
                className={css.body}
                title={t('attachment.open')}
                onClick={() => { setOpenId(item.id) }}
              >
                <img className={compact ? css.thumbCompact : css.thumb} src={item.src} alt={item.name} />
                <span className={css.meta}>
                  <span className={css.name}>{item.name}</span>
                  {withDetails && item.details !== '' ? <span className={css.details}>{item.details}</span> : null}
                </span>
              </button>
              <button
                type="button"
                className={css.remove}
                aria-label={t('attachment.remove', { name: item.name })}
                onClick={() => { onRemoveImage(item.attachment.id) }}
              >
                <IconCloseFill14 />
              </button>
            </li>
          ))}
        </ul>
      )}

      {openIndex < 0 ? null : (
        <AttachmentLightbox
          items={items}
          index={openIndex}
          labels={{
            close: t('lightbox.close'),
            previous: t('lightbox.previous'),
            next: t('lightbox.next'),
            position: t('lightbox.position', { index: openIndex + 1, total: items.length }),
            remove: t('attachment.remove', { name: items[openIndex]?.name ?? '' }),
          }}
          onNavigate={(next) => { setOpenId(items[next]?.id ?? null) }}
          onRemove={remove}
          onClose={() => { setOpenId(null) }}
        />
      )}
    </>
  )
}
