import { beforeEach, describe, expect, it } from 'bun:test'
import { _resetTicketsForTesting, consumeWsTicket, createWsTicket } from './ws-ticket'

describe('ws-ticket', () => {
  beforeEach(() => {
    _resetTicketsForTesting()
  })

  it('generates a 64-character hex ticket', () => {
    const ticket = createWsTicket('user-1')
    expect(ticket).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(ticket)).toBe(true)
  })

  it('generates unique tickets', () => {
    const tickets = new Set(Array.from({ length: 100 }, () => createWsTicket('user-1')))
    expect(tickets.size).toBe(100)
  })

  it('consumes a valid ticket and returns userId', () => {
    const ticket = createWsTicket('user-42')
    const result = consumeWsTicket(ticket)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user-42')
  })

  it('returns null on second consumption (one-time use)', () => {
    const ticket = createWsTicket('user-1')
    const first = consumeWsTicket(ticket)
    expect(first).not.toBeNull()
    const second = consumeWsTicket(ticket)
    expect(second).toBeNull()
  })

  it('returns null for unknown ticket', () => {
    const result = consumeWsTicket('0'.repeat(64))
    expect(result).toBeNull()
  })

  it('roundtrips payload', () => {
    const payload = { url: 'wss://example.com', authMethod: '{"apiKey":"abc"}' }
    const ticket = createWsTicket('user-1', payload)
    const result = consumeWsTicket(ticket)
    expect(result).not.toBeNull()
    expect(result!.payload).toEqual(payload)
  })

  it('omits payload when not provided', () => {
    const ticket = createWsTicket('user-1')
    const result = consumeWsTicket(ticket)
    expect(result).not.toBeNull()
    expect(result!.payload).toBeUndefined()
  })

  it('handles high-volume ticket creation without errors', () => {
    // Create more than MAX_TICKETS/2 to trigger eviction
    const tickets: string[] = []
    for (let i = 0; i < 6000; i++) {
      tickets.push(createWsTicket(`user-${i}`))
    }
    // The most recent ticket should still be consumable
    const lastTicket = tickets[tickets.length - 1]
    const result = consumeWsTicket(lastTicket)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user-5999')
  })
})
