/**
 * Add-assets plugin, browser half. Three registrations over one settings namespace: the composer's
 * `+` plate in the tool row, the draft attachment preview inside the composer card, and the card on
 * the plugin settings tab keyed by the `add-assets` namespace.
 *
 * Nothing here reaches a model directly. The plate writes `@path` mentions into the draft through
 * the input machine's public `setDraft`, which makes them ordinary prompt text a person edits and
 * sends, and device files become the same browser-owned draft images that paste and drop already
 * produce.
 * @module @achasoft/dsh-add-assets/client
 */

import type { ClientContext, SessionId, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.remote Context merge, which carries the curated `fileReferences` namespace.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ui-conversation SlotMap merge (the two composer seats).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the settings shell's ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the keyed settings.plugin.item slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type { InputTriggerServiceContract } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { AddAssetsSettings } from '../host/types.ts'
import { AddAssetsPlate } from './AddAssetsPlate.tsx'
import { AddAssetsSettingsCard } from './AddAssetsSettingsCard.tsx'
import { AttachmentPreview } from './AttachmentPreview.tsx'
import type {
  AddAssetsPlateInjected, AddAssetsSettingsInjected, AttachmentPreviewInjected, WorkspaceBrowse,
} from './contract.ts'
import { ImageIntake } from './intake.ts'
import { en, zh, type AddAssetsKey } from './locales.ts'

export type { AddAssetsKey } from './locales.ts'
export type { AddAssetsPlateProps } from './AddAssetsPlate.tsx'
export type { AttachmentPreviewProps } from './AttachmentPreview.tsx'
export type { AddAssetsSettingsCardProps } from './AddAssetsSettingsCard.tsx'
export type {
  AddAssetsPlateInjected, AddAssetsSettingsInjected, AttachmentPreviewInjected, PickerMode,
  WorkspaceBrowse,
} from './contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer plate's, workspace picker's, attachment preview's, and settings card's copy. */
    'add-assets': AddAssetsKey
  }
}

/** Dictionary namespace and settings namespace owned by this plugin; the Host joins the card on it. */
const NS = 'add-assets'

/**
 * List order of the plate among other left-seat entries. Negative so the plate leads the seat, which
 * is where the button it replaces sat.
 */
const PLATE_ORDER = -10

/**
 * Shadowing rank of the workspace-capable plate. Cell shadowing renders the LOWEST priority, so the
 * entry that can browse wins over the base entry whenever a Host file-reference provider is mounted.
 */
const PLATE_WITH_BROWSE = -1

/** Required services: the slot registry, the copy, the settings scope, and session scope resolution. */
export const inject = ['slots', 'locale', 'settingsScope', 'sessions']

/**
 * Client plugin body: register the two composer seats and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'add-assets: dictionaries')
  const scope = ctx.settingsScope.bind<AddAssetsSettings>({ namespace: NS })
  const intake = new ImageIntake()

  // Shadows the shipped attachment rail (cell shadowing renders the lowest priority). Taking this
  // seat means owning the document drop target too: the entry being shadowed is the one that held
  // those listeners, so an occupant that only drew cards would silently disable drag-and-drop.
  ctx.slots.inject('conversation.input.attachments', () => ctx.slots.register({
    name: 'conversation.input.attachments',
    priority: -1,
    locale: NS,
    inject: (): AttachmentPreviewInjected => ({
      hooks: { addAssetsSettings: scope },
      publishIntake: (sessionId, add) => intake.publish(sessionId, add),
    }),
  }, AttachmentPreview))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: NS,
    locale: NS,
    inject: (): AddAssetsSettingsInjected => ({
      hooks: { addAssetsSettings: scope },
      setField: (field, value) => scope.set(field, value),
    }),
  }, AddAssetsSettingsCard))

  // The plate without workspace browsing: device upload and the slash-command menu still work, and
  // its two workspace rows say why they are unavailable rather than disappearing. A deployment that
  // mounts a file-reference provider gets the entry below instead.
  registerPlate(ctx, scope, intake, () => undefined, 0)

  // A child fiber, so the workspace-capable plate exists exactly while the Host serves discovery:
  // the namespace is a curated Remote, and a fiber cannot read one it did not inject.
  ctx.inject(['slots', 'sessions', 'remote', 'remote.fileReferences'], (rctx: ClientContext) => {
    registerPlate(rctx, scope, intake, sessionId => ({
      list: async (query, signal) => {
        const result = await rctx.remote.fileReferences.list(sessionId, query, signal)
        // A Host failure is thrown rather than folded into an empty list: "nothing matches" and
        // "the workspace could not be read" are different answers, and the picker says so.
        if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
        return result.value
      },
    }), PLATE_WITH_BROWSE)
  })
}

/**
 * Register one plate entry into the composer's left tool seat.
 * @param ctx - the fiber owning this registration; its lifetime is the entry's.
 * @param scope - the bound `add-assets` settings scope.
 * @param intake - the per-session image intake the attachment seat publishes into.
 * @param browseOf - resolves workspace discovery for one session, or undefined when unavailable.
 * @param priority - cell shadowing rank; the lowest live entry of the cell renders.
 */
function registerPlate(
  ctx: ClientContext,
  scope: SettingsScope<AddAssetsSettings>,
  intake: ImageIntake,
  browseOf: (sessionId: SessionId) => WorkspaceBrowse | undefined,
  priority: number,
): void {
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    // List seats are addressed by id; the two plate entries share one so they shadow rather than
    // both render.
    id: 'add-assets',
    order: PLATE_ORDER,
    priority,
    locale: NS,
    inject: (sessionId: SessionId): AddAssetsPlateInjected => ({
      hooks: { addAssetsSettings: scope },
      openCommandMenu: commandMenuOpener(ctx, sessionId),
      browse: browseOf(sessionId),
      attachDeviceFiles: files => intake.add(sessionId, files),
    }),
  }, AddAssetsPlate))
}

/**
 * Bind the slash-command launcher for one session.
 *
 * The trigger pipeline is optional, and its per-session controller lives on the session scope, so
 * both are resolved here rather than at plugin load: an absent pipeline yields undefined, which is
 * what leaves the plate's command row disabled with an explanation instead of inert.
 * @param ctx - the fiber holding the session service.
 * @param sessionId - the session the plate is mounted for.
 * @returns the launcher, or undefined when this deployment composes no trigger pipeline.
 */
function commandMenuOpener(
  ctx: ClientContext,
  sessionId: SessionId,
): ((caret: number, draftRev: number, leading: boolean) => void) | undefined {
  // Optional-service convention: `get` answers undefined for a service this fiber did not inject
  // and the composition did not mount.
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract | undefined
  const actx = ctx.sessions.scope(sessionId)
  if (inputTriggers === undefined || actx === undefined) return undefined
  return (caret, draftRev, leading) => {
    inputTriggers.sessionOf(actx).toggleSource('command', {
      trigger: '/',
      query: '',
      quoted: false,
      position: leading ? 'leading' : 'inline',
      // A collapsed caret rather than a selection: the plate is a button, so there is no selection
      // gesture behind it, and a command picked from it replaces nothing the user chose.
      span: { start: caret, end: caret, draftRev },
    })
  }
}
