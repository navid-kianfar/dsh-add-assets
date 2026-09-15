/**
 * Keyboard guards shared by the plate and the picker.
 * @module @achasoft/dsh-add-assets/client/keyboard
 */

/**
 * `KeyboardEvent.keyCode` while an input method editor owns the key. Deprecated everywhere, and
 * still the only composition signal Safari sends for the keydown that commits a candidate.
 */
const IME_KEY_CODE = 229

/** The subset of a native `KeyboardEvent` the guard reads. */
export interface CompositionSignal {
  readonly isComposing: boolean
  readonly keyCode: number
}

/**
 * Whether a keydown belongs to an active IME composition.
 *
 * Chinese is a shipped locale, and a pinyin user presses Enter to commit a candidate and arrows to
 * move between them. Those keys are the IME's while it composes: acting on them would pick a row,
 * add the selection, or close the panel mid-word. The check matches the harness composer's own
 * (`isComposing || keyCode === 229`).
 * @param event - the native keyboard event (a React event's `nativeEvent`).
 * @returns true when the key must be left to the IME.
 */
export function isComposingKey(event: CompositionSignal): boolean {
  return event.isComposing || event.keyCode === IME_KEY_CODE
}
