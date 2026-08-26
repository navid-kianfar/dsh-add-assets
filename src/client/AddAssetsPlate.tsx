/**
 * The composer's `+` control and its options plate.
 *
 * The plate is the whole point of the plugin: the harness's own `+` opens the slash-command menu
 * directly, and this one offers that menu as one entry beside adding workspace files, adding
 * workspace folders, and uploading images from the machine. It sits in the tool row's
 * `conversation.input.left` seat and — while `replaceCommandButton` is on — hides the resident
 * button so the row keeps exactly one `+`.
 * @module @achasoft/dsh-add-assets/client/AddAssetsPlate
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  IconFolderClose16, IconPlusOutline16, Menu, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the input.left seat) and the input standard
// kit (useInput + inputActions) it publishes.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { formatShortcut, matchesShortcut, parseShortcut } from '../shortcut.ts'
import type { Shortcut } from '../shortcut.ts'
import { AssetPicker } from './AssetPicker.tsx'
import type { AddAssetsPlateInjected, PickerMode } from './contract.ts'
import { caretOf, findComposerTextarea } from './composer-dom.ts'
import { FileGlyph, SlashGlyph, UploadGlyph } from './Glyphs.tsx'
import { isApplePlatform } from './platform.ts'
import { appendMentions } from './mention.ts'
import { suppressResidentCommandButton } from './resident-button.ts'
import css from './AddAssetsPlate.module.css'

/** Media types the device chooser offers; the composer validates the bytes again on intake. */
const DEVICE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

/**
 * Picker rows used while the settings section has not resolved yet — this plugin's own composition
 * default rather than a second policy, since a zero would render an empty list for the fraction of
 * a second before the resolved value lands.
 */
const DEFAULT_PICKER_ROWS = 20

/** How long the plate's own failure line stays up before it clears itself. */
const NOTICE_MS = 4000

/** Full plate props: runtime share (standard kit + InputZone owner) & injected share & locale seat. */
export type AddAssetsPlateProps =
  PropsRuntime<'conversation.input.left'> & InjectFace<AddAssetsPlateInjected> & PropsLocale<'add-assets'>

/** Row identities of the plate, which are also the Menu's select ids. */
type PlateAction = 'files' | 'folders' | 'device' | 'command'

/**
 * Compose one plate row: the action on the left, its chord or its unavailability on the right.
 * Menu rows take a node, which is what lets the chord sit in the row rather than in a tooltip.
 * @param label - the action text.
 * @param trailing - chord text, an explanation, or undefined for a row with neither.
 * @param muted - whether the trailing text is an explanation rather than a key hint.
 * @returns the row node.
 */
function plateRow(label: string, trailing: string | undefined, muted: boolean): ReactNode {
  return (
    <span className={css.row}>
      <span className={css.rowLabel}>{label}</span>
      {trailing === undefined ? null : <span className={muted ? css.rowNote : css.rowChord}>{trailing}</span>}
    </span>
  )
}

/**
 * The composer's add-assets control.
 * @param props - the standard session kit, the injected settings scope and capability faces, and
 * the namespace-bound translate.
 * @returns the `+` button, its plate, and the workspace picker while one is open.
 */
