/**
 * Display formatting for the attachment preview's details line.
 * @module @achasoft/dsh-add-assets/client/format
 */

/** Unit steps above bytes, in ascending order. */
const UNITS = ['KB', 'MB', 'GB'] as const

/**
 * A byte count as attachment-card text.
 *
 * The spelling follows the harness's own limit copy — binary steps, unit suffixed without a space —
 * so a card and the limit line it may sit beside read as the same measurement.
 * @param bytes - the byte count; negative and non-finite inputs are treated as zero.
 * @returns the formatted size, e.g. `812B`, `240KB`, `1.2MB`.
 */
export function formatBytes(bytes: number): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (safe < 1024) return `${Math.round(safe)}B`
  let value = safe / 1024
  let unit: string = UNITS[0]
  for (const step of UNITS.slice(1)) {
    if (value < 1024) break
    value /= 1024
    unit = step
  }
  // One decimal below ten, none above: `1.2MB` carries information a card has room for, while
  // `240.3KB` is precision no one acts on.
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))}${unit}`
}

/**
 * Pixel dimensions as attachment-card text.
 * @param width - natural width in pixels.
 * @param height - natural height in pixels.
 * @returns the formatted dimensions, e.g. `1024×768`.
 */
export function formatDimensions(width: number, height: number): string {
  return `${width}×${height}`
}

/**
 * A short format label for one attachment.
 *
 * The file name's extension is preferred over the declared media type: it is what the user named
 * the file, and a browser reporting `image/jpeg` for a file called `photo.jpg` should show `JPG`.
 * @param name - the file name, possibly empty.
 * @param mediaType - the browser-declared MIME type, possibly empty.
 * @returns the upper-case label, or undefined when neither source names a format.
 */
export function formatLabel(name: string, mediaType: string): string | undefined {
  const dot = name.lastIndexOf('.')
  const extension = dot > 0 ? name.slice(dot + 1) : ''
  if (/^[a-z0-9]{1,5}$/iu.test(extension)) return extension.toUpperCase()
  const subtype = mediaType.split('/')[1] ?? ''
  return /^[a-z0-9+.-]{1,12}$/iu.test(subtype) ? subtype.toUpperCase() : undefined
}

/**
 * Join the parts of a details line, dropping the ones that are not known yet.
 * @param parts - candidate segments in display order.
 * @returns the joined line, or `''` when nothing is known.
 */
export function detailsLine(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part !== '').join(' · ')
}
