/**
 * The add-assets plugin's node half: the owner of the `add-assets` settings section.
 *
 * Nothing here is model-facing and nothing here serves a request. The section exists so the
 * deployment's preferences are stored, schema-checked, and listed by the settings service — which
 * is also what makes the browser card appear, since the plugin-configuration tab renders the
 * intersection of the namespaces the Host serves and the cards registered for them.
 *
 * The browser half ships through `exports["./client"]` and is discovered from the bare-package row
 * in cordis.yml; see the patch file for why that row cannot be a subpath.
 * @module @achasoft/dsh-add-assets/host
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { parseShortcut } from '../shortcut.ts'
import type { AddAssetsSettings } from './types.ts'

export type * from './types.ts'

/** The settings namespace both halves address; the browser card joins the tab on it. */
export const ADD_ASSETS_SETTINGS_NAMESPACE = settingsNamespace('add-assets')

/** Deployment configuration for the add-assets surfaces; the `add-assets` section's own shape. */
export type Config = AddAssetsSettings

/** Loader validation for the section. Every field is required, so a partial row fails at load. */
export const Config: z<Config> = z.object({
  replaceCommandButton: z.boolean().required(),
  deviceUpload: z.boolean().required(),
  filesShortcut: z.string().required(),
  foldersShortcut: z.string().required(),
  commandShortcut: z.string().required(),
  pickerResultLimit: z.number().step(1).min(1).max(200).required(),
  previewDensity: z.union(['card', 'compact'] as const).required(),
  previewDetails: z.boolean().required(),
})

/** The three chord fields, checked together so one message can name the offending field. */
const CHORD_FIELDS = ['filesShortcut', 'foldersShortcut', 'commandShortcut'] as const

/**
 * Reject chords the browser could never match. The schema types these as strings; whether a string
 * is a chord is a grammar question it cannot express, and an unparsable chord would otherwise be
 * accepted, stored, and then silently never fire. Exported because it is part of the section's
 * acceptance contract, not only of this plugin's wiring.
 * @param value - the resolved section, schema-valid by construction.
 * @throws TypeError naming the first field whose chord the browser could not match.
 */
export function validateAddAssetsSettings(value: Config): void {
  for (const field of CHORD_FIELDS) {
    const chord = value[field]
    if (chord !== '' && parseShortcut(chord) === undefined) {
      throw new TypeError(`add-assets: ${field} "${chord}" is not a keyboard chord (e.g. "mod+u", "mod+shift+u", "")`)
    }
  }
}

/**
 * Node plugin body: register the settings section against the composition entry.
 * @param ctx - Host context owning the registration.
 * @param config - the composition-layer preferences, used as the section's base layer.
 */
export function apply(ctx: Context, config: Config): void {
  installSettingsSection(ctx, ADD_ASSETS_SETTINGS_NAMESPACE, Config, config, {
    // Nothing on the Host reads this section: every consumer is a browser surface reading the same
    // namespace through its own bound settings scope, so there is no source thunk to point and
    // nothing derived to re-judge when a committed change lands.
    setSource: () => {},
    onChange: () => {},
    validate: validateAddAssetsSettings,
  })
}
