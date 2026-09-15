/**
 * Add-assets plugin, browser half. Three registrations over one settings namespace: the composer's
 * `+` plate in the tool row, the draft reference-and-attachment row inside the composer card, and
 * the card on the plugin settings tab keyed by the `add-assets` namespace.
 *
 * Nothing here reaches a model directly. The plate writes `@path` mentions into the draft through
 * the input machine's public `setDraft`, which makes them ordinary prompt text a person edits and
 * sends, and device files become the same browser-owned draft images that paste and drop produce.
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
import type {
  InputTriggerServiceContract, InputTriggerSource, ReferenceInsert, TokenSpan,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
// The generated Host-for-Client contract for this plugin's own endpoint. Importing it here — rather
// than adding a row to the curated api-remotes assembly — is what keeps the capability a plugin: the
// namespace mounts and unmounts with this fiber, and no shipped source names `addAssets`.
import addAssetsRemote from '../../generated/typert.remote-client.js'
import type { AddAssetsSettings } from '../host/types.ts'
import { AddAssetsPlate } from './AddAssetsPlate.tsx'
import { AddAssetsSettingsCard } from './AddAssetsSettingsCard.tsx'
import { AttachmentPreview } from './AttachmentPreview.tsx'
import { machineLevel, projectLevel } from './browse.ts'
import type {
  AddAssetsPlateInjected, AddAssetsSettingsInjected, AssetBrowse, AttachmentPreviewInjected,
  BrowseScope,
} from './contract.ts'
import { ImageIntake } from './intake.ts'
import { en, zh, type AddAssetsKey } from './locales.ts'

export type { AddAssetsKey } from './locales.ts'
export type { AddAssetsPlateProps } from './AddAssetsPlate.tsx'
export type { AttachmentPreviewProps } from './AttachmentPreview.tsx'
export type { AddAssetsSettingsCardProps } from './AddAssetsSettingsCard.tsx'
export type {
  AddAssetsPlateInjected, AddAssetsSettingsInjected, AssetBrowse, AttachmentPreviewInjected,
  BrowseCrumb, BrowseEntry, BrowseLevel, BrowseScope, PickerMode,
} from './contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer plate's, path picker's, draft row's, and settings card's copy. */
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
 * The sliver of the conversation service this plugin calls.
 *
 * `IConversation` exposes `input` as the per-session facade registry, but the resolver type is not
 * among the package's exports, and the service itself is reached through the optional-service
 * lookup — an untyped boundary either way. Naming exactly the one method used keeps that cast as
 * narrow as the call it enables.
 */
interface ConversationInputFace {
  readonly input: {
    for(actx: ClientContext): { insertReference(reference: ReferenceInsert, span: TokenSpan): boolean }
  }
}

/**
 * Source name this plugin registers with the trigger pipeline, and records on every occurrence the
 * picker mints. The source contributes no candidates: it exists to own the codec that turns an
 * occurrence's hidden `ref` into what the model receives, and the roster is the only place a codec
 * can live.
 */
const REFERENCE_SOURCE = 'add-assets'

/** Required services: the slot registry, the copy, the settings scope, and session scope resolution. */
export const inject = ['slots', 'locale', 'settingsScope', 'sessions', 'remote']

/**
 * Client plugin body: mount this plugin's own Remote namespace, then register the two composer
 * seats and the settings card.
 * @param ctx - client root context.
 * @returns after the `addAssets` namespace is callable; its methods are withdrawn on unload.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  // Mounted on THIS fiber, so the endpoint's lifetime is the plugin's.
  await ctx.remote.$mount(addAssetsRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'add-assets: dictionaries')

  // The surfaces are a child so they can INJECT the namespace their parent just provided. Cordis
  // will not hand a fiber a service it did not declare, and the parent cannot declare one it
  // creates itself; the split is what lets the seats hold a properly injected reference.
  ctx.plugin({
    name: 'add-assets-surface',
    inject: ['slots', 'locale', 'settingsScope', 'sessions', 'remote', 'remote.addAssets'],
    apply: surface,
  })
}

/**
 * Register the composer seats and the settings card against a context holding both namespaces.
 * @param ctx - the child fiber, with `remote.addAssets` injected.
 */
function surface(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<AddAssetsSettings>({ namespace: NS })
  const intake = new ImageIntake()
  registerReferenceCodec(ctx)

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

  // The plate without project discovery: machine browsing, device upload, and the slash-command
  // menu still work. A deployment that mounts a file-reference provider gets the entry below.
  registerPlate(ctx, scope, intake, false, 0)

  // A child fiber, so the project-scope plate exists exactly while the Host serves discovery: the
  // namespace is a curated Remote, and a fiber cannot read one it did not inject. Both entries
  // share one cell id, so the richer one shadows rather than doubling the button.
  ctx.inject(['slots', 'sessions', 'locale', 'remote', 'remote.addAssets', 'remote.fileReferences'],
    (fctx: ClientContext) => { registerPlate(fctx, scope, intake, true, -1) })
}

/**
 * Register one plate entry into the composer's left tool seat.
 * @param ctx - the fiber owning this registration; its lifetime is the entry's.
 * @param scope - the bound `add-assets` settings scope.
 * @param intake - the per-session image intake the attachment seat publishes into.
 * @param project - whether this fiber can reach project-scope discovery.
 * @param priority - cell shadowing rank; the lowest live entry of the cell renders.
 */
