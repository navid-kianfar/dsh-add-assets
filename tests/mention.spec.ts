import { describe, expect, it } from 'vitest'
import {
  appendMentions, basename, browseQuery, crumbsOf, dirnameOf, mentionOf, parentDirectory,
  removeMention, scanMentions,
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
  it('walks up one level at a time and stops at the root', () => {
    expect(parentDirectory('src/client/')).toBe('src/')
    expect(parentDirectory('src/')).toBe('')
    expect(parentDirectory('')).toBe('')
  })

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

describe('scanMentions', () => {
  it('finds plain and quoted mentions in document order', () => {
    expect(scanMentions('see @src/a.ts and @"my notes.md" too').map(m => m.path))
      .toEqual(['src/a.ts', 'my notes.md'])
  })

  it('reads a trailing slash as the directory marker', () => {
    expect(scanMentions('@src/ @a.ts @"my dir/"').map(m => m.kind))
      .toEqual(['directory', 'file', 'directory'])
  })

  it('reports spans that address the mention exactly', () => {
    const [found] = scanMentions('hi @a.ts')
    expect(found).toMatchObject({ start: 3, end: 8 })
  })

  it('is not fooled by an @ inside another token', () => {
    expect(scanMentions('mail me at nobody@example.com')).toEqual([])
    expect(scanMentions('a@b')).toEqual([])
  })

  it('ignores a bare @ and an unopened quote', () => {
    expect(scanMentions('@')).toEqual([])
    expect(scanMentions('@""')).toEqual([])
  })

  it('finds a mention at the very start and the very end', () => {
    expect(scanMentions('@a.ts').map(m => m.path)).toEqual(['a.ts'])
    expect(scanMentions('text\n@b.ts').map(m => m.path)).toEqual(['b.ts'])
  })
})

describe('removeMention', () => {
  const only = (draft: string) => scanMentions(draft)[0]!

  it('takes the separator the insertion added', () => {
    const draft = '@a.ts @b.ts '
    expect(removeMention(draft, only(draft))).toBe('@b.ts ')
  })

  it('takes the leading space when the mention ends the draft', () => {
    const draft = 'look at @a.ts'
    expect(removeMention(draft, only(draft))).toBe('look at')
  })

  it('leaves surrounding prose joined correctly', () => {
    const draft = 'before @a.ts after'
    expect(removeMention(draft, only(draft))).toBe('before after')
  })

  it('empties a draft that was one mention', () => {
    const draft = '@a.ts '
    expect(removeMention(draft, only(draft))).toBe('')
  })

  it('removes the one addressed, leaving the rest reachable by a fresh scan', () => {
    const draft = '@a.ts @b.ts @c.ts '
    const next = removeMention(draft, scanMentions(draft)[1]!)
    expect(next).toBe('@a.ts @c.ts ')
    expect(scanMentions(next).map(m => m.path)).toEqual(['a.ts', 'c.ts'])
  })
})
