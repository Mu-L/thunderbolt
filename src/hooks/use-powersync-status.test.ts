import { describe, expect, it } from 'bun:test'
import { mostRecentDate } from './use-powersync-status'

describe('mostRecentDate', () => {
  it('returns b when a is null', () => {
    const b = new Date('2024-01-02')
    expect(mostRecentDate(null, b)).toBe(b)
  })

  it('returns a when b is null', () => {
    const a = new Date('2024-01-02')
    expect(mostRecentDate(a, null)).toBe(a)
  })

  it('returns null when both are null', () => {
    expect(mostRecentDate(null, null)).toBeNull()
  })

  it('returns the more recent date when a is later', () => {
    const a = new Date('2024-01-03')
    const b = new Date('2024-01-01')
    expect(mostRecentDate(a, b)).toBe(a)
  })

  it('returns the more recent date when b is later', () => {
    const a = new Date('2024-01-01')
    const b = new Date('2024-01-03')
    expect(mostRecentDate(a, b)).toBe(b)
  })

  it('returns a when both dates are equal', () => {
    const a = new Date('2024-01-01')
    const b = new Date('2024-01-01')
    expect(mostRecentDate(a, b)).toBe(a)
  })
})
