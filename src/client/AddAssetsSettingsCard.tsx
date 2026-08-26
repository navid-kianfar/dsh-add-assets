/**
 * The add-assets card on the plugin-configuration tab.
 *
 * Edits are staged and committed together rather than written per keystroke: the chord fields would
 * otherwise issue one settings write per character, and a half-typed chord would be stored and
 * rejected on the way. It is also the interaction the neighbouring cards use.
 * @module @achasoft/dsh-add-assets/client/AddAssetsSettingsCard
 */

import { useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the keyed settings.plugin.item slot declaration. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate, so this card renders
// its own chrome rather than reusing the section's.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { AddAssetsSettings } from '../host/types.ts'
import { parseShortcut } from '../shortcut.ts'
import type { AddAssetsSettingsInjected } from './contract.ts'
import css from './AddAssetsSettingsCard.module.css'

/** Props the renderer binds for the add-assets settings card. */
export type AddAssetsSettingsCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'add-assets'>
  & InjectFace<AddAssetsSettingsInjected>

/** Every field of the section is editable here; none of it is deployment-only. */
type Editable = keyof AddAssetsSettings

/** Fields stored as booleans; their controls are two-option selects. */
const BOOLEAN_FIELDS: readonly Editable[] = [
  'replaceCommandButton', 'deviceUpload', 'previewDetails',
]

/** Fields holding a keyboard chord, where the empty string means "no shortcut". */
const CHORD_FIELDS = ['filesShortcut', 'foldersShortcut', 'commandShortcut'] as const

/** Staged edits, keyed by field; absent means "unchanged from the resolved value". */
type Draft = Partial<Record<Editable, string>>

/**
 * Read one field's staged text, falling back to the resolved value.
 * @param draft - staged edits.
 * @param value - the resolved section, absent while it loads.
 * @param field - the field to read.
 * @returns the text the control should display.
 */
function shown(draft: Draft, value: AddAssetsSettings | undefined, field: Editable): string {
  const staged = draft[field]
  if (staged !== undefined) return staged
  const resolved = value?.[field]
  return resolved === undefined ? '' : String(resolved)
}

/**
 * Whether a staged chord could be stored. The Host rejects an unparsable chord, and a write it
 * would reject must be refused here — a rejected write leaves the field looking accepted.
 * @param text - the staged text; empty is valid and means no shortcut.
 * @returns true when the value is unusable.
 */
function chordInvalid(text: string): boolean {
  return text !== '' && parseShortcut(text) === undefined
}

/**
 * Whether a staged row count could be stored, against the same bounds the Host schema states.
 * @param text - the staged text.
 * @returns true when the value is unusable.
 */
function limitInvalid(text: string): boolean {
  const parsed = Number(text)
  return !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200
}

/**
 * The add-assets card: the plate's composition, its three chords, and the attachment preview's
 * appearance.
 * @param props - the injected settings scope and writer plus the namespace-bound translate.
 * @returns the collapsible card.
 */
export function AddAssetsSettingsCard(props: AddAssetsSettingsCardProps) {
  const { t, setField } = props
  const settings = props.useAddAssetsSettings(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const value = settings.value
  const edit = (field: Editable, text: string): void => {
    setFailed(false)
    setDraft(current => ({ ...current, [field]: text }))
  }

  const changed = (Object.keys(draft) as Editable[]).filter(field => draft[field] !== shown({}, value, field))
  const dirty = changed.length > 0
  const invalid = CHORD_FIELDS.some(field => chordInvalid(shown(draft, value, field)))
    || limitInvalid(shown(draft, value, 'pickerResultLimit'))
  const writable = settings.writable && value !== undefined

  const save = (): void => {
    setSaving(true)
    setFailed(false)
    // Sequential rather than concurrent: each write is fenced with the revision it read, so
    // overlapping them would make all but the first fail on a stale fence.
    void changed.reduce(
      (queue, field) => queue.then(() => {
        const text = draft[field] ?? ''
        if (BOOLEAN_FIELDS.includes(field)) return setField(field, text === 'true')
        if (field === 'pickerResultLimit') return setField(field, Number(text))
        return setField(field, text)
      }),
      Promise.resolve(),
    ).then(() => {
      setSaving(false)
      setDraft({})
    }, () => {
      setSaving(false)
      setFailed(true)
    })
  }

  /**
   * One two-option select over a boolean field.
   * @param field - the boolean field.
   * @param label - the row label key's resolved text.
   * @param onText - copy for the true option.
   * @param offText - copy for the false option.
   * @param hint - optional explanation under the control.
   * @returns the labelled field.
   */
  const booleanField = (
    field: Editable, label: string, onText: string, offText: string, hint?: string,
  ) => (
    <label className={css.field}>
      <div className={css.head}><span className={css.label}>{label}</span></div>
      <select
        className={css.select}
        disabled={!writable}
        value={shown(draft, value, field)}
        onChange={(event) => { edit(field, event.target.value) }}
      >
        <option value="true">{onText}</option>
        <option value="false">{offText}</option>
      </select>
      {hint === undefined ? null : <p className={css.hint}>{hint}</p>}
    </label>
  )

  /**
   * One chord field, refusing a value the Host would reject.
   * @param field - the chord field.
   * @param label - the row label's resolved text.
   * @returns the labelled field.
   */
  const chordField = (field: (typeof CHORD_FIELDS)[number], label: string) => {
    const text = shown(draft, value, field)
    const bad = chordInvalid(text)
    return (
      <label className={css.field}>
        <div className={css.head}><span className={css.label}>{label}</span></div>
        <input
          className={bad ? css.controlInvalid : css.control}
          type="text"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="mod+u"
          disabled={!writable}
          value={text}
          onChange={(event) => { edit(field, event.target.value) }}
        />
        {bad ? <p className={css.invalid} role="status">{t('settings.shortcut.invalid')}</p> : null}
      </label>
    )
  }

  const title = t('settings.title')
  const limitText = shown(draft, value, 'pickerResultLimit')
  return (
    <li className={`${css.card} ${open ? css.cardOpen : ''}`}>
      <button
        type="button"
        className={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${title}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className={css.headText}>
          <span className={css.name}>{title}</span>
          <span className={css.description}>{t('settings.description')}</span>
        </span>
        {dirty ? <span className={css.pending}>{t('settings.unsaved')}</span> : null}
        <IconChevronDownOutline14 className={`${css.chevron} ${open ? css.chevronOpen : ''}`} />
      </button>

      {open
        ? (
          <div className={css.body}>
            {!writable ? <p className={css.readOnly} role="status">{t('settings.readOnly')}</p> : null}

            <p className={css.group}>{t('settings.plate')}</p>
            {booleanField(
              'replaceCommandButton',
              t('settings.replaceCommandButton'),
              t('settings.replaceCommandButton.on'),
              t('settings.replaceCommandButton.off'),
              t('settings.replaceCommandButton.hint'),
            )}
            {booleanField(
              'deviceUpload',
              t('settings.deviceUpload'),
              t('settings.deviceUpload.on'),
              t('settings.deviceUpload.off'),
            )}

            <label className={css.field}>
              <div className={css.head}><span className={css.label}>{t('settings.pickerResultLimit')}</span></div>
              <input
                className={limitInvalid(limitText) ? css.controlInvalid : css.control}
                type="number"
                min={1}
                max={200}
                inputMode="numeric"
                disabled={!writable}
                value={limitText}
                onChange={(event) => { edit('pickerResultLimit', event.target.value) }}
              />
              {limitInvalid(limitText)
                ? <p className={css.invalid} role="status">{t('settings.invalidNumber')}</p>
                : null}
            </label>

            <p className={css.group}>{t('settings.shortcuts')}</p>
            {chordField('filesShortcut', t('settings.filesShortcut'))}
            {chordField('foldersShortcut', t('settings.foldersShortcut'))}
            {chordField('commandShortcut', t('settings.commandShortcut'))}
            <p className={css.hint}>{t('settings.shortcut.hint')}</p>

            <p className={css.group}>{t('settings.preview')}</p>
            <label className={css.field}>
              <div className={css.head}><span className={css.label}>{t('settings.previewDensity')}</span></div>
              <select
                className={css.select}
                disabled={!writable}
                value={shown(draft, value, 'previewDensity')}
                onChange={(event) => { edit('previewDensity', event.target.value) }}
              >
                <option value="card">{t('settings.previewDensity.card')}</option>
                <option value="compact">{t('settings.previewDensity.compact')}</option>
              </select>
            </label>
            {booleanField(
              'previewDetails',
              t('settings.previewDetails'),
              t('settings.previewDetails.on'),
              t('settings.previewDetails.off'),
            )}

            <div className={css.footer}>
              {failed ? <p className={css.failed} role="status">{t('settings.saveFailed')}</p> : null}
              <button
                type="button"
                className={css.discard}
                disabled={!dirty || saving}
                onClick={() => { setDraft({}); setFailed(false) }}
              >
                {t('settings.discard')}
              </button>
              <button
                type="button"
                className={css.save}
                disabled={!dirty || invalid || saving || !writable}
                onClick={save}
              >
                {t(saving ? 'settings.saving' : 'settings.save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}
