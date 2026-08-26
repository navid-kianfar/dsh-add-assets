/**
 * The two elements this plugin reads out of the harness's composer: the card, and its textarea.
 *
 * The plate needs the textarea for the two things the resident command button gets for free, being
 * drawn inside the bar — the caret the slash menu's token span collapses to, and the focus that has
 * to stay in the draft while that menu is open (it is a combobox whose keyboard arbitration listens
 * on the textarea). A seat registered from outside the package holds no ref to either, so both are
 * found from this plugin's own element.
 *
 * The card carries `data-composer-card`, an attribute the composer sets deliberately for outside
 * anchoring, which is what keeps this reach to one documented hook instead of a class-name guess.
 * @module @achasoft/dsh-add-assets/client/composer-dom
 */

/** The composer card's own marker attribute. */
const CARD_SELECTOR = '[data-composer-card]'

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
 * Find the composer's draft textarea from a seat inside its card.
 * @param seat - this plugin's own element.
 * @returns the textarea, or null when the card renders none.
 */
export function findComposerTextarea(seat: HTMLElement): HTMLTextAreaElement | null {
  return findComposerCard(seat)?.querySelector('textarea') ?? null
}

/**
 * The draft offset a plate action should act at.
 * @param textarea - the composer textarea, or null when it could not be found.
 * @param draftLength - the machine's draft length, used when the DOM cannot answer.
 * @returns the caret offset, clamped to the draft.
 */
export function caretOf(textarea: HTMLTextAreaElement | null, draftLength: number): number {
  const start = textarea?.selectionStart
  return start === undefined || start === null ? draftLength : Math.min(start, draftLength)
}
