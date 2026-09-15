import { describe, expect, it } from 'vitest'
import { isComposingKey } from '../src/client/keyboard.ts'

describe('isComposingKey', () => {
  it('reads an IME composition from either signal browsers send', () => {
    expect(isComposingKey({ isComposing: true, keyCode: 13 })).toBe(true)
    // Safari reports the committing Enter with isComposing already false, but keyCode 229.
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true)
  })

  it('lets an ordinary key through', () => {
    expect(isComposingKey({ isComposing: false, keyCode: 13 })).toBe(false)
  })
})
