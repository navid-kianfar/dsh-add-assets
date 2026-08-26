/**
 * Suppression of the composer's resident command button.
 *
 * The harness draws that button inside its own InputBar and declares no slot for it, so a plugin
 * that owns the `+` gesture cannot replace it in place — the only way to leave ONE `+` in the tool
 * row is to hide the resident one. The reach is deliberately narrow: the search is confined to the
 * composer card this plugin's seat already sits in, and the button is hidden by marking that single
 * element, never by a rule matching the harness's class names or applied document-wide.
 *
 * `button[aria-haspopup="listbox"]` is the resident launcher's own accessible signature and, at the
 * time of writing, is unique to it across the whole Web Client — every other popup control in the
 * client declares `menu`, `dialog`, or `tree`. Should the harness ever grow a second listbox
 * launcher inside the composer card, the first in document order is taken, which is still the
 * command button: it is the first control of the tool row.
 * @module @achasoft/dsh-add-assets/client/resident-button
 */

import { findComposerCard } from './composer-dom.ts'

/** Marked on the resident button; the injected rule hides exactly what carries it. */
const HIDDEN_ATTRIBUTE = 'data-dsh-add-assets-hidden'

/** Accessible signature of the composer's resident command launcher. */
const RESIDENT_SELECTOR = 'button[aria-haspopup="listbox"][aria-expanded]'

/** Identifies this plugin's stylesheet element, so repeated mounts share one. */
const STYLE_ID = '@achasoft/dsh-add-assets/resident-button'

/** How many live suppressions the stylesheet is serving; the last one out removes it. */
let styleUsers = 0

/** Add the hiding rule to the document once, and count this user against it. */
function acquireStyle(): void {
  styleUsers += 1
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@achasoft/dsh-add-assets'
  tag.dataset.pluginCss = STYLE_ID
  // `!important` because the rule competes with the harness's own `display: grid` on that button,
  // written with equal specificity in a stylesheet this plugin cannot order itself against.
  tag.textContent = `[${HIDDEN_ATTRIBUTE}]{display:none!important}`
  document.head.appendChild(tag)
}

/** Drop this user's claim and remove the stylesheet once none remain. */
function releaseStyle(): void {
  styleUsers -= 1
  if (styleUsers > 0) return
  document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)?.remove()
}

/**
 * Find the resident command button in the composer card holding a seat.
 * @param seat - this plugin's own element inside the tool row.
 * @returns the resident button, or null when the composer does not draw one.
 */
function findResident(seat: HTMLElement): HTMLElement | null {
  for (const found of findComposerCard(seat)?.querySelectorAll(RESIDENT_SELECTOR) ?? []) {
    // The plate's own launcher must never match itself, whatever ARIA it grows later.
    if (found instanceof HTMLElement && !seat.contains(found)) return found
  }
  return null
}

/**
 * Hide the composer's resident command button while this plugin's plate is mounted.
 *
 * The mark is re-applied when the composer replaces that button's element — a session switch
 * rebuilds the tool row without remounting this seat — so the takeover survives a re-render it does
 * not participate in.
 * @param seat - this plugin's own element inside the composer tool row.
 * @returns a disposer restoring the button and releasing the stylesheet.
 */
export function suppressResidentCommandButton(seat: HTMLElement): () => void {
  acquireStyle()
  let marked: HTMLElement | null = null
  const mark = (): void => {
    if (marked !== null && marked.isConnected) return
    marked = findResident(seat)
    marked?.setAttribute(HIDDEN_ATTRIBUTE, '')
  }
  mark()
  // Scoped to the card rather than the document: the observer only has to notice the composer
  // rebuilding the row this seat already sits in. Marking inside the observed subtree re-enters
  // this callback, which the connected-element check above answers without re-searching.
  const card = findComposerCard(seat)
  const observer = card === null ? null : new MutationObserver(mark)
  if (card !== null) observer?.observe(card, { childList: true, subtree: true })
  return () => {
    observer?.disconnect()
    marked?.removeAttribute(HIDDEN_ATTRIBUTE)
    marked = null
    releaseStyle()
  }
}
