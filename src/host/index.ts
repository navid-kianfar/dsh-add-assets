/**
 * The add-assets plugin's node half: the owner of the `add-assets` settings section, and one Remote
 * endpoint listing Host directory entries for the picker's outside-the-workspace mode.
 *
 * Nothing here is model-facing. The endpoint reports entry NAMES and kinds; it opens no file, and
 * what a person picks becomes ordinary `@path` prompt text they can see and edit. The section
 * exists so the deployment's preferences are stored and schema-checked — which is also what makes
 * the browser card appear, since the plugin-configuration tab renders the intersection of the
 * namespaces the Host serves and the cards registered for them.
 *
 * The browser half ships through `exports["./client"]` and is discovered from the bare-package row
 * in cordis.yml; see the patch file for why that row cannot be a subpath.
 * @module @achasoft/dsh-add-assets/host
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { parseShortcut } from '../shortcut.ts'
import { AssetBrowseError, listAssets } from './browse.ts'
import type { AddAssetsSettings, AssetBrowseResult } from './types.ts'

export type * from './types.ts'
export { AssetBrowseError, crumbsOf, listAssets, resolveStart } from './browse.ts'

/** The settings namespace both halves address; the browser card joins the tab on it. */
export const ADD_ASSETS_SETTINGS_NAMESPACE = settingsNamespace('add-assets')

/** Deployment configuration for the add-assets surfaces; the `add-assets` section's own shape. */
export type Config = AddAssetsSettings

declare module '@deepseek-ai/cordis' {
  interface Context {
    addAssets: AddAssetsService
  }
}

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

/** Host-side settings owner and filesystem-listing endpoint. */
export class AddAssetsService extends TypertRemoteService {
  /** Loader validation for the section. Every field is required, so a partial row fails at load. */
  static Config: z<Config> = z.object({
    replaceCommandButton: z.boolean().required(),
    deviceUpload: z.boolean().required(),
    outsideWorkspace: z.boolean().required(),
    browseMaxEntries: z.number().step(1).min(1).max(5000).required(),
    filesShortcut: z.string().required(),
    foldersShortcut: z.string().required(),
    commandShortcut: z.string().required(),
    pickerResultLimit: z.number().step(1).min(1).max(200).required(),
    previewDensity: z.union(['card', 'compact'] as const).required(),
    previewDetails: z.boolean().required(),
  })

  private source: () => Config

  /**
   * @param ctx - Host context owning the registration.
   * @param config - the composition-layer preferences, used as the section's base layer.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'addAssets')
    this.source = () => config
    installSettingsSection(ctx, ADD_ASSETS_SETTINGS_NAMESPACE, AddAssetsService.Config, config, {
      setSource: (current) => { this.source = current },
      // Nothing is derived from the section: every read happens inside a call, so a committed
      // change reaches the next request with no registration to rebuild.
      onChange: () => {},
      validate: validateAddAssetsSettings,
    })
  }

  /**
   * List one directory level of the Host filesystem for the picker's outside-the-workspace mode.
   *
   * Every failure is returned rather than thrown: the gateway erases a business exception's
   * classification, and the browser says something different for each class — a deployment that
   * turned this off, a path that is not a directory, and one it cannot read are three different
   * things to tell a person.
   * @param path - absolute directory to list; blank lists the Host account's home directory.
   * @param query - case-insensitive substring filter on entry names, applied before the cap.
   * @param signal - gateway-supplied cancellation for the caller's abandoned request.
   * @returns the level, or a classified refusal.
   */
  @Remote('browse')
  async browse(path: string, query: string, signal: AbortSignal): Promise<AssetBrowseResult> {
    const config = this.source()
    if (!config.outsideWorkspace) {
      return { ok: false, code: 'disabled', message: 'browsing outside the workspace is turned off for this deployment' }
    }
    try {
      const listing = await listAssets({ path, query, maxEntries: config.browseMaxEntries, signal })
      return { ok: true, listing }
    } catch (error: unknown) {
      if (error instanceof AssetBrowseError) return { ok: false, code: error.code, message: error.message }
      throw error
    }
  }
}

export default AddAssetsService
