import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `node:fs/promises` with `opendir` and `stat` observed. The listing's whole point is what it does
 * NOT do — stat entries it will not report, keep reading after an abort — and neither is visible in
 * its result, so the calls themselves are what these tests count.
 */
const probe = vi.hoisted(() => ({ stats: 0, dirents: 0, onDirent: undefined as (() => void) | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    stat: (async (...args: Parameters<typeof original.stat>) => {
      probe.stats += 1
      return original.stat(...args)
    }) as typeof original.stat,
    opendir: (async (...args: Parameters<typeof original.opendir>) => {
      const dir = await original.opendir(...args)
      const iterate = dir[Symbol.asyncIterator].bind(dir)
      // Counting on the iterator the listing consumes, so an abort that "stops" only after the
      // whole directory was read anyway shows up as a count, not as a passing test.
      dir[Symbol.asyncIterator] = async function* counted() {
        for await (const dirent of { [Symbol.asyncIterator]: iterate }) {
          probe.dirents += 1
          probe.onDirent?.()
          yield dirent
        }
      }
      return dir
    }) as typeof original.opendir,
  }
})

const { AssetBrowseError, crumbsOf, fullyQualified, listAssets, resolveStart } = await import('../src/host/browse.ts')

/** Files in the large fixture; enough that reading all of them is clearly distinguishable from not. */
const LARGE = 5_000

let root: string
let large: string
let mixed: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'add-assets-browse-'))
  large = join(root, 'large')
  mkdirSync(large)
  for (let index = 0; index < LARGE; index += 1) {
    closeSync(openSync(join(large, `f${String(index).padStart(5, '0')}.txt`), 'w'))
  }
  mixed = join(root, 'mixed')
  mkdirSync(mixed)
  mkdirSync(join(mixed, 'zeta'))
  mkdirSync(join(mixed, 'Alpha'))
  mkdirSync(join(mixed, '.hidden'))
  writeFileSync(join(mixed, 'b.txt'), '')
  writeFileSync(join(mixed, 'A.md'), '')
  symlinkSync(join(mixed, 'zeta'), join(mixed, 'link-to-dir'))
  symlinkSync(join(mixed, 'b.txt'), join(mixed, 'link-to-file'))
  symlinkSync(join(mixed, 'missing'), join(mixed, 'broken-link'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  probe.stats = 0
  probe.dirents = 0
  probe.onDirent = undefined
})

/** A signal nothing aborts. */
const live = (): AbortSignal => new AbortController().signal

describe('listAssets', () => {
  it('reports directories first, then files, name-sorted, following symlinks and dropping broken ones', async () => {
    const listing = await listAssets({ path: mixed, query: '', maxEntries: 100, signal: live() })
    expect(listing.entries.map(entry => `${entry.kind}:${entry.name}`)).toEqual([
      'directory:.hidden', 'directory:Alpha', 'directory:link-to-dir', 'directory:zeta',
      'file:A.md', 'file:b.txt', 'file:link-to-file',
    ])
    expect(listing.entries.find(entry => entry.name === '.hidden')?.hidden).toBe(true)
    expect(listing.entries.find(entry => entry.name === 'zeta')?.path).toBe(join(mixed, 'zeta'))
    expect(listing.path).toBe(mixed)
    expect(listing.crumbs.at(-1)).toEqual({ name: 'mixed', path: mixed })
    expect(listing.truncated).toBe(false)
  })

  it('filters by name before the cap, case-insensitively', async () => {
    const listing = await listAssets({ path: large, query: 'F04999', maxEntries: 5, signal: live() })
    expect(listing.entries.map(entry => entry.name)).toEqual(['f04999.txt'])
    expect(listing.truncated).toBe(false)
  })

  it('keeps only a window of the cap over a large level and says it truncated', async () => {
    const listing = await listAssets({ path: large, query: '', maxEntries: 50, signal: live() })
    expect(listing.entries).toHaveLength(50)
    expect(listing.entries[0]?.name).toBe('f00000.txt')
    expect(listing.entries[49]?.name).toBe('f00049.txt')
    expect(listing.truncated).toBe(true)
  })

  it('gives real directories the window before files', async () => {
    const listing = await listAssets({ path: mixed, query: '', maxEntries: 3, signal: live() })
    expect(listing.entries.map(entry => entry.name)).toEqual(['.hidden', 'Alpha', 'zeta'])
    expect(listing.truncated).toBe(true)
  })

  it('stats only the symlinks it keeps', async () => {
    const links = join(root, 'links')
    mkdirSync(links)
    writeFileSync(join(links, 'target'), '')
    for (let index = 0; index < 200; index += 1) {
      symlinkSync(join(links, 'target'), join(links, `l${String(index).padStart(3, '0')}`))
    }
    const listing = await listAssets({ path: links, query: '', maxEntries: 5, signal: live() })
    expect(listing.entries.map(entry => entry.name)).toEqual(['l000', 'l001', 'l002', 'l003', 'l004'])
    expect(probe.stats).toBe(5)
  })

  it('stops reading the directory when the caller aborts', async () => {
    const controller = new AbortController()
    probe.onDirent = () => { if (probe.dirents === 100) controller.abort(new Error('superseded')) }
    await expect(listAssets({ path: large, query: '', maxEntries: 50, signal: controller.signal }))
      .rejects.toThrow('superseded')
    expect(probe.dirents).toBeLessThan(LARGE)
    // One more read may already be buffered when the abort lands; the rest never are.
    expect(probe.dirents).toBeLessThanOrEqual(101)
  })

  it('refuses before reading anything when already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('gone'))
    await expect(listAssets({ path: large, query: '', maxEntries: 50, signal: controller.signal }))
      .rejects.toThrow('gone')
    expect(probe.dirents).toBe(0)
  })

  it('classifies a file and a missing path', async () => {
    const file = listAssets({ path: join(mixed, 'b.txt'), query: '', maxEntries: 5, signal: live() })
    await expect(file).rejects.toBeInstanceOf(AssetBrowseError)
    await expect(file).rejects.toMatchObject({ code: 'not-a-directory' })
    await expect(listAssets({ path: join(root, 'nope'), query: '', maxEntries: 5, signal: live() }))
      .rejects.toMatchObject({ code: 'unreadable' })
  })

  it('refuses a path that is not fully qualified instead of listing somewhere else', async () => {
    await expect(listAssets({ path: 'relative/dir', query: '', maxEntries: 5, signal: live() }))
      .rejects.toMatchObject({ code: 'unreadable' })
  })
})

