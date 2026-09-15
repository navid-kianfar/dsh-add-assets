/**
 * Numeric bounds of the `add-assets` section, shared by the Host schema and the browser card.
 *
 * One definition rather than a literal in each half: the card's inline check and the Host's schema
 * must refuse exactly the same values, or the card would offer a save the Host then rejects. This
 * module imports nothing, so the browser bundle can take it without pulling in Node built-ins.
 * @module @achasoft/dsh-add-assets/host/limits
 */

/**
 * Most entries one browsed level may report.
 *
 * The listing is held in memory, sorted, and sent over the wire as one message, so this bounds the
 * Host's work per request no matter what a settings write asks for. 2000 is past any level a person
 * scrolls by eye; beyond it the search field is the tool.
 */
export const BROWSE_MAX_ENTRIES_LIMIT = 2000

/** Most rows the picker renders per query; past this a list is scrolled, not read. */
export const PICKER_RESULT_LIMIT = 200
