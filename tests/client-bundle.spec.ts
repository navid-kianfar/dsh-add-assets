/**
 * Render the built browser half's composer seats with the props the INSTALLED harness hands them.
 *
 * This file exists because `tsc` cannot catch the bug it guards against. The package type-checks
 * against a harness checkout whose `conversation.input.left` owner share carried `session`, while
 * the installed harness (0.1.5-rc.2) renders that seat with `renderSlot('conversation.input.left',
 * {})` and delivers session lifecycle through the session kit's `useSession` instead. The plate read
 * `session.removed`, compiled cleanly, and crashed on every render in the real app.
 *
 * So the seats are rendered here from `lib/client.js`, loaded through the same
 * `window.__ModuleLoader__.load({ id, factory })` handoff the harness uses, with:
 *
 * - an EMPTY owner share for the plate, and the installed session kit (`sessionId`, `useSession`,
 *   `useInput`, `inputActions`) beside it;
 * - the installed attachment share (`onAddFiles`, `onRemoveAttachment`, `uploads`, `onRetryFile`,
 *   and a `kind`-tagged union of drafts) for the preview.
 *
 * There is no DOM and no react-dom here. Each component is called once as a function under a React
 * stand-in whose hooks answer their initial values and never run effects — enough to evaluate every
 * render-time read, and to walk the element tree it returns.
 *
 * Runs against `lib/client.js`, so it skips when the package has not been built. `npm test` does not
 * build first; `npm run build && npm test` does.
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const BUNDLE = new URL('../lib/client.js', import.meta.url)
const built = existsSync(BUNDLE)

/** One captured loader entry. */
interface LoaderEntry {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** A registration the fake slot service was asked to make. */
interface Registration {
  readonly options: Record<string, unknown>
  readonly component: (props: Record<string, unknown>) => unknown
}

/** The part of a React element the tree walk reads. */
interface Element {
  readonly type: unknown
  readonly props: Record<string, unknown>
}

const nodeRequire = createRequire(import.meta.url)

/**
 * React with its hooks replaced by single-pass stand-ins: state and refs answer their initial
 * values, memos compute, and effects are dropped — this is a render, not a mount.
 * @returns the module the bundle's `require('react')` receives.
 */
function renderOnceReact(): Record<string, unknown> {
  const react = nodeRequire('react') as Record<string, unknown>
  return {
    ...react,
    useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
    useRef: (current: unknown) => ({ current }),
    useMemo: (compute: () => unknown) => compute(),
    useCallback: (callback: unknown) => callback,
    useEffect: () => {},
    useLayoutEffect: () => {},
    useId: () => 'id',
  }
}

/**
 * A module of inert components carrying every name the bundle reads from one import.
 *
 * The names are listed rather than proxied because the bundle's ESM interop copies a required
 * module's OWN property names onto a namespace object; a Proxy has none, and every named import
 * would read as undefined.
 * @param source - the bundle text.
 * @param binding - the bundle's local name for the module.
 * @returns the stub module.
 */
function stubModule(source: string, binding: string): Record<string, unknown> {
  const names = new Set([...source.matchAll(new RegExp(`\\b${binding}\\.(\\w+)`, 'gu'))].map(match => match[1]!))
  return Object.fromEntries([...names].map(name => [name, Object.defineProperty(() => null, 'name', { value: name })]))
}

/**
 * Load the built bundle and run its apply against a recording context.
 * @returns every slot registration, with its component.
 */
async function applyBundle(): Promise<Registration[]> {
  const source = readFileSync(BUNDLE, 'utf8')
  let entry: LoaderEntry | undefined
  const sandbox = {
    window: { __ModuleLoader__: { load(captured: LoaderEntry) { entry = captured } } },
    navigator: { platform: 'MacIntel', userAgent: '' },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: 'lib/client.js' })
  if (entry === undefined) throw new Error('the bundle did not hand itself to the module loader')
  const table: Record<string, unknown> = {
    react: renderOnceReact(),
    'react/jsx-runtime': nodeRequire('react/jsx-runtime'),
    // Stubs: nothing rendered here opens a portal, and the primitives are only ever element types.
    'react-dom': stubModule(source, 'react_dom'),
    '@deepseek-ai/dsh-client-ui-primitives': stubModule(source, '__deepseek_ai_dsh_client_ui_primitives'),
  }
  const bundle = entry.factory((specifier) => {
    const found = table[specifier]
    if (found === undefined) throw new Error(`the bundle required an unknown module "${specifier}"`)
    return found
  })

