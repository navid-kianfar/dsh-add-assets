/**
 * Keyboard-chord grammar shared by both halves of the plugin: the Host validates the configured
 * chords at load, and the browser matches live key events against the same parse.
 *
 * A chord is `+`-separated, case-insensitive, and ends with exactly one non-modifier key, e.g.
 * `mod+u`, `mod+shift+u`, `mod+/`. `mod` is the platform's primary accelerator — Command on Apple
 * hardware, Control elsewhere — so one configured value serves every deployment.
 * @module @achasoft/dsh-add-assets/shortcut
 */

/** One parsed chord. `key` is normalized lowercase and never a modifier. */
export interface Shortcut {
  /** Command on Apple platforms, Control elsewhere. */
  readonly mod: boolean
  readonly shift: boolean
  readonly alt: boolean
  /** Normalized key name, matched against `KeyboardEvent.key` and the physical-key fallback. */
  readonly key: string
}

/** Chord spellings accepted for keys whose `KeyboardEvent.key` is a word rather than a character. */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  enter: 'enter',
  escape: 'escape',
  esc: 'escape',
  space: ' ',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
}

/** Modifier tokens, mapped to the {@link Shortcut} flag each one sets. */
const MODIFIERS: Readonly<Record<string, 'mod' | 'shift' | 'alt'>> = {
  mod: 'mod',
  cmd: 'mod',
  command: 'mod',
  ctrl: 'mod',
  control: 'mod',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
}

/**
 * Parse one configured chord.
 * @param chord - the chord text, e.g. `mod+shift+u`.
 * @returns the parsed chord, or undefined when the text is not a chord this grammar accepts
 * (including the empty string, which callers read as "no shortcut").
 */
export function parseShortcut(chord: string): Shortcut | undefined {
  const parts = chord.trim().toLowerCase().split('+').filter(part => part !== '')
  // A lone `+` is a legitimate key, and splitting erased it; restore it rather than rejecting.
  if (parts.length === 0) return chord.trim() === '+' ? { mod: false, shift: false, alt: false, key: '+' } : undefined
  let mod = false
  let shift = false
  let alt = false
  let key: string | undefined
  for (const part of parts) {
    const modifier = MODIFIERS[part]
    if (modifier === 'mod') { mod = true; continue }
    if (modifier === 'shift') { shift = true; continue }
    if (modifier === 'alt') { alt = true; continue }
    // A second non-modifier token means the chord names two keys, which no key event can satisfy.
    if (key !== undefined) return undefined
    key = NAMED_KEYS[part] ?? part
  }
  if (key === undefined || key.length === 0) return undefined
  // Multi-character keys are only meaningful when they came from the named table above; anything
  // else is a typo that would silently never fire.
  if (key.length > 1 && !Object.values(NAMED_KEYS).includes(key)) return undefined
  return { mod, shift, alt, key }
}

/** The subset of `KeyboardEvent` this module reads, so matching stays testable without a DOM. */
export interface KeyChord {
  readonly key: string
  /** Physical key identity, used when a modifier rewrote `key` (Alt does on Apple layouts). */
  readonly code: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

/**
 * Whether a key event is this chord.
 *
 * The key is compared against `event.key` first and against the physical `event.code` second: Alt
 * on Apple layouts rewrites `key` to a diacritic, so an `alt+u` chord would otherwise never match
 * the key the user actually pressed.
 * @param event - the key event's chord-relevant fields.
 * @param shortcut - the parsed chord.
 * @param apple - whether `mod` means Command (true) or Control (false).
 * @returns true when the event satisfies the chord exactly, modifiers included.
 */
export function matchesShortcut(event: KeyChord, shortcut: Shortcut, apple: boolean): boolean {
  const modPressed = apple ? event.metaKey : event.ctrlKey
  // The non-accelerator modifier must be RELEASED: on Apple, Ctrl+U is a text-editing gesture the
  // composer's textarea owns, and claiming it here would take it away.
  const otherPressed = apple ? event.ctrlKey : event.metaKey
  if (modPressed !== shortcut.mod || otherPressed) return false
  if (event.shiftKey !== shortcut.shift || event.altKey !== shortcut.alt) return false
  if (event.key.toLowerCase() === shortcut.key) return true
  if (shortcut.key.length !== 1) return false
  const physical = /[a-z]/u.test(shortcut.key)
    ? `Key${shortcut.key.toUpperCase()}`
    : /[0-9]/u.test(shortcut.key) ? `Digit${shortcut.key}` : undefined
  return physical !== undefined && event.code === physical
}

/** Display spellings for keys whose normalized name is not what a person reads on the key cap. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
}

/**
 * Render one chord the way the platform writes it on menus.
 * @param shortcut - the parsed chord.
 * @param apple - whether to use the Apple glyph spelling.
 * @returns the display text, e.g. `⌘U` or `Ctrl+U`.
 */
export function formatShortcut(shortcut: Shortcut, apple: boolean): string {
  const key = KEY_LABELS[shortcut.key] ?? shortcut.key.toUpperCase()
  if (apple) {
    return `${shortcut.alt ? '⌥' : ''}${shortcut.shift ? '⇧' : ''}${shortcut.mod ? '⌘' : ''}${key}`
  }
  const parts = [
    ...shortcut.mod ? ['Ctrl'] : [],
    ...shortcut.shift ? ['Shift'] : [],
    ...shortcut.alt ? ['Alt'] : [],
    key,
  ]
  return parts.join('+')
}
