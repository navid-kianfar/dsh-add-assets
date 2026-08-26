import { describe, expect, it } from 'vitest'
import {
  appendMentions, basename, browseQuery, crumbsOf, dirnameOf, labelOf, mentionOf, parentDirectory,
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

describe('labelOf', () => {
  it('shows the basename, which is what a chip has room for', () => {
    expect(labelOf('src/client/index.ts', 'file')).toBe('index.ts')
    expect(labelOf('/Users/me/Desktop/shot.png', 'file')).toBe('shot.png')
  })

  it('keeps the trailing slash that marks a directory', () => {
    expect(labelOf('src/client', 'directory')).toBe('client/')
    expect(labelOf('src/client/', 'directory')).toBe('client/')
  })

  it('handles a path with no parent at all', () => {
    expect(labelOf('README.md', 'file')).toBe('README.md')
  })
})