  const registrations: Registration[] = []
  const settings = {
    replaceCommandButton: true, deviceUpload: true, outsideWorkspace: true, pickerResultLimit: 20,
    filesShortcut: 'mod+u', foldersShortcut: 'mod+shift+u', commandShortcut: 'mod+/',
    previewDensity: 'card', previewDetails: true,
  }
  const actx = { bail: () => true }
  const ctx: Record<string, unknown> = {
    remote: { $mount: async () => undefined, addAssets: {} },
    slots: {
      inject: (_key: string, callback: () => unknown) => { callback(); return () => {} },
      register: (options: Record<string, unknown>, component: Registration['component']) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    effect: () => () => {},
    settingsScope: { bind: () => ({ getSnapshot: () => ({ value: settings }), set: async () => {} }) },
    sessions: { scope: () => actx },
    // Project discovery is a curated Remote this context does not serve; the child never applies.
    inject: () => () => {},
    plugin: (child: { apply?: (scope: unknown) => void }) => { child.apply?.(ctx) },
    get: (name: string) => ({
      inputTriggers: { registerSource: () => () => {}, sessionOf: () => ({ toggleSource: () => {} }) },
      conversation: { input: { for: () => ({ insertReference: () => true }) } },
    } as Record<string, unknown>)[name],
  }
  await (bundle['apply'] as (context: unknown) => Promise<void>)(ctx)
  return registrations
}

/**
 * Bind a selector hook over a fixed snapshot, the way the slot renderer binds `use<Name>` props.
 * @param snapshot - the value every selector reads.
 * @returns the hook.
 */
function selectorOver<T>(snapshot: T): (select: (value: T) => unknown) => unknown {
  return select => select(snapshot)
}

/**
 * Compose a seat's props the way the slot renderer does: owner share, standard kit, the injected
 * face with its `hooks` bound to `use<Name>`, and the locale seat.
 * @param registration - the captured registration.
 * @param owner - the owner share the render site passes.
 * @param kit - the standard kit for the seat's scope.
 * @returns the full props.
 */
function composeProps(
  registration: Registration,
  owner: Record<string, unknown>,
  kit: Record<string, unknown>,
): Record<string, unknown> {
  const inject = registration.options['inject'] as (sessionId: string) => Record<string, unknown>
  const { hooks, ...face } = inject('s1') as { hooks: Record<string, { getSnapshot(): unknown }> }
  const bound = Object.fromEntries(Object.entries(hooks).map(([name, source]) =>
    [`use${name[0]!.toUpperCase()}${name.slice(1)}`, selectorOver(source.getSnapshot())]))
  return { ...owner, ...kit, ...face, ...bound, t: (key: string) => key }
}

/**
 * Every host element in a rendered tree, including those passed through props such as an anchor.
 * @param node - the tree root.
 * @returns the elements in document order.
 */
function elementsOf(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (node === null || typeof node !== 'object' || !('props' in node)) return []
  const element = node as Element
  return [element, ...Object.values(element.props).flatMap(elementsOf)]
}

/** The installed session kit for a session-scope seat, around one session and input snapshot. */
function sessionKit(session: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  return {
    sessionId: 's1',
    useSession: selectorOver({ sessionId: 's1', removed: false, running: false, blank: true, ...session }),
    useInput: selectorOver({
      draft: '', draftRev: 0, phase: 'plain', occurrences: [], attachmentIds: [], queue: [], ...input,
    }),
    inputActions: { setDraft: vi.fn(), addAttachments: vi.fn(), removeAttachment: vi.fn(), pruneAttachments: vi.fn(), submit: vi.fn() },
    useProjection: () => undefined,
  }
}

describe.skipIf(!built)('the built composer seats under the installed harness contract', () => {
  /**
   * Render the plate once.
   * @returns the `+` button element.
   */
  async function renderPlate(session: Record<string, unknown>, input: Record<string, unknown>): Promise<Element> {
    const plate = (await applyBundle()).find(entry => entry.options['name'] === 'conversation.input.left')
    expect(plate, 'the plate registered into conversation.input.left').toBeDefined()
    // `{}` is exactly what the installed composer passes this seat.
    const tree = plate!.component(composeProps(plate!, {}, sessionKit(session, input)))
    const button = elementsOf(tree).find(element =>
      element.type === 'button' && element.props['aria-haspopup'] === 'menu')
    expect(button, 'the plate rendered its + button').toBeDefined()
    return button!
  }

  it('renders the plate from an empty owner share without reading one', async () => {
    const button = await renderPlate({}, {})
    expect(button.props['disabled']).toBe(false)
  })

  it('locks the plate from the session kit when the session is removed', async () => {
    expect((await renderPlate({ removed: true }, {})).props['disabled']).toBe(true)
  })

  it('locks the plate while the input machine submits', async () => {
    expect((await renderPlate({}, { phase: 'submitting' })).props['disabled']).toBe(true)
  })

  it('renders image and file drafts from the installed attachment share', async () => {
    const preview = (await applyBundle()).find(entry => entry.options['name'] === 'conversation.input.attachments')
    expect(preview).toBeDefined()
    const onRemoveAttachment = vi.fn()
    const onRetryFile = vi.fn()
    const owner = {
      attachments: [
        { kind: 'image', id: 'img', file: { name: 'shot.png', size: 2048, type: 'image/png' }, previewUrl: 'blob:shot' },
        { kind: 'file', id: 'up', file: { name: 'notes.pdf', size: 4096, type: 'application/pdf' } },
        { kind: 'file', id: 'bad', file: { name: 'data.csv', size: 10, type: 'text/csv' } },
      ],
      canAcceptDrop: true,
      onAddFiles: vi.fn(),
      onRemoveAttachment,
      uploads: { up: { status: 'uploading', loaded: 1, total: 4 }, bad: { status: 'error', message: 'nope' } },
      onRetryFile,
      dropLimits: { count: 4, size: '5MB' },
    }
    const kit = {
      sessionId: 's1',
      useSession: selectorOver({ removed: false }),
      useInput: selectorOver({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }),
      inputActions: undefined,
      useProjection: () => undefined,
    }
    const elements = elementsOf(preview!.component(composeProps(preview!, owner, kit)))

    // One card per draft; only the image renders an <img>, and a file has no preview URL to give it.
    expect(elements.filter(element => element.type === 'li')).toHaveLength(3)
    const images = elements.filter(element => element.type === 'img')
    expect(images.map(element => element.props['src'])).toEqual(['blob:shot'])

    const texts = elements.flatMap(element =>
      typeof element.props['children'] === 'string' ? [element.props['children']] : [])
    expect(texts).toEqual(expect.arrayContaining(['attachment.uploading', 'attachment.uploadFailed']))

    const removers = elements.filter(element => element.props['aria-label'] === 'attachment.remove')
    expect(removers).toHaveLength(3)
    ;(removers[1]!.props['onClick'] as () => void)()
    expect(onRemoveAttachment).toHaveBeenCalledExactlyOnceWith('up')

    const retry = elements.find(element => element.props['aria-label'] === 'attachment.retry')
    expect(retry, 'the failed upload offers a retry').toBeDefined()
    ;(retry!.props['onClick'] as () => void)()
    expect(onRetryFile).toHaveBeenCalledExactlyOnceWith('bad')
  })
})
