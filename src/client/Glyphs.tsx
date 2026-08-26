/**
 * The glyph set this plugin draws itself, because the client's icon family has no member for most
 * of them and mixing two families in one menu reads as a mistake.
 *
 * Every glyph is one 16×16 box on a 1.5 stroke of `currentColor`, with round joins and the same
 * optical margin, so a plate row or a picker row mixing them keeps one weight down the column.
 * @module @achasoft/dsh-add-assets/client/Glyphs
 */

import type { ReactNode } from 'react'

/** Props every glyph accepts; `size` overrides the 16px default for a denser row. */
export interface GlyphProps {
  /** Edge length in pixels. */
  size?: number
  /** Optional class, for a seat that colors or spaces its icons. */
  className?: string
}

/**
 * Shared frame: one viewBox, one stroke weight, one set of joins.
 * @param props - the glyph's size, class, and path content.
 * @returns the svg element.
 */
function Glyph({ size = 16, className, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/**
 * A page with a folded corner: one file.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function FileGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.2 2H5a1.8 1.8 0 0 0-1.8 1.8v8.4A1.8 1.8 0 0 0 5 14h6a1.8 1.8 0 0 0 1.8-1.8V5.6L9.2 2Z" />
      <path d="M9 2.3v2.9c0 .5.4.9.9.9h2.8" />
    </Glyph>
  )
}

/**
 * A tabbed folder: one directory.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function FolderGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2.2 5.1c0-.9.7-1.6 1.6-1.6h2.06c.42 0 .82.16 1.13.45l.92.87c.3.29.7.45 1.13.45h3.16c.9 0 1.6.7 1.6 1.6v5.3c0 .9-.7 1.6-1.6 1.6H3.8c-.9 0-1.6-.7-1.6-1.6V5.1Z" />
    </Glyph>
  )
}

/**
 * A forward slash between chevrons: the slash-command menu.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function SlashGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.5 2.8 6.5 13.2" />
      <path d="M4.1 5.4 1.9 8l2.2 2.6" />
      <path d="M11.9 5.4 14.1 8l-2.2 2.6" />
    </Glyph>
  )
}

/**
 * An arrow rising out of a tray: upload from this device.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function UploadGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M8 10.2V2.6" />
      <path d="m5.2 5.4 2.8-2.8 2.8 2.8" />
      <path d="M2.8 10.2v1.9c0 .93.75 1.68 1.68 1.68h7.04c.93 0 1.68-.75 1.68-1.68v-1.9" />
    </Glyph>
  )
}

/**
 * A hard drive: the whole machine, as opposed to the project.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function MachineGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2.4 8.4 4.3 3.4c.19-.5.67-.83 1.2-.83h4.99c.53 0 1.01.33 1.2.83l1.9 5" />
      <path d="M2.4 8.4h11.2v3.4c0 .89-.72 1.61-1.61 1.61H4.01c-.89 0-1.61-.72-1.61-1.61V8.4Z" />
      <path d="M10.9 10.9h.9" />
    </Glyph>
  )
}

/**
 * A folder inside a frame: the project this session works in.
 * @param props - size and class overrides.
 * @returns the glyph element.
 */
export function ProjectGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M2.4 4.6c0-1.05.85-1.9 1.9-1.9h1.7l1.5 1.6h4.1c1.05 0 1.9.85 1.9 1.9v5.2c0 1.05-.85 1.9-1.9 1.9H4.3c-1.05 0-1.9-.85-1.9-1.9V4.6Z" />
      <path d="M6.1 9.6h3.8" />
    </Glyph>
  )
}
