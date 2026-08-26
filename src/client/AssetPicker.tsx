/**
 * The workspace picker: a panel anchored above the composer plate that browses the session's
 * working directory and returns the chosen paths as `@path` mentions.
 *
 * Discovery is the Host's own file-reference listing, so what this panel offers is exactly what the
 * composer's `@` completion offers — one query grammar, one set of exclusions, one result cap.
 * @module @achasoft/dsh-add-assets/client/AssetPicker
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronRightOutline14, IconCloseOutline16, IconFolderClose16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FileReferenceCandidate } from '@deepseek-ai/dsh-file-reference/types'
import type { PickerMode, WorkspaceBrowse } from './contract.ts'
import { FileGlyph } from './Glyphs.tsx'
import {
  basename, browseQuery, crumbsOf, dirnameOf, mentionOf, parentDirectory,
} from './mention.ts'
import css from './AssetPicker.module.css'

/** Panel width, and the distances it keeps from its anchor and from the viewport edges. */
const WIDTH = 380
const GAP = 8
const MARGIN = 12
/** Design cap on the panel's height; the viewport clamps below it on short windows. */
const MAX_HEIGHT = 440

/** Keystroke-to-request delay. Long enough that a typed word is one query, short enough to feel live. */
const QUERY_DEBOUNCE_MS = 120

/** What the panel is currently showing. */
type Status = 'loading' | 'ready' | 'failed'

/** Props of the workspace picker. */
export interface AssetPickerProps {
  /** Which entry opened the panel; folders mode hides files and selects directories. */
  mode: PickerMode
  /** Host discovery for this session's working directory. */
  browse: WorkspaceBrowse
  /** Rows rendered per query, from the settings section. */
  resultLimit: number
  /** The plate button the panel is placed above. */
  anchorRef: RefObject<HTMLElement | null>
  /** Translate bound to this plugin's namespace. */
  t: TranslateNS<'add-assets'>
  /** Dismiss without adding anything. */
  onClose: () => void
  /** Commit the selection as ready-to-insert draft mentions, in selection order. */
  onAdd: (mentions: readonly string[]) => void
}

/**
 * Place the panel above its anchor, clamped inside the viewport.
 * @param anchorRef - the trigger element.
 * @param panelRef - the panel, measured so the clamp uses its real height.
 * @returns the fixed coordinates and height cap, or null before the first measurement.
 */
function usePlacement(
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const available = Math.max(0, rect.top - GAP - MARGIN)
      const maxHeight = Math.min(MAX_HEIGHT, available)
      const height = Math.min(panelRef.current?.offsetHeight ?? maxHeight, maxHeight)
      const left = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN))
      setStyle({ left, top: Math.max(MARGIN, rect.top - GAP - height), width: WIDTH, maxHeight })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    const panel = panelRef.current
    // The panel's own height changes as rows arrive, and a stale placement would leave it hanging
    // below the composer instead of resting on it.
    const observer = typeof ResizeObserver === 'undefined' || panel === null ? null : new ResizeObserver(place)
    if (panel !== null) observer?.observe(panel)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [anchorRef, panelRef])
  return style
}

/**
 * Browse the workspace and choose paths.
 *
 * Selection is kept across navigation and filtering: a person picking three files from three
 * directories adds them in one gesture, which is the reason this panel exists rather than three
 * passes through the composer's `@` completion.
 * @param props - mode, discovery, limits, anchor, copy, and the two settlement callbacks.
 * @returns the portalled panel.
 */
