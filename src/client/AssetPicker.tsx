/**
 * The path picker: a panel anchored above the composer plate that browses either the session's
 * working directory or the Host filesystem, and returns the chosen paths as `@path` mentions.
 *
 * The panel's height is FIXED for a given viewport. A panel that grew and shrank with its row count
 * would move on every keystroke, because it is anchored by its bottom edge to a composer that does
 * not move — so filtering would walk the list out from under the pointer about to click it.
 * @module @achasoft/dsh-add-assets/client/AssetPicker
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCheckOutline14, IconChevronRightOutline14, IconCloseOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AssetBrowse, BrowseEntry, BrowseLevel, BrowseScope, PickerMode } from './contract.ts'
import { FileGlyph, FolderGlyph, MachineGlyph, ProjectGlyph } from './Glyphs.tsx'
import { isComposingKey } from './keyboard.ts'
import { lastSeparator } from './mention.ts'
import type { PickedPath } from './mention.ts'
import css from './AssetPicker.module.css'

/** Panel geometry, and the distances it keeps from its anchor and from the viewport edges. */
const WIDTH = 400
const GAP = 8
const MARGIN = 12
/** Design height; the viewport clamps below it on short windows, and nothing else changes it. */
const HEIGHT = 452

/** Keystroke-to-request delay. Long enough that a typed word is one query, short enough to feel live. */
const QUERY_DEBOUNCE_MS = 120

/** What the panel is currently showing. */
type Status = 'loading' | 'ready' | 'failed'

/** An empty level, so a failed or in-flight query still renders one stable list container. */
const EMPTY_LEVEL: BrowseLevel = { crumbs: [], entries: [], truncated: false }

/** Props of the path picker. */
export interface AssetPickerProps {
  /** Which entry opened the panel; folders mode hides files and selects directories. */
  mode: PickerMode
  /** Path discovery for both scopes. */
  browse: AssetBrowse
  /**
   * Scopes on offer, in order; never empty while the panel is mounted. Live: when the one being
   * browsed is withdrawn, the panel moves to the first that remains.
   */
  scopes: readonly BrowseScope[]
  /** Rows rendered per level, from the settings section. */
  resultLimit: number
  /** The plate button the panel is placed above. */
  anchorRef: RefObject<HTMLElement | null>
  /** Translate bound to this plugin's namespace. */
  t: TranslateNS<'add-assets'>
  /** Dismiss without adding anything. */
  onClose: () => void
  /** Commit the chosen paths, in selection order; the owner decides how they enter the draft. */
  onAdd: (paths: readonly PickedPath[]) => void
}

/**
 * Whether a crumb label is itself a root spelling that ends in a separator.
 * @param label - the crumb's display text.
 * @returns true for `/`, `C:\`, and the like.
 */
function endsWithSeparator(label: string): boolean {
  return label.length > 0 && lastSeparator(label) === label.length - 1
}

/**
 * Place the panel above its anchor at a fixed height.
 *
 * Only the anchor and the viewport move it. The panel is never measured, which is what makes its
 * position independent of how many rows the current filter matched.
 * @param anchorRef - the trigger element.
 * @returns the fixed coordinates and height, or null before the first measurement.
 */
function usePlacement(anchorRef: RefObject<HTMLElement | null>): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const height = Math.min(HEIGHT, Math.max(0, rect.top - GAP - MARGIN))
      const left = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN))
      setStyle({ left, top: Math.max(MARGIN, rect.top - GAP - height), width: WIDTH, height })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchorRef])
  return style
}

/**
 * Browse paths and choose them.
 *
 * Selection survives navigation, filtering, and the scope switch: a person collecting three files
 * from three directories adds them in one gesture, which is the reason this panel exists rather
 * than three passes through the composer's `@` completion.
 * @param props - mode, discovery, limits, anchor, copy, and the two settlement callbacks.
 * @returns the portalled panel.
 */