export function AddAssetsPlate({
  useInput, inputActions, useAddAssetsSettings, openCommandMenu, browse, attachDeviceFiles,
  session, t,
}: AddAssetsPlateProps) {
  const settings = useAddAssetsSettings(snapshot => snapshot.value)
  const draft = useInput(state => state.draft)
  const draftRev = useInput(state => state.draftRev)
  const phase = useInput(state => state.phase)
  const seatRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [picker, setPicker] = useState<PickerMode | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The machine refuses writes while a submission is being adjudicated or sent, and a removed
  // session accepts nothing at all; both make every plate action a write that would be rejected.
  const locked = session.removed || phase === 'adjudicating' || phase === 'submitting'
  const apple = useMemo(() => isApplePlatform(navigator), [])

  const focusDraft = useCallback((): void => {
    const seat = seatRef.current
    if (seat !== null) findComposerTextarea(seat)?.focus()
  }, [])

  useEffect(() => {
    const seat = seatRef.current
    if (seat === null || settings?.replaceCommandButton !== true) return undefined
    return suppressResidentCommandButton(seat)
  }, [settings?.replaceCommandButton])

  useEffect(() => {
    if (notice === null) return undefined
    const timer = setTimeout(() => { setNotice(null) }, NOTICE_MS)
    return () => { clearTimeout(timer) }
  }, [notice])

  const openCommand = useCallback((): void => {
    if (openCommandMenu === undefined) return
    const seat = seatRef.current
    const textarea = seat === null ? null : findComposerTextarea(seat)
    // Focus first: the candidate menu is a combobox whose keyboard arbitration runs on the
    // textarea, so opening it while focus sits on a plate row would leave the arrow keys dead.
    textarea?.focus()
    openCommandMenu(caretOf(textarea, draft.length), draftRev, draft.trim() === '')
  }, [draft, draftRev, openCommandMenu])

  const run = useCallback((action: PlateAction): void => {
    setOpen(false)
    if (locked) return
    switch (action) {
      case 'files':
      case 'folders':
        if (browse !== undefined) setPicker(action)
        return
      case 'device':
        setNotice(null)
        fileInputRef.current?.click()
        return
      case 'command':
        openCommand()
        return
      default:
    }
  }, [browse, locked, openCommand])

  const chords = useMemo(() => ({
    files: settings === undefined ? undefined : parseShortcut(settings.filesShortcut),
    folders: settings === undefined ? undefined : parseShortcut(settings.foldersShortcut),
    command: settings === undefined ? undefined : parseShortcut(settings.commandShortcut),
  }), [settings])

  useEffect(() => {
    const bindings: readonly (readonly [Shortcut | undefined, PlateAction])[] = [
      [chords.files, 'files'], [chords.folders, 'folders'], [chords.command, 'command'],
    ]
    if (bindings.every(([chord]) => chord === undefined)) return undefined
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (locked) return
      for (const [chord, action] of bindings) {
        if (chord === undefined || !matchesShortcut(event, chord, apple)) continue
        event.preventDefault()
        run(action)
        return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [apple, chords, locked, run])

  const addMentions = useCallback((mentions: readonly string[]): void => {
    setPicker(null)
    if (mentions.length > 0) inputActions.setDraft(appendMentions(draft, mentions))
    focusDraft()
  }, [draft, focusDraft, inputActions])

  const items = useMemo<MenuEntry[]>(() => {
    const chordText = (chord: Shortcut | undefined): string | undefined =>
      chord === undefined ? undefined : formatShortcut(chord, apple)
    const workspaceNote = browse === undefined ? t('plate.browseUnavailable') : undefined
    const rows: MenuEntry[] = [
      {
        id: 'files',
        icon: <FileGlyph />,
        disabled: browse === undefined,
        label: plateRow(t('plate.files'), workspaceNote ?? chordText(chords.files), workspaceNote !== undefined),
      },
      {
        id: 'folders',
        icon: <IconFolderClose16 />,
        disabled: browse === undefined,
        label: plateRow(t('plate.folders'), workspaceNote ?? chordText(chords.folders), workspaceNote !== undefined),
      },
    ]
    if (settings?.deviceUpload === true) {
      rows.push({ id: 'device', icon: <UploadGlyph />, label: plateRow(t('plate.device'), undefined, false) })
    }
    const commandNote = openCommandMenu === undefined ? t('plate.commandUnavailable') : undefined
    rows.push(
      { type: 'separator', id: 'plate-separator' },
      {
        id: 'command',
        icon: <SlashGlyph />,
        disabled: openCommandMenu === undefined,
        label: plateRow(t('plate.command'), commandNote ?? chordText(chords.command), commandNote !== undefined),
      },
    )
    return rows
  }, [apple, browse, chords, openCommandMenu, settings?.deviceUpload, t])

  return (
    <span className={settings?.replaceCommandButton === true ? css.seatLeading : css.seat} ref={seatRef}>
      <Menu
        open={open && !locked}
        portal
        dense
        side="top"
        align="start"
        getAnchorRect={() => buttonRef.current?.getBoundingClientRect() ?? null}
        items={items}
        onSelect={(id) => { run(id as PlateAction) }}
        onClose={() => { setOpen(false) }}
        anchor={(
          <Tooltip label={t('plate.open')} side="top" delayMs={500}>
            <button
              ref={buttonRef}
              type="button"
              className={css.add}
              aria-label={t('plate.open')}
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={locked}
              // The draft keeps focus through the gesture, exactly as the resident button arranges
              // for its own menu; losing it would strand the slash menu's keyboard arbitration.
              onMouseDown={(event) => { event.preventDefault() }}
              onClick={() => { setOpen(current => !current) }}
            >
              <IconPlusOutline16 size={14} />
            </button>
          </Tooltip>
        )}
      />
      <input
        ref={fileInputRef}
        className={css.fileInput}
        type="file"
        accept={DEVICE_ACCEPT}
        multiple
        onChange={(event) => {
          const files = [...event.target.files ?? []]
          // Clearing lets the same file be chosen twice in a row; without it the second choice
          // fires no change event at all.
          event.target.value = ''
          if (files.length === 0) return
          if (!attachDeviceFiles(files)) setNotice(t('plate.deviceFailed'))
          focusDraft()
        }}
      />
      {notice === null ? null : <span className={css.notice} role="status">{notice}</span>}
      {picker === null || browse === undefined ? null : (
        <AssetPicker
          mode={picker}
          browse={browse}
          resultLimit={settings?.pickerResultLimit ?? DEFAULT_PICKER_ROWS}
          anchorRef={buttonRef}
          t={t}
          onClose={() => { setPicker(null); focusDraft() }}
          onAdd={addMentions}
        />
      )}
    </span>
  )
}