export function AssetPicker({ mode, browse, resultLimit, anchorRef, t, onClose, onAdd }: AssetPickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [directory, setDirectory] = useState('')
  const [filter, setFilter] = useState('')
  const [candidates, setCandidates] = useState<readonly FileReferenceCandidate[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [highlight, setHighlight] = useState(0)
  // Insertion order is the order the user chose in, which is the order the mentions land in the
  // draft; a Map preserves it and still answers "is this path selected" in one lookup.
  const [selected, setSelected] = useState<ReadonlyMap<string, FileReferenceCandidate>>(new Map())
  const style = usePlacement(anchorRef, panelRef)

  useEffect(() => { searchRef.current?.focus() }, [])

  const query = browseQuery(directory, filter)
  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(() => {
      browse.list(query, controller.signal).then((found) => {
        if (controller.signal.aborted) return
        setCandidates(found)
        setStatus('ready')
      }, () => {
        if (controller.signal.aborted) return
        setCandidates([])
        setStatus('failed')
      })
    }, QUERY_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [browse, query])

  // Folders mode hides files outright rather than showing them unselectable: a row that cannot be
  // chosen is noise in a list whose whole purpose is choosing.
  const matching = useMemo(
    () => mode === 'folders' ? candidates.filter(row => row.kind === 'directory') : candidates,
    [candidates, mode],
  )
  const rows = useMemo(() => matching.slice(0, resultLimit), [matching, resultLimit])
  const truncated = matching.length > rows.length
  useEffect(() => { setHighlight(0) }, [rows])

  const toggle = useCallback((candidate: FileReferenceCandidate): void => {
    setSelected((current) => {
      const next = new Map(current)
      if (!next.delete(candidate.path)) next.set(candidate.path, candidate)
      return next
    })
  }, [])

  const descend = useCallback((candidate: FileReferenceCandidate): void => {
    setDirectory(`${candidate.path}/`)
    setFilter('')
    searchRef.current?.focus()
  }, [])

  const ascend = useCallback((): void => {
    setDirectory(current => parentDirectory(current))
    setFilter('')
    searchRef.current?.focus()
  }, [])

  /** A row's primary action: select what this mode collects, descend into what it does not. */
  const activate = useCallback((candidate: FileReferenceCandidate): void => {
    if (mode === 'files' && candidate.kind === 'directory') descend(candidate)
    else toggle(candidate)
  }, [descend, mode, toggle])

  const commit = useCallback((): void => {
    const mentions = [...selected.values()]
      .map(mentionOf)
      .filter((mention): mention is string => mention !== undefined)
    onAdd(mentions)
  }, [onAdd, selected])

  // The panel owns Escape and outside pointers itself: it is portalled out of the composer, so the
  // composer's own dismissal never sees a click that lands on it.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
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

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
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
        if (directory === '' || event.currentTarget.selectionStart !== 0) return
        event.preventDefault()
        ascend()
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

  const crumbs = crumbsOf(directory, t('picker.root'))
  const title = t(mode === 'folders' ? 'picker.folders.title' : 'picker.files.title')

  return createPortal((
    <div
      ref={panelRef}
      className={css.panel}
      style={style ?? { visibility: 'hidden', left: 0, top: 0, width: WIDTH }}
      role="dialog"
      aria-label={title}
    >
      <div className={css.header}>
        <span className={css.title}>{title}</span>
        <button type="button" className={css.close} aria-label={t('picker.close')} onClick={onClose}>
          <IconCloseOutline16 />
        </button>
      </div>

      <nav className={css.crumbs} aria-label={title}>
        {crumbs.map((crumb, index) => (
          <span key={crumb.directory} className={css.crumbCell}>
            {index > 0 ? <span className={css.crumbSeparator} aria-hidden>/</span> : null}
            <button
              type="button"
              className={index === crumbs.length - 1 ? css.crumbCurrent : css.crumb}
              disabled={index === crumbs.length - 1}
              onClick={() => { setDirectory(crumb.directory); setFilter('') }}
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
        placeholder={t(mode === 'folders' ? 'picker.search.folders' : 'picker.search.files')}
        aria-label={t(mode === 'folders' ? 'picker.search.folders' : 'picker.search.files')}
        onChange={(event) => { setFilter(event.target.value) }}
        onKeyDown={onSearchKeyDown}
      />

      <div className={css.body}>
        {status === 'loading' && rows.length === 0 ? <p className={css.note}>{t('picker.loading')}</p> : null}
        {status === 'failed' ? <p className={css.noteError} role="status">{t('picker.failed')}</p> : null}
        {status === 'ready' && rows.length === 0 ? <p className={css.note}>{t('picker.empty')}</p> : null}
        <ul className={css.list} ref={listRef}>
          {rows.map((candidate, index) => {
            const isSelected = selected.has(candidate.path)
            const parent = filter !== '' || directory === '' ? dirnameOf(candidate.path) : ''
            return (
              <li key={`${candidate.kind}:${candidate.path}`}>
                <div className={index === highlight ? css.rowHighlight : css.row}>
                  <button
                    type="button"
                    className={css.rowMain}
                    aria-pressed={mode === 'folders' || candidate.kind === 'file' ? isSelected : undefined}
                    onMouseEnter={() => { setHighlight(index) }}
                    onClick={() => { activate(candidate) }}
                  >
                    <span className={isSelected ? css.checkOn : css.check} aria-hidden>
                      {candidate.kind === 'directory' ? <IconFolderClose16 /> : <FileGlyph />}
                    </span>
                    <span className={css.rowText}>
                      <span className={css.rowName}>
                        {basename(candidate.path)}
                        {candidate.kind === 'directory' ? '/' : ''}
                      </span>
                      {parent === '' ? null : <span className={css.rowPath}>{parent}</span>}
                    </span>
                  </button>
                  {candidate.kind === 'directory' && mode === 'folders' ? (
                    <button
                      type="button"
                      className={css.enter}
                      aria-label={t('picker.enter')}
                      onClick={() => { descend(candidate) }}
                    >
                      <IconChevronRightOutline14 />
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        {truncated ? <p className={css.note}>{t('picker.truncated', { count: rows.length })}</p> : null}
      </div>

      <div className={css.footer}>
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
      </div>
    </div>
  ), document.body)
}
