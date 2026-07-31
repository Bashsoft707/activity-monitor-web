import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENT_TYPES } from '@/lib/types'
import { pickSample } from '@/lib/simulate'

describe('pickSample', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a payload the API will accept', () => {
    const sample = pickSample()

    expect(EVENT_TYPES).toContain(sample.type)
    expect(sample.label.length).toBeGreaterThan(0)
    // The API caps the label at 200 characters.
    expect(sample.label.length).toBeLessThanOrEqual(200)
  })

  it('never repeats the previous type, so consecutive clicks visibly differ', () => {
    // Exhaustive rather than sampled: for every possible previous pick, and every
    // point Math.random can land, the result must differ from what came before.
    for (const previous of EVENT_TYPES) {
      for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
        vi.spyOn(Math, 'random').mockReturnValue(roll)
        expect(pickSample({ type: previous, label: 'previous' }).type).not.toBe(previous)
      }
    }
  })

  it('always returns a sample even when random lands at the top of the range', () => {
    // Math.random() can return values arbitrarily close to 1; an off-by-one in the
    // index would return undefined here rather than a payload.
    vi.spyOn(Math, 'random').mockReturnValue(0.9999999999)
    expect(pickSample()).toBeDefined()
    expect(pickSample({ type: 'USER_SIGNUP', label: 'previous' })).toBeDefined()
  })

  it('never sends a channel — the server decides it', () => {
    // A client that could pick its own channel could route events to SMS and spend
    // real money.
    for (const type of EVENT_TYPES) {
      expect(pickSample({ type, label: 'previous' })).not.toHaveProperty('channel')
    }
  })

  it('spans every channel across the sample set, so repeated clicks show routing', () => {
    const seen = new Set<string>()
    // Walk the whole set by always excluding the last pick.
    for (const previous of EVENT_TYPES) {
      for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.999]) {
        vi.spyOn(Math, 'random').mockReturnValue(roll)
        seen.add(pickSample({ type: previous, label: 'x' }).type)
      }
    }
    expect(seen.size).toBe(EVENT_TYPES.length)
  })
})