describe('fullyQualified', () => {
  it('is plain absoluteness on POSIX', () => {
    expect(fullyQualified('/tmp', 'darwin')).toBe(true)
    expect(fullyQualified('tmp', 'linux')).toBe(false)
  })

  it('accepts only drive-qualified paths on Windows', () => {
    expect(fullyQualified('C:\\Users\\me', 'win32')).toBe(true)
    expect(fullyQualified('d:/data', 'win32')).toBe(true)
    // Rooted but drive-less: resolves against whatever drive the Host process is on.
    expect(fullyQualified('\\foo', 'win32')).toBe(false)
    expect(fullyQualified('/foo', 'win32')).toBe(false)
    expect(fullyQualified('C:foo', 'win32')).toBe(false)
    // UNC: listing one makes the Host reach out to a network server.
    expect(fullyQualified('\\\\server\\share\\dir', 'win32')).toBe(false)
    expect(fullyQualified('//server/share', 'win32')).toBe(false)
    expect(win32.isAbsolute('\\foo')).toBe(true)
  })
})

describe('resolveStart', () => {
  it('reads blank and the tilde forms as the Host home', () => {
    expect(resolveStart('', '/home/me', 'linux')).toBe('/home/me')
    expect(resolveStart('~', '/home/me', 'linux')).toBe('/home/me')
    expect(resolveStart('~/code/', '/home/me', 'linux')).toBe('/home/me/code')
    expect(resolveStart('~\\code', 'C:\\Users\\me', 'win32')).toBe('C:\\Users\\me\\code')
  })

  it('normalizes a qualified path and refuses anything else', () => {
    expect(resolveStart('/tmp/../opt/', '/home/me', 'linux')).toBe(posix.resolve('/opt'))
    expect(resolveStart('C:\\a\\..\\b', 'C:\\Users\\me', 'win32')).toBe('C:\\b')
    expect(resolveStart('code', '/home/me', 'linux')).toBeUndefined()
    expect(resolveStart('~me', '/home/me', 'linux')).toBeUndefined()
    expect(resolveStart('\\\\server\\share', 'C:\\Users\\me', 'win32')).toBeUndefined()
  })
})

describe('crumbsOf', () => {
  it('runs from the root on POSIX', () => {
    expect(crumbsOf('/tmp/a', 'linux')).toEqual([
      { name: '/', path: '/' }, { name: 'tmp', path: '/tmp' }, { name: 'a', path: '/tmp/a' },
    ])
  })

  it('runs from the drive on Windows', () => {
    expect(crumbsOf('C:\\Users\\me', 'win32')).toEqual([
      { name: 'C:\\', path: 'C:\\' }, { name: 'Users', path: 'C:\\Users' }, { name: 'me', path: 'C:\\Users\\me' },
    ])
  })
})
