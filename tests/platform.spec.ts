import { describe, expect, it } from 'vitest'
import { isApplePlatform } from '../src/client/platform.ts'

describe('isApplePlatform', () => {
  it('trusts the client hint over the frozen fields', () => {
    expect(isApplePlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true)
    expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false)
  })

  it('reads the legacy platform field when no hint is published', () => {
    expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true)
    expect(isApplePlatform({ platform: 'iPhone' })).toBe(true)
    expect(isApplePlatform({ platform: 'Linux x86_64' })).toBe(false)
  })

  it('falls back to the user-agent string', () => {
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true)
    expect(isApplePlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false)
  })

  it('answers no when the navigator says nothing', () => {
    expect(isApplePlatform({})).toBe(false)
  })
})
