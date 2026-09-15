import { describe, expect, it } from 'vitest'
import {
  availableScopes, machineCrumbs, machineLevel, machineRequest, projectLevel,
} from '../src/client/browse.ts'
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
  it('runs from the filesystem root, so every ancestor of the home stays one click away', () => {
    expect(machineCrumbs(listing({}), 'Home')).toEqual([
      { label: '/', directory: '/' },
      { label: 'Users', directory: '/Users' },
      { label: 'Home', directory: '/Users/me' },
      { label: 'code', directory: '/Users/me/code' },
    ])
  })

  it('labels the home crumb at the home directory itself', () => {
    const at = listing({ path: '/Users/me', crumbs: listing({}).crumbs.slice(0, 3) })
    expect(machineCrumbs(at, 'Home').map(crumb => crumb.label)).toEqual(['/', 'Users', 'Home'])
  })

  it('names a directory reached above the home plainly', () => {
    const tmp = listing({
      path: '/tmp/shots',
      crumbs: [{ name: '/', path: '/' }, { name: 'tmp', path: '/tmp' }, { name: 'shots', path: '/tmp/shots' }],
    })
    expect(machineCrumbs(tmp, 'Home')).toEqual([
      { label: '/', directory: '/' },
      { label: 'tmp', directory: '/tmp' },
      { label: 'shots', directory: '/tmp/shots' },
    ])
  })

  it('does not mistake a sibling of the home for the home', () => {
    const sibling = listing({
      path: '/Users/meadow',
      crumbs: [{ name: '/', path: '/' }, { name: 'Users', path: '/Users' }, { name: 'meadow', path: '/Users/meadow' }],
    })
    expect(machineCrumbs(sibling, 'Home').map(crumb => crumb.label)).toEqual(['/', 'Users', 'meadow'])
  })

  it('labels a Windows home the same way', () => {
    const windows = listing({
      path: 'C:\\Users\\me',
      home: 'C:\\Users\\me',
      crumbs: [
        { name: 'C:\\', path: 'C:\\' }, { name: 'Users', path: 'C:\\Users' }, { name: 'me', path: 'C:\\Users\\me' },
      ],
    })
    expect(machineCrumbs(windows, 'Home').map(crumb => crumb.label)).toEqual(['C:\\', 'Users', 'Home'])
  })
})

describe('machineRequest', () => {
  it('filters the browsed level by an ordinary name', () => {
    expect(machineRequest('/Users/me', 'rep')).toEqual({ path: '/Users/me', query: 'rep' })
    expect(machineRequest('', '')).toEqual({ path: '', query: '' })
  })

  it('lists a typed absolute path, filtered by what follows its last separator', () => {
    expect(machineRequest('/Users/me', '/tmp/')).toEqual({ path: '/tmp/', query: '' })
    expect(machineRequest('/Users/me', '/tmp/sho')).toEqual({ path: '/tmp/', query: 'sho' })
    expect(machineRequest('/Users/me', '/')).toEqual({ path: '/', query: '' })
    expect(machineRequest('/Users/me', '  /opt')).toEqual({ path: '/', query: 'opt' })
  })

  it('hands the tilde forms to the Host, which alone knows its home', () => {
    expect(machineRequest('/tmp', '~')).toEqual({ path: '~', query: '' })
    expect(machineRequest('/tmp', '~/Down')).toEqual({ path: '~/', query: 'Down' })
    // Not a path: a name that happens to start with a tilde.
    expect(machineRequest('/tmp', '~backup')).toEqual({ path: '/tmp', query: '~backup' })
  })

  it('splits a Windows path on either separator, and only a Windows path', () => {
    expect(machineRequest('C:\\', 'D:\\data\\re')).toEqual({ path: 'D:\\data\\', query: 're' })
    expect(machineRequest('C:\\', 'D:/data/re')).toEqual({ path: 'D:/data/', query: 're' })
    // On POSIX a backslash is an ordinary name character.
    expect(machineRequest('/Users/me', '/tmp/a\\b')).toEqual({ path: '/tmp/', query: 'a\\b' })
  })
})

describe('availableScopes', () => {
  it('offers project discovery when the fiber has it, and the machine unless turned off', () => {
    expect(availableScopes(true, { outsideWorkspace: true })).toEqual(['project', 'machine'])
    expect(availableScopes(true, { outsideWorkspace: false })).toEqual(['project'])
    expect(availableScopes(false, { outsideWorkspace: true })).toEqual(['machine'])
    expect(availableScopes(false, { outsideWorkspace: false })).toEqual([])
  })

  it('offers the machine while the section has not resolved, as the composition default does', () => {
    expect(availableScopes(false, undefined)).toEqual(['machine'])
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
