import { describe, expect, it } from 'vitest'
import { detailsLine, formatBytes, formatDimensions, formatLabel } from '../src/client/format.ts'

describe('formatBytes', () => {
  it('keeps bytes whole below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0B')
    expect(formatBytes(812)).toBe('812B')
    expect(formatBytes(1023)).toBe('1023B')
  })

  it('steps up in binary units', () => {
    expect(formatBytes(1024)).toBe('1.0KB')
    expect(formatBytes(240 * 1024)).toBe('240KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0MB')
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1.3MB')
    expect(formatBytes(12 * 1024 * 1024 * 1024)).toBe('12GB')
  })

  it('reads an impossible size as nothing rather than NaN', () => {
    expect(formatBytes(Number.NaN)).toBe('0B')
    expect(formatBytes(-5)).toBe('0B')
  })
})

describe('formatDimensions', () => {
  it('writes width by height', () => {
    expect(formatDimensions(1024, 768)).toBe('1024×768')
  })
})

describe('formatLabel', () => {
  it('prefers the name the user gave the file', () => {
    expect(formatLabel('photo.jpg', 'image/jpeg')).toBe('JPG')
    expect(formatLabel('shot.PNG', 'image/png')).toBe('PNG')
  })

  it('falls back to the declared type when the name carries no extension', () => {
    expect(formatLabel('clipboard', 'image/webp')).toBe('WEBP')
    expect(formatLabel('', 'image/png')).toBe('PNG')
  })

  it('answers nothing when neither source names a format', () => {
    expect(formatLabel('clipboard', '')).toBeUndefined()
    expect(formatLabel('archive.verylongextension', '')).toBeUndefined()
  })
})

describe('detailsLine', () => {
  it('joins what is known and drops what is not', () => {
    expect(detailsLine(['PNG', '1024×768', '240KB'])).toBe('PNG · 1024×768 · 240KB')
    expect(detailsLine(['PNG', undefined, '240KB'])).toBe('PNG · 240KB')
    expect(detailsLine([undefined, '', undefined])).toBe('')
  })
})
