import { describe, expect, it } from 'vitest'
import { machineCrumbs, machineLevel, projectLevel } from '../src/client/browse.ts'
import type { AssetListing } from '../src/host/types.ts'

/** A Host listing with the fields these functions read. */
function listing(over: Partial<AssetListing>): AssetListing {
  return {
    path: '/Users/me/code',
    home: '/Users/me',
    crumbs: [
      { name: '/', path: '/' },
      { name: 'Users', path: '/Users' },
      { name: 'me', path: '/Users/me' },
      { name: 'code', path: '/Users/me/code' },
    ],
    entries: [],
    truncated: false,
    ...over,
  }
}

describe('projectLevel', () => {
  const candidates = [
    { path: 'src/client', kind: 'directory' as const },
    { path: 'src/client/index.ts', kind: 'file' as const },
    { path: '.env', kind: 'file' as const },
  ]

  it('derives the name and the hidden flag from the path', () => {
    const level = projectLevel(candidates, 'src/', false, 'Workspace')
    expect(level.entries.map(entry => entry.name)).toEqual(['client', 'index.ts', '.env'])
    expect(level.entries.map(entry => entry.hidden)).toEqual([false, false, true])
  })

  it('shows the parent only while searching, where it is what separates two matches', () => {
    expect(projectLevel(candidates, '', false, 'Workspace').entries.map(entry => entry.parent))
      .toEqual(['', '', ''])
    expect(projectLevel(candidates, '', true, 'Workspace').entries.map(entry => entry.parent))
      .toEqual(['src/', 'src/client/', ''])
  })

  it('builds the trail from the browsed directory, root first', () => {
    expect(projectLevel([], 'src/client/', false, 'Workspace').crumbs).toEqual([
      { label: 'Workspace', directory: '' },
      { label: 'src', directory: 'src/' },
      { label: 'client', directory: 'src/client/' },
    ])
  })

  it('never claims the source truncated, because discovery does not report that', () => {
    expect(projectLevel(candidates, '', false, 'Workspace').truncated).toBe(false)
  })
})

describe('machineCrumbs', () => {
  it('collapses the account home to one step', () => {
    expect(machineCrumbs(listing({}), 'Home')).toEqual([
      { label: 'Home', directory: '/Users/me' },
      { label: 'code', directory: '/Users/me/code' },
    ])
  })

  it('is the home crumb alone at the home directory itself', () => {
    const at = listing({ path: '/Users/me', crumbs: listing({}).crumbs.slice(0, 3) })
    expect(machineCrumbs(at, 'Home')).toEqual([{ label: 'Home', directory: '/Users/me' }])
  })

  it('keeps the full chain for a path outside the home', () => {
    const outside = listing({
      path: '/etc/nginx',
      crumbs: [{ name: '/', path: '/' }, { name: 'etc', path: '/etc' }, { name: 'nginx', path: '/etc/nginx' }],
    })
    expect(machineCrumbs(outside, 'Home')).toEqual([
      { label: '/', directory: '/' },
      { label: 'etc', directory: '/etc' },
      { label: 'nginx', directory: '/etc/nginx' },
    ])
  })

  it('does not mistake a sibling of the home for a child of it', () => {
    const sibling = listing({
      path: '/Users/meadow',
      crumbs: [{ name: '/', path: '/' }, { name: 'Users', path: '/Users' }, { name: 'meadow', path: '/Users/meadow' }],
    })
    expect(machineCrumbs(sibling, 'Home')[0]).toEqual({ label: '/', directory: '/' })
  })
})

describe('machineLevel', () => {
  it('passes the Host kinds, paths, and truncation through', () => {
    const level = machineLevel(listing({
      entries: [
        { name: 'src', path: '/Users/me/code/src', kind: 'directory', hidden: false },
        { name: '.git', path: '/Users/me/code/.git', kind: 'directory', hidden: true },
      ],
      truncated: true,
    }), 'Home')
    expect(level.entries.map(entry => entry.path)).toEqual(['/Users/me/code/src', '/Users/me/code/.git'])
    expect(level.entries.map(entry => entry.hidden)).toEqual([false, true])
    expect(level.truncated).toBe(true)
  })

  it('carries no parent line, since one level shares one directory', () => {
    const level = machineLevel(listing({
      entries: [{ name: 'src', path: '/Users/me/code/src', kind: 'directory', hidden: false }],
    }), 'Home')
    expect(level.entries[0]?.parent).toBe('')
  })
})
