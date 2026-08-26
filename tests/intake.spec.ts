import { describe, expect, it, vi } from 'vitest'
import { ImageIntake } from '../src/client/intake.ts'

/** A stand-in for a File; the registry never inspects what it forwards. */
const file = {} as File

describe('ImageIntake', () => {
  it('reports that nobody is listening for a session with no attachment seat', () => {
    expect(new ImageIntake().add('s1', [file])).toBe(false)
  })

  it('forwards to the session that published, and only to it', () => {
    const intake = new ImageIntake()
    const one = vi.fn()
    const two = vi.fn()
    intake.publish('s1', one)
    intake.publish('s2', two)
    expect(intake.add('s1', [file])).toBe(true)
    expect(one).toHaveBeenCalledExactlyOnceWith([file])
    expect(two).not.toHaveBeenCalled()
  })

  it('stops forwarding once the seat withdraws', () => {
    const intake = new ImageIntake()
    const add = vi.fn()
    const dispose = intake.publish('s1', add)
    dispose()
    expect(intake.add('s1', [file])).toBe(false)
    expect(add).not.toHaveBeenCalled()
  })

  it('leaves a replacement in place when the seat it replaced disposes late', () => {
    const intake = new ImageIntake()
    const first = vi.fn()
    const second = vi.fn()
    const disposeFirst = intake.publish('s1', first)
    intake.publish('s1', second)
    disposeFirst()
    expect(intake.add('s1', [file])).toBe(true)
    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })
})