function registerPlate(
  ctx: ClientContext,
  scope: SettingsScope<AddAssetsSettings>,
  intake: ImageIntake,
  project: boolean,
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
      browse: assetBrowse(ctx, sessionId, project, () => scope.getSnapshot().value),
      insertReference: referenceInserter(ctx, sessionId),
      insertText: textInserter(ctx, sessionId),
      attachDeviceFiles: files => intake.add(sessionId, files),
    }),
  }, AddAssetsPlate))
}

/**
 * Build the picker's data face for one session.
 *
 * Which scopes it offers is a fact about the deployment, resolved per session rather than per
 * plugin: `remote.fileReferences` is a curated namespace a composition may omit, and machine
 * browsing is a setting a person can turn off. An empty roster leaves the plate's two workspace
 * rows disabled with a reason instead of opening a panel that can list nothing.
 * @param ctx - the fiber holding both Remote namespaces.
 * @param sessionId - the session the picker is opened from.
 * @param settings - reads the resolved section at call time, so a committed change takes effect
 *   without remounting the seat.
 * @returns the face, or undefined when no scope can answer.
 */
function assetBrowse(
  ctx: ClientContext,
  sessionId: SessionId,
  project: boolean,
  settings: () => AddAssetsSettings | undefined,
): AssetBrowse | undefined {
  const scopes: BrowseScope[] = [
    ...project ? ['project' as const] : [],
    ...settings()?.outsideWorkspace === false ? [] : ['machine' as const],
  ]
  if (scopes.length === 0) return undefined
  const t = ctx.locale.bind(NS)
  return {
    scopes,
    // Both scopes open at their own root: `''` is the workspace root for discovery, and the Host
    // endpoint reads a blank path as the account's home directory.
    start: () => '',
    list: async (scope, directory, filter, signal) => {
      if (scope === 'project') {
        const result = await ctx.remote.fileReferences.list(sessionId, directory + filter.trimStart(), signal)
        // A Host failure is thrown rather than folded into an empty list: "nothing matches" and
        // "the workspace could not be read" are different answers, and the picker says so.
        if (!result.ok) throw new Error(`${result.error.message} (${result.error.code})`)
        return projectLevel(result.value, directory, filter.trim() !== '', t('picker.root'))
      }
      const answer = await ctx.remote.addAssets.browse(directory, filter, signal)
      if (!answer.ok) throw new Error(`${answer.error.message} (${answer.error.code})`)
      // The endpoint returns its refusals as values so each one can be said differently; the picker
      // renders whichever message came back.
      if (!answer.value.ok) throw new Error(answer.value.message)
      return machineLevel(answer.value.listing, t('picker.home'))
    },
  }
}

/**
 * Register the codec-only trigger source.
 *
 * An occurrence is serialized on submit through the codec of the source it names, so a picker that
 * mints occurrences must put a source on the roster or every send would fail on an unresolvable
 * reference. This one answers no candidates — the menu renders a ready, empty group as nothing —
 * because the plate, not typing `@`, is what produces its picks.
 * @param ctx - the fiber owning the registration.
 */
function registerReferenceCodec(ctx: ClientContext): void {
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract | undefined
  if (inputTriggers === undefined) return
  const source: InputTriggerSource = {
    trigger: '@',
    name: REFERENCE_SOURCE,
    showGroupTitle: false,
    candidates: () => Promise.resolve([]),
    onPick: () => undefined,
    codec: {
      // The stored ref IS the `@path` grammar, so both projections are it verbatim: the model reads
      // the same text a person would have typed, and copying a chip yields that text.
      clipboardText: ref => ref,
      serialize: ref => Promise.resolve(ref),
    },
  }
  ctx.effect(() => inputTriggers.registerSource(source), 'add-assets: reference codec')
}

/**
 * Bind the occurrence writer for one session.
 * @param ctx - the fiber holding the conversation and session services.
 * @param sessionId - the session the plate is mounted for.
 * @returns the writer, or undefined when no trigger pipeline is composed to serialize occurrences.
 */
function referenceInserter(
  ctx: ClientContext,
  sessionId: SessionId,
): ((reference: ReferenceInsert, span: TokenSpan) => boolean) | undefined {
  if (ctx.get('inputTriggers') === undefined) return undefined
  const conversation = ctx.get('conversation') as ConversationInputFace | undefined
  const actx = ctx.sessions.scope(sessionId)
  if (conversation === undefined || actx === undefined) return undefined
  return (reference, span) => conversation.input.for(actx).insertReference(reference, span)
}

/**
 * Bind the plain-text writer for one session.
 *
 * Emitted as the scoped `slash/input-insert-text` event on the session scope, which the composer's
 * input hub answers with its span-checked text insertion. That is a public verb in both the checkout
 * this compiles against and the installed harness, and unlike `inputActions.setDraft` it edits the
 * editor document in place, so reference chips already in the draft survive it.
 * @param ctx - the fiber holding the session service.
 * @param sessionId - the session the plate is mounted for.
 * @returns the writer, or undefined when the session scope is not resolvable.
 */
function textInserter(
  ctx: ClientContext,
  sessionId: SessionId,
): ((text: string, span: TokenSpan) => boolean) | undefined {
  const actx = ctx.sessions.scope(sessionId)
  if (actx === undefined) return undefined
  return (text, span) => actx.bail(actx, 'slash/input-insert-text', { text, span }) === true
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