export function AssetPicker({ mode, browse, scopes, resultLimit, anchorRef, t, onClose, onAdd }: AssetPickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [scope, setScope] = useState<BrowseScope>(() => scopes[0] ?? 'project')
  const [directory, setDirectory] = useState(() => browse.start(scopes[0] ?? 'project'))
  const [filter, setFilter] = useState('')
  const [level, setLevel] = useState<BrowseLevel>(EMPTY_LEVEL)
  const [status, setStatus] = useState<Status>('loading')
  const [failure, setFailure] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [showHidden, setShowHidden] = useState(false)
  // Insertion order is the order the user chose in, which is the order the mentions land in the
  // draft; a Map preserves it and still answers "is this path selected" in one lookup.
  const [selected, setSelected] = useState<ReadonlyMap<string, BrowseEntry>>(new Map())
  const style = usePlacement(anchorRef)

  useEffect(() => { searchRef.current?.focus() }, [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(() => {
      browse.list(scope, directory, filter, controller.signal).then((next) => {
        if (controller.signal.aborted) return
        setLevel(next)
        setStatus('ready')
      }, (error: unknown) => {
        if (controller.signal.aborted) return
        setLevel(EMPTY_LEVEL)
        setFailure(error instanceof Error ? error.message : '')
        setStatus('failed')
      })
    }, QUERY_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [browse, directory, filter, scope])

  // Folders mode hides files outright rather than showing them unselectable: a row that cannot be
  // chosen is noise in a list whose whole purpose is choosing.
  const matching = useMemo(
    () => level.entries.filter(entry =>
      (showHidden || !entry.hidden) && (mode !== 'folders' || entry.kind === 'directory')),
    [level.entries, mode, showHidden],
  )
  const rows = useMemo(() => matching.slice(0, resultLimit), [matching, resultLimit])
  const truncated = level.truncated || matching.length > rows.length
  useEffect(() => { setHighlight(0) }, [rows])

  const toggle = useCallback((entry: BrowseEntry): void => {
    setSelected((current) => {
      const next = new Map(current)
      if (!next.delete(entry.path)) next.set(entry.path, entry)
      return next
    })
  }, [])

  const descend = useCallback((entry: BrowseEntry): void => {
    // Project paths are slash-terminated to mean "directory"; machine paths are absolute and the
    // Host joins the separator itself.
    setDirectory(scope === 'project' ? `${entry.path}/` : entry.path)
    setFilter('')
    searchRef.current?.focus()
  }, [scope])

  const goTo = useCallback((next: string): void => {
    setDirectory(next)
    setFilter('')
    searchRef.current?.focus()
  }, [])

  const switchScope = useCallback((next: BrowseScope): void => {
    setScope(next)
    setDirectory(browse.start(next))
    setFilter('')
    searchRef.current?.focus()
  }, [browse])

  // A settings change can withdraw the scope being browsed while the panel is open; staying on it
  // would keep listing through an endpoint the person just turned off.
  useEffect(() => {
    const fallback = scopes[0]
    if (scopes.includes(scope) || fallback === undefined) return
    switchScope(fallback)
  }, [scope, scopes, switchScope])

  /** A row's primary action: select what this mode collects, descend into what it does not. */
  const activate = useCallback((entry: BrowseEntry): void => {
    if (mode === 'files' && entry.kind === 'directory') descend(entry)
    else toggle(entry)
  }, [descend, mode, toggle])

  const commit = useCallback((): void => {
    onAdd([...selected.values()].map(entry => ({ path: entry.path, kind: entry.kind })))
  }, [onAdd, selected])

  // The panel owns Escape and outside pointers itself: it is portalled out of the composer, so the
  // composer's own dismissal never sees a click that lands on it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      // Escape during an IME composition cancels the composition, not the panel.
      if (event.key !== 'Escape' || isComposingKey(event)) return
      event.preventDefault()
      onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) === true || anchorRef.current?.contains(target) === true) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [anchorRef, onClose])

  useEffect(() => {
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const crumbs = level.crumbs
  const parentCrumb = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // While an IME composes, Enter commits a candidate and the arrows move between candidates; none
    // of them are the panel's to act on.
    if (isComposingKey(event.nativeEvent)) return
    const row = rows[highlight]
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlight(current => (rows.length === 0 ? 0 : (current + 1) % rows.length))
        return
      case 'ArrowUp':
        event.preventDefault()
        setHighlight(current => (rows.length === 0 ? 0 : (current - 1 + rows.length) % rows.length))
        return
      case 'ArrowRight':
        // Only at the end of the field: mid-text this key is ordinary caret movement.
        if (row?.kind !== 'directory' || event.currentTarget.selectionStart !== filter.length) return
        event.preventDefault()
        descend(row)
        return
      case 'ArrowLeft':
        if (parentCrumb === undefined || event.currentTarget.selectionStart !== 0) return
        event.preventDefault()
        goTo(parentCrumb.directory)
        return
      case 'Enter':
        event.preventDefault()
        // The accelerator commits from anywhere in the panel; a bare Enter acts on the highlight,
        // and on nothing at all when the query matched nothing.
        if (event.metaKey || event.ctrlKey || row === undefined) commit()
        else activate(row)
        return
      default:
    }
  }

  const title = t(mode === 'folders' ? 'picker.folders.title' : 'picker.files.title')
  const placeholder = t(mode === 'folders' ? 'picker.search.folders' : 'picker.search.files')

  return createPortal((
    <div
      ref={panelRef}
      className={css.panel}
      style={style ?? { visibility: 'hidden', left: 0, top: 0, width: WIDTH, height: HEIGHT }}
      role="dialog"
      aria-label={title}
    >
      <header className={css.header}>
        <span className={css.title}>{title}</span>
        <button type="button" className={css.iconButton} aria-label={t('picker.close')} onClick={onClose}>
          <IconCloseOutline16 />
        </button>
      </header>

      {scopes.length > 1 ? (
        <div className={css.scopes} role="tablist" aria-label={t('picker.scope')}>
          {scopes.map(candidate => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={candidate === scope}
              className={candidate === scope ? css.scopeOn : css.scope}
              onClick={() => { switchScope(candidate) }}
            >
              {candidate === 'project' ? <ProjectGlyph size={14} /> : <MachineGlyph size={14} />}
              {t(candidate === 'project' ? 'picker.scope.project' : 'picker.scope.machine')}
            </button>
          ))}
        </div>
      ) : null}

      <nav className={css.crumbs} aria-label={title}>
        {crumbs.map((crumb, index) => (
          <span key={crumb.directory} className={css.crumbCell}>
            {/* No separator after a crumb that already ends in one — the filesystem root `/` or a
                drive `C:\` — which would otherwise read as `/ / Users`. */}
            {index > 0 && !endsWithSeparator(crumbs[index - 1]!.label)
              ? <span className={css.crumbSeparator} aria-hidden>/</span>
              : null}
            <button
              type="button"
              className={index === crumbs.length - 1 ? css.crumbCurrent : css.crumb}
              disabled={index === crumbs.length - 1}
              onClick={() => { goTo(crumb.directory) }}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      <input
        ref={searchRef}
        className={css.search}
        type="text"
        value={filter}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => { setFilter(event.target.value) }}
        onKeyDown={onSearchKeyDown}
      />

      <div className={css.body}>
        <ul className={css.list} ref={listRef}>
          {rows.map((entry, index) => {
            const picked = selected.has(entry.path)
            const selectable = mode === 'folders' || entry.kind === 'file'
            return (
              <li key={`${entry.kind}:${entry.path}`}>
                <div className={index === highlight ? css.rowHighlight : css.row}>
                  <button
                    type="button"
                    className={css.rowMain}
                    aria-pressed={selectable ? picked : undefined}
                    onMouseEnter={() => { setHighlight(index) }}
                    onClick={() => { activate(entry) }}
                  >
                    <span className={entry.kind === 'directory' ? css.iconFolder : css.iconFile} aria-hidden>
                      {entry.kind === 'directory' ? <FolderGlyph size={15} /> : <FileGlyph size={15} />}
                    </span>
                    <span className={css.rowText}>
                      <span className={picked ? css.rowNameOn : css.rowName}>
                        {entry.name}
                        {entry.kind === 'directory' ? '/' : ''}
                      </span>
                      {entry.parent === '' ? null : <span className={css.rowPath}>{entry.parent}</span>}
                    </span>
                    {selectable ? (
                      <span className={picked ? css.tickOn : css.tick} aria-hidden>
                        {picked ? <IconCheckOutline14 /> : null}
                      </span>
                    ) : null}
                  </button>
                  {entry.kind === 'directory' && mode === 'folders' ? (
                    <button
                      type="button"
                      className={css.iconButton}
                      aria-label={t('picker.enter')}
                      onClick={() => { descend(entry) }}
                    >
                      <IconChevronRightOutline14 />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        {status === 'loading' && rows.length === 0 ? <p className={css.note}>{t('picker.loading')}</p> : null}
        {status === 'failed'
          ? <p className={css.noteError} role="status">{failure === '' ? t('picker.failed') : failure}</p>
          : null}
        {status === 'ready' && rows.length === 0 ? <p className={css.note}>{t('picker.empty')}</p> : null}
        {truncated ? <p className={css.noteQuiet}>{t('picker.truncated', { count: rows.length })}</p> : null}
      </div>

      <footer className={css.footer}>
        <label className={css.hidden}>
          <input
            type="checkbox"
            className={css.checkbox}
            checked={showHidden}
            onChange={(event) => { setShowHidden(event.target.checked) }}
          />
          {t('picker.showHidden')}
        </label>
        <span className={css.count}>{t('picker.selected', { count: selected.size })}</span>
        <button
          type="button"
          className={css.clear}
          disabled={selected.size === 0}
          onClick={() => { setSelected(new Map()) }}
        >
          {t('picker.clear')}
        </button>
        <button type="button" className={css.add} disabled={selected.size === 0} onClick={commit}>
          {selected.size === 0 ? t('picker.add') : t('picker.addCount', { count: selected.size })}
        </button>
      </footer>
    </div>
  ), document.body)
}
