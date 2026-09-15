import { describe, expect, it } from 'vitest'
import { AddAssetsService, validateAddAssetsSettings } from '../src/host/index.ts'
import type { AddAssetsSettings } from '../src/host/types.ts'

/** A composition row every field of which the loader would accept. */
const COMPLETE: AddAssetsSettings = {
  replaceCommandButton: true,
  deviceUpload: true,
  outsideWorkspace: true,
  browseMaxEntries: 500,
  filesShortcut: 'mod+u',
  foldersShortcut: 'mod+shift+u',
  commandShortcut: 'mod+/',
  pickerResultLimit: 20,
  previewDensity: 'card',
  previewDetails: true,
}

const Config = AddAssetsService.Config

describe('Config', () => {
  it('accepts a complete row unchanged', () => {
    expect(Config(COMPLETE)).toEqual(COMPLETE)
  })

  it('refuses a row missing a field rather than inventing one', () => {
    const { previewDensity: _omitted, ...partial } = COMPLETE
    expect(() => Config(partial as AddAssetsSettings)).toThrow()
  })

  it('refuses a row count outside the bounds the picker can render', () => {
    expect(() => Config({ ...COMPLETE, pickerResultLimit: 0 })).toThrow()
    expect(() => Config({ ...COMPLETE, pickerResultLimit: 201 })).toThrow()
    expect(() => Config({ ...COMPLETE, pickerResultLimit: 2.5 })).toThrow()
  })

  it('refuses a level cap the Host would not honour', () => {
    expect(() => Config({ ...COMPLETE, browseMaxEntries: 0 })).toThrow()
    expect(() => Config({ ...COMPLETE, browseMaxEntries: 2001 })).toThrow()
    expect(Config({ ...COMPLETE, browseMaxEntries: 2000 }).browseMaxEntries).toBe(2000)
  })

  it('refuses a preview density it draws no cards for', () => {
    expect(() => Config({ ...COMPLETE, previewDensity: 'huge' as 'card' })).toThrow()
  })
})

describe('validateAddAssetsSettings', () => {
  it('accepts the chords the browser can match, and blank for no shortcut', () => {
    expect(() => { validateAddAssetsSettings(COMPLETE) }).not.toThrow()
    expect(() => {
      validateAddAssetsSettings({ ...COMPLETE, filesShortcut: '', foldersShortcut: '', commandShortcut: '' })
    }).not.toThrow()
  })

  it('rejects a chord that would be stored and then never fire, naming the field', () => {
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, filesShortcut: 'mod+' }) })
      .toThrow(/filesShortcut/)
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, foldersShortcut: 'super+u' }) })
      .toThrow(/foldersShortcut/)
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, commandShortcut: 'mod+nope' }) })
      .toThrow(/commandShortcut/)
  })

  it('rejects a chord with no mod or alt, which would block that key while typing', () => {
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, filesShortcut: '/' }) }).toThrow(/filesShortcut/)
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, foldersShortcut: 'shift+u' }) }).toThrow(/foldersShortcut/)
    expect(() => { validateAddAssetsSettings({ ...COMPLETE, commandShortcut: 'enter' }) }).toThrow(/commandShortcut/)
  })
})
