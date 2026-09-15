import { describe, expect, it, vi } from 'vitest'
import {
  attachmentsOwner, detectEnd, plateLocked, uploadStateOf,
} from '../src/client/composer-state.ts'
import type { DraftAttachment } from '../src/client/composer-state.ts'

/** A stand-in File carrying only what the preview reads. */
function file(name: string, size = 10, type = ''): File {
  return { name, size, type } as File
}

describe('plateLocked', () => {
  it('reads the session kit flag, not an owner share', () => {
    // The installed seat passes `{}` as its owner share; the flag comes from `useSession`.
    expect(plateLocked(false, 'plain')).toBe(false)
    expect(plateLocked(true, 'plain')).toBe(true)
  })

  it('treats a snapshot the kit has not resolved as unlocked rather than throwing', () => {
    expect(plateLocked(undefined, 'plain')).toBe(false)
    expect(plateLocked(undefined, 'claimed')).toBe(false)
  })

  it('locks while the machine adjudicates or submits', () => {
    expect(plateLocked(false, 'adjudicating')).toBe(true)
    expect(plateLocked(false, 'submitting')).toBe(true)
  })
})

describe('detectEnd', () => {
  it('is the draft length while the draft holds no chip', () => {
    expect(detectEnd('', [])).toBe(0)
    expect(detectEnd('hello ', undefined)).toBe(6)
  })

  it('counts each chip as the one placeholder the editor measures it as', () => {
    // `@src/a.ts ` in the clipboard projection is `￼ ` in the detect projection.
    const draft = 'see @src/a.ts and @lib/ '
    const occurrences = [{ length: '@src/a.ts'.length }, { length: '@lib/'.length }]
    expect(detectEnd(draft, occurrences)).toBe('see ￼ and ￼ '.length)
  })

  it('never answers a negative offset for an inconsistent snapshot', () => {
    expect(detectEnd('', [{ length: 9 }])).toBe(0)
  })
})

describe('attachmentsOwner', () => {
  it('reads the installed callbacks', () => {
    const onAddFiles = vi.fn()
    const onRemoveAttachment = vi.fn()
    const onRetryFile = vi.fn()
    const owner = attachmentsOwner({
      attachments: [], canAcceptDrop: true, onAddFiles, onRemoveAttachment, onRetryFile, uploads: {},
    })
    expect(owner.canAcceptDrop).toBe(true)
    expect(owner.addFiles).toBe(onAddFiles)
    owner.removeAttachment('d1')
    expect(onRemoveAttachment).toHaveBeenCalledExactlyOnceWith('d1')
    expect(owner.retryFile).toBe(onRetryFile)
  })

  it('falls back to the checkout spelling', () => {
    const onAddImages = vi.fn()
    const onRemoveImage = vi.fn()
    const owner = attachmentsOwner({ attachments: [], canAcceptDrop: true, onAddImages, onRemoveImage })
    expect(owner.addFiles).toBe(onAddImages)
    owner.removeAttachment('d1')
    expect(onRemoveImage).toHaveBeenCalledExactlyOnceWith('d1')
    expect(owner.uploads).toEqual({})
    expect(owner.retryFile).toBeUndefined()
  })

  it('refuses drops, and removes nothing, when the owner supplies no callbacks', () => {
    const owner = attachmentsOwner({ canAcceptDrop: true })
    expect(owner.attachments).toEqual([])
    expect(owner.canAcceptDrop).toBe(false)
    expect(owner.addFiles).toBeUndefined()
    expect(() => { owner.removeAttachment('d1') }).not.toThrow()
  })
})

describe('uploadStateOf', () => {
  const image: DraftAttachment = { kind: 'image', id: 'i', file: file('a.png'), previewUrl: 'blob:a' }
  const legacyImage: DraftAttachment = { id: 'l', file: file('b.png'), previewUrl: 'blob:b' }
  const pending: DraftAttachment = { kind: 'file', id: 'f', file: file('notes.pdf') }

  it('has no upload state for an image, in either spelling', () => {
    expect(uploadStateOf(image, {})).toBeUndefined()
    expect(uploadStateOf(legacyImage, {})).toBeUndefined()
  })

  it('reads a file with no recorded upload as uploading', () => {
    expect(uploadStateOf(pending, {})).toBe('uploading')
  })

  it('reports the recorded state of a file', () => {
    expect(uploadStateOf(pending, { f: { status: 'error', message: 'boom' } })).toBe('error')
    expect(uploadStateOf(pending, { f: { status: 'ready' } })).toBe('ready')
  })
})
