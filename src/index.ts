/**
 * `@achasoft/dsh-add-assets` root entry — two roles in one module, because the client module system
 * requires them together.
 *
 * **As a plugin**, this is the browser surface's node half. The apply is empty: the browser half
 * ships via `exports["./client"]` and is discovered through the package's `dsh.client` declaration.
 * That discovery resolves `<loader row name>/package.json`, so the row naming this plugin must be
 * the BARE package name — a subpath row resolves nothing and the surfaces are silently never
 * served. The settings section lives on the separate `./host` row.
 *
 * **As a library**, it re-exports the settings shape and the chord grammar, so another package can
 * read or produce the same values without depending on either half's implementation.
 * @module @achasoft/dsh-add-assets
 */

export type * from './host/types.ts'
export * from './shortcut.ts'

/** Node plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
