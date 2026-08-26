/**
 * The three glyphs this plugin draws itself, because the client's icon set has no member for them.
 * Each is a 16×16 outline on `currentColor`, matching the icon family's stroke weight so a plate row
 * mixing these with set icons reads as one row of icons.
 * @module @achasoft/dsh-add-assets/client/Glyphs
 */

/** Props every glyph accepts; `size` overrides the 16px default for a denser row. */
export interface GlyphProps {
  /** Edge length in pixels. */
  size?: number
  /** Optional class, for a seat that colors or spaces its icons. */
  className?: string
}

/**
 * A page with a folded corner: one file.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function FileGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6L9 2Z" />
      <path d="M9 2v3.2a.8.8 0 0 0 .8.8H13" />
    </svg>
  )
}

/**
 * A forward slash between chevrons: the slash-command menu.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function SlashGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.6 3 6.4 13" />
      <path d="M4 5.6 1.8 8 4 10.4" />
      <path d="M12 5.6 14.2 8 12 10.4" />
    </svg>
  )
}

/**
 * An arrow into a tray: upload from this device.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function UploadGlyph({ size = 16, className }: GlyphProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 10.5V2.5" />
      <path d="m5 5.5 3-3 3 3" />
      <path d="M2.5 10v2A1.5 1.5 0 0 0 4 13.5h8a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  )
}
