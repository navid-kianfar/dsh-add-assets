/**
 * The two elements this plugin reads out of the harness's composer: the card, and its draft editor.
 *
 * The plate needs the editor for what the resident command button gets for free, being drawn inside
 * the bar: the focus that has to stay in the draft while the slash menu is open (it is a combobox
 * whose keyboard arbitration listens on the editor). A seat registered from outside the package
 * holds no ref to it, so it is found from this plugin's own element.
 *
 * The card carries `data-composer-card`, an attribute the composer sets deliberately for outside
 * anchoring, which is what keeps this reach to one documented hook instead of a class-name guess.
 * @module @achasoft/dsh-add-assets/client/composer-dom
 */

/** The composer card's own marker attribute. */
const CARD_SELECTOR = '[data-composer-card]'

/**
 * The draft editor inside the card. The installed composer (0.1.5-rc.2) binds a Lexical editor to a
 * `contenteditable` element; the checkout this package compiles against still renders a textarea.
 * Both are matched so the lookup does not silently return nothing on either.
 */
const EDITOR_SELECTOR = 'textarea, [contenteditable="true"]'

/**
 * The composer card containing a seat.
 * @param seat - this plugin's own element inside the card.
 * @returns the card, or null when the seat is rendered outside one.
 */
export function findComposerCard(seat: HTMLElement): HTMLElement | null {
  const card = seat.closest(CARD_SELECTOR)
  return card instanceof HTMLElement ? card : null
}

/**
 * Find the composer's draft editor from a seat inside its card.
 * @param seat - this plugin's own element.
 * @returns the editor element, or null when the card renders none.
 */
export function findComposerEditor(seat: HTMLElement): HTMLElement | null {
  const editor = findComposerCard(seat)?.querySelector(EDITOR_SELECTOR)
  return editor instanceof HTMLElement ? editor : null
}

/**
 * The draft offset a plate action should act at.
 *
 * Only a textarea can answer with a caret in the machine's own coordinates. A `contenteditable`
 * selection is a DOM range over chip and text nodes, and translating it into the editor's detect
 * projection would re-implement the composer's private layout walk; the end of the draft is the
 * same answer the composer's own `caretSpan()` gives when it has no selection.
 * @param editor - the composer's draft editor, or null when it could not be found.
 * @param draftEnd - the end of the draft in the coordinates the input verbs accept.
 * @returns the caret offset, clamped to the draft.
 */
export function caretOf(editor: HTMLElement | null, draftEnd: number): number {
  if (editor === null || editor.tagName !== 'TEXTAREA') return draftEnd
  return Math.min((editor as HTMLTextAreaElement).selectionStart, draftEnd)
}
