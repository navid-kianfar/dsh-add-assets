import { describe, expect, it } from 'vitest'
import {
  appendMentions, basename, browseQuery, crumbsOf, dirnameOf, labelOf, mentionOf, pairMentions,
} from '../src/client/mention.ts'

describe('mentionOf', () => {
  it('writes the natural form of a plain path', () => {
    expect(mentionOf({ path: 'src/client/index.ts', kind: 'file' })).toBe('@src/client/index.ts')
    expect(mentionOf({ path: 'src/client', kind: 'directory' })).toBe('@src/client/')
  })

  it('quotes a path containing whitespace', () => {
    expect(mentionOf({ path: 'my notes.md', kind: 'file' })).toBe('@"my notes.md"')
  })

  it('closes the quote a directory would otherwise leave open for descent', () => {
    expect(mentionOf({ path: 'my folder', kind: 'directory' })).toBe('@"my folder/"')
  })

  it('refuses a path the grammar cannot represent', () => {
    expect(mentionOf({ path: 'we"ird.ts', kind: 'file' })).toBeUndefined()
    expect(mentionOf({ path: 'line\nbreak.ts', kind: 'file' })).toBeUndefined()
  })
})

describe('pairMentions', () => {
  it('keeps each mention with the pick it was made from when an earlier pick cannot be referenced', () => {
    const paired = pairMentions([
      { path: '/Users/me/report "final".md', kind: 'file' },
      { path: '/Users/me/budget.xlsx', kind: 'file' },
      { path: '/Users/me/archive', kind: 'directory' },
    ])
    expect(paired.skipped).toBe(1)
    expect(paired.references.map(({ entry, mention }) => [labelOf(entry.path, entry.kind), mention])).toEqual([
      ['budget.xlsx', '@/Users/me/budget.xlsx'],
      ['archive/', '@/Users/me/archive/'],
    ])
  })

  it('skips nothing when every pick is representable', () => {
    const paired = pairMentions([{ path: 'a.ts', kind: 'file' }, { path: 'b', kind: 'directory' }])
    expect(paired).toEqual({
      references: [
        { entry: { path: 'a.ts', kind: 'file' }, mention: '@a.ts' },
        { entry: { path: 'b', kind: 'directory' }, mention: '@b/' },
      ],
      skipped: 0,
    })
  })

  it('counts a pick with a control character as skipped too', () => {
    expect(pairMentions([{ path: 'tab\there.ts', kind: 'file' }])).toEqual({ references: [], skipped: 1 })
  })
})

describe('appendMentions', () => {
  it('separates from existing text and leaves the caret on a fresh word', () => {
    expect(appendMentions('', ['@a.ts'])).toBe('@a.ts ')
    expect(appendMentions('look at', ['@a.ts'])).toBe('look at @a.ts ')
    expect(appendMentions('look at ', ['@a.ts'])).toBe('look at @a.ts ')
    expect(appendMentions('line\n', ['@a.ts'])).toBe('line\n@a.ts ')
  })

  it('joins several in the order they were chosen', () => {
    expect(appendMentions('', ['@a.ts', '@b.ts'])).toBe('@a.ts @b.ts ')
  })

  it('leaves the draft alone when nothing was chosen', () => {
    expect(appendMentions('kept', [])).toBe('kept')
  })
})

describe('browseQuery', () => {
  it('lists a level when a directory is browsed', () => {
    expect(browseQuery('src/', '')).toBe('src/')
    expect(browseQuery('src/', 'cli')).toBe('src/cli')
  })

  it('searches the whole index at the root', () => {
    expect(browseQuery('', 'index')).toBe('index')
    expect(browseQuery('', '')).toBe('')
  })

  it('drops the leading space a filter may open with', () => {
    expect(browseQuery('src/', '  cli')).toBe('src/cli')
  })
})

describe('directory arithmetic', () => {
  it('builds a trail whose last crumb is the browsed directory', () => {
    expect(crumbsOf('', 'Workspace')).toEqual([{ label: 'Workspace', directory: '' }])
    expect(crumbsOf('src/client/', 'Workspace')).toEqual([
      { label: 'Workspace', directory: '' },
      { label: 'src', directory: 'src/' },
      { label: 'client', directory: 'src/client/' },
    ])
  })

  it('splits a path into what a row shows and where it lives', () => {
    expect(basename('src/client/index.ts')).toBe('index.ts')
    expect(basename('src/client/')).toBe('client')
    expect(basename('README.md')).toBe('README.md')
    expect(dirnameOf('src/client/index.ts')).toBe('src/client/')
    expect(dirnameOf('README.md')).toBe('')
  })
})

describe('labelOf', () => {
  it('shows the basename, which is what a chip has room for', () => {
    expect(labelOf('src/client/index.ts', 'file')).toBe('index.ts')
    expect(labelOf('/Users/me/Desktop/shot.png', 'file')).toBe('shot.png')
  })

  it('keeps the trailing slash that marks a directory', () => {
    expect(labelOf('src/client', 'directory')).toBe('client/')
    expect(labelOf('src/client/', 'directory')).toBe('client/')
  })

  it('splits a Windows machine path on either separator', () => {
    expect(labelOf('C:\\Users\\me\\shot.png', 'file')).toBe('shot.png')
    expect(labelOf('C:\\Users\\me\\Desktop\\', 'directory')).toBe('Desktop/')
    expect(labelOf('D:/data/set', 'directory')).toBe('set/')
  })

  it('keeps a backslash that is part of a POSIX name', () => {
    expect(labelOf('/Users/me/a\\b.txt', 'file')).toBe('a\\b.txt')
  })

  it('handles a path with no parent at all', () => {
    expect(labelOf('README.md', 'file')).toBe('README.md')
  })
})
