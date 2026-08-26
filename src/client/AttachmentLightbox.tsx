/**
 * Full-viewport preview of one pending attachment, with the rest of the draft reachable from it.
 *
 * Paging inside the preview is what separates this from opening one image: a person who attached
 * five screenshots checks all five without closing and reopening, and can remove the wrong one
 * without leaving the surface.
 * @module @achasoft/dsh-add-assets/client/AttachmentLightbox
 */

import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './AttachmentLightbox.module.css'

/** One previewable item, already resolved to display values by the owner. */
export interface LightboxItem {
  /** Stable identity for the React key and the remove callback. */
  readonly id: string
  /** Object URL of the original bytes. */
  readonly src: string
  /** Display name, with the owner's fallback applied. */
  readonly name: string
  /** Details line under the name, or `''` when nothing is known yet. */
  readonly details: string
}

/** Strings the owner resolves from its own dictionary; this component holds no locale of its own. */
export interface LightboxLabels {
  readonly close: string
  readonly previous: string
  readonly next: string
  /** Position readout, already interpolated (`Image 2 of 5`). */
  readonly position: string
  /** Accessible label of the remove control, already interpolated with the item's name. */
  readonly remove: string
}

/** Props of the attachment lightbox. */
export interface AttachmentLightboxProps {
  /** Every pending attachment, so paging stays inside the draft. */
  items: readonly LightboxItem[]
  /** Index of the item being shown; the owner keeps it inside `items`. */
  index: number
  /** Resolved copy for this render. */
  labels: LightboxLabels
  /** Show the item at another index. */
  onNavigate: (index: number) => void
  /** Remove the shown item from the draft. */
  onRemove: (id: string) => void
  /** Escape, the mask, or the close control. */
  onClose: () => void
}

/**
 * Render the preview overlay.
 * @param props - the items, the shown index, resolved copy, and the three callbacks.
 * @returns the portalled overlay, or null when the index names no item.
 */
export function AttachmentLightbox({
  items, index, labels, onNavigate, onRemove, onClose,
}: AttachmentLightboxProps) {
  const item = items[index]
  const opener = useRef<Element | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Captured before the overlay takes focus, restored on unmount: the thumbnail the user opened
  // from is where the keyboard should come back to.
  useEffect(() => {
    opener.current = document.activeElement
    closeRef.current?.focus()
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [])

  const step = useCallback((delta: number): void => {
    if (items.length < 2) return
    onNavigate((index + delta + items.length) % items.length)
  }, [index, items.length, onNavigate])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      switch (event.key) {
        case 'Escape': event.preventDefault(); onClose(); return
        case 'ArrowLeft': event.preventDefault(); step(-1); return
        case 'ArrowRight': event.preventDefault(); step(1); return
        default:
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose, step])

  if (item === undefined) return null

  return createPortal((
    <div className={css.root} role="presentation">
      <div className={css.mask} aria-hidden onClick={onClose} />
      <div className={css.stage} role="dialog" aria-modal="true" aria-label={item.name}>
        <div className={css.bar}>
          <span className={css.name}>{item.name}</span>
          {item.details === '' ? null : <span className={css.details}>{item.details}</span>}
          <button
            type="button"
            className={css.action}
            aria-label={labels.remove}
            onClick={() => { onRemove(item.id) }}
          >
            <IconTrashOutline16 />
          </button>
          <button ref={closeRef} type="button" className={css.action} aria-label={labels.close} onClick={onClose}>
            <IconCloseOutline16 />
          </button>
        </div>
        <div className={css.frame}>
          {items.length > 1 && (
            <button type="button" className={css.pageLeft} aria-label={labels.previous} onClick={() => { step(-1) }}>
              <IconChevronLeftOutline14 />
            </button>
          )}
          <img className={css.image} src={item.src} alt={item.name} />
          {items.length > 1 && (
            <button type="button" className={css.pageRight} aria-label={labels.next} onClick={() => { step(1) }}>
              <IconChevronRightOutline14 />
            </button>
          )}
        </div>
        {items.length > 1 ? <span className={css.position}>{labels.position}</span> : null}
      </div>
    </div>
  ), document.body)
}
