import { describe, expect, it } from 'vitest'
import { formatShortcut, matchesShortcut, parseShortcut } from '../src/shortcut.ts'
import type { KeyChord } from '../src/shortcut.ts'

/** One key event's chord-relevant fields, with everything released by default. */
function chord(over: Partial<KeyChord>): KeyChord {
  return { key: 'u', code: 'KeyU', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over }
}

describe('parseShortcut', () => {
  it('reads modifiers and the key, whatever the spelling and case', () => {
    expect(parseShortcut('mod+u')).toEqual({ mod: true, shift: false, alt: false, key: 'u' })
    expect(parseShortcut('MOD+Shift+U')).toEqual({ mod: true, shift: true, alt: false, key: 'u' })
    expect(parseShortcut('cmd+option+k')).toEqual({ mod: true, shift: false, alt: true, key: 'k' })
    expect(parseShortcut('ctrl+/')).toEqual({ mod: true, shift: false, alt: false, key: '/' })
  })

  it('maps named keys onto the values key events report', () => {
    expect(parseShortcut('mod+enter')?.key).toBe('enter')
    expect(parseShortcut('mod+esc')?.key).toBe('escape')
    expect(parseShortcut('mod+space')?.key).toBe(' ')
    expect(parseShortcut('mod+up')?.key).toBe('arrowup')
  })

  it('refuses a chord without mod or alt, which would claim that key in every text field', () => {
    expect(parseShortcut('/')).toBeUndefined()
    expect(parseShortcut('u')).toBeUndefined()
    expect(parseShortcut('enter')).toBeUndefined()
    expect(parseShortcut('+')).toBeUndefined()
    // Shift alone still types: shift+u is a capital U.
    expect(parseShortcut('shift+u')).toBeUndefined()
    expect(parseShortcut('shift+enter')).toBeUndefined()
    expect(parseShortcut('alt+u')).toEqual({ mod: false, shift: false, alt: true, key: 'u' })
  })

  it('refuses text no key event could satisfy', () => {
    expect(parseShortcut('')).toBeUndefined()
    expect(parseShortcut('   ')).toBeUndefined()
    expect(parseShortcut('mod')).toBeUndefined()
    expect(parseShortcut('mod+a+b')).toBeUndefined()
    expect(parseShortcut('mod+notakey')).toBeUndefined()
  })
})

describe('matchesShortcut', () => {
  const modU = parseShortcut('mod+u')!

  it('reads mod as Command on Apple and Control elsewhere', () => {
    expect(matchesShortcut(chord({ metaKey: true }), modU, true)).toBe(true)
    expect(matchesShortcut(chord({ ctrlKey: true }), modU, true)).toBe(false)
    expect(matchesShortcut(chord({ ctrlKey: true }), modU, false)).toBe(true)
    expect(matchesShortcut(chord({ metaKey: true }), modU, false)).toBe(false)
  })

  it('refuses an event carrying the other accelerator, which the textarea owns', () => {
    expect(matchesShortcut(chord({ metaKey: true, ctrlKey: true }), modU, true)).toBe(false)
  })

  it('requires the chord to state every modifier the event carries', () => {
    expect(matchesShortcut(chord({ metaKey: true, shiftKey: true }), modU, true)).toBe(false)
    expect(matchesShortcut(chord({ metaKey: true, altKey: true }), modU, true)).toBe(false)
    expect(matchesShortcut(chord({ metaKey: true, shiftKey: true }), parseShortcut('mod+shift+u')!, true)).toBe(true)
  })

  it('falls back to the physical key when a modifier rewrote the reported one', () => {
    const altU = parseShortcut('mod+alt+u')!
    // macOS reports the dead-key diacritic for Option+U rather than "u".
    expect(matchesShortcut(chord({ key: '¨', metaKey: true, altKey: true }), altU, true)).toBe(true)
  })

  it('does not reach for a physical key when the chord names a word', () => {
    expect(matchesShortcut(chord({ key: 'x', code: 'Enter', metaKey: true }), parseShortcut('mod+enter')!, true))
      .toBe(false)
  })
})

describe('formatShortcut', () => {
  it('writes Apple glyphs in menu order', () => {
    expect(formatShortcut(parseShortcut('mod+u')!, true)).toBe('⌘U')
    expect(formatShortcut(parseShortcut('mod+shift+u')!, true)).toBe('⇧⌘U')
    expect(formatShortcut(parseShortcut('mod+alt+shift+k')!, true)).toBe('⌥⇧⌘K')
  })

  it('spells the other platforms out', () => {
    expect(formatShortcut(parseShortcut('mod+u')!, false)).toBe('Ctrl+U')
    expect(formatShortcut(parseShortcut('mod+shift+u')!, false)).toBe('Ctrl+Shift+U')
  })

  it('names keys by their cap rather than their event value', () => {
    expect(formatShortcut(parseShortcut('mod+space')!, false)).toBe('Ctrl+Space')
    expect(formatShortcut(parseShortcut('mod+left')!, true)).toBe('⌘←')
  })
})
