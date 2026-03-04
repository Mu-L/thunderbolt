import { describe, expect, it } from 'bun:test'
import { formatSyncElapsed } from './powersync-status'

describe('formatSyncElapsed', () => {
  it('returns null when lastSyncedAt is null', () => {
    expect(formatSyncElapsed(null, Date.now())).toBeNull()
  })

  it('returns "Just synced" when less than 60 seconds ago', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 30 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Just synced')
  })

  it('returns "Just synced" at exactly 0 seconds', () => {
    const now = Date.now()
    expect(formatSyncElapsed(new Date(now), now)).toBe('Just synced')
  })

  it('returns minutes when between 1 and 59 minutes', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 5 * 60 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Synced 5m ago')
  })

  it('returns "Synced 1m ago" at exactly 60 seconds', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 60 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Synced 1m ago')
  })

  it('returns hours when 60+ minutes', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 3 * 60 * 60 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Synced 3h ago')
  })

  it('returns "Synced 1h ago" at exactly 60 minutes', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 60 * 60 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Synced 1h ago')
  })

  it('returns "Synced 24h ago" for 24 hours', () => {
    const now = Date.now()
    const lastSyncedAt = new Date(now - 24 * 60 * 60 * 1000)
    expect(formatSyncElapsed(lastSyncedAt, now)).toBe('Synced 24h ago')
  })
})
