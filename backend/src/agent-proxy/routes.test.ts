import type { ConsoleSpies } from '@/test-utils/console-spies'
import { setupConsoleSpy } from '@/test-utils/console-spies'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { classifyMessage, createAgentProxyRoutes, parseApiKey, parseSSEStream } from './routes'
import { _resetTicketsForTesting, consumeWsTicket, createWsTicket } from '@/auth/ws-ticket'

let consoleSpies: ConsoleSpies
beforeAll(() => {
  consoleSpies = setupConsoleSpy()
})
afterAll(() => {
  consoleSpies.restore()
})

beforeEach(() => {
  _resetTicketsForTesting()
})

describe('parseApiKey', () => {
  it('extracts apiKey from valid JSON', () => {
    expect(parseApiKey('{"apiKey":"sk-abc123"}')).toBe('sk-abc123')
  })

  it('returns null for null input', () => {
    expect(parseApiKey(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseApiKey('')).toBeNull()
  })

  it('returns null when apiKey field is missing', () => {
    expect(parseApiKey('{"other":"value"}')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseApiKey('not json')).toBeNull()
  })

  it('returns null for JSON without object shape', () => {
    expect(parseApiKey('"just a string"')).toBeNull()
  })
})

describe('WS ticket integration', () => {
  it('creates and consumes a ticket with agent payload', () => {
    const payload = { url: 'wss://agent.example.com/ws', authMethod: '{"apiKey":"test-key"}' }
    const ticketId = createWsTicket('user-test', payload)

    const result = consumeWsTicket(ticketId)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user-test')
    expect(result!.payload).toEqual(payload)

    const apiKey = parseApiKey(result!.payload!.authMethod as string)
    expect(apiKey).toBe('test-key')
  })

  it('prevents ticket reuse', () => {
    const ticketId = createWsTicket('user-test')
    expect(consumeWsTicket(ticketId)).not.toBeNull()
    expect(consumeWsTicket(ticketId)).toBeNull()
  })
})

// ── parseSSEStream tests ────────────────────────────────────────────────────

const encode = (text: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

const collect = async (stream: AsyncGenerator<unknown>): Promise<unknown[]> => {
  const items: unknown[] = []
  for await (const item of stream) {
    items.push(item)
  }
  return items
}

describe('parseSSEStream', () => {
  it('parses a single JSON SSE event', async () => {
    const body = encode('data: {"id":1}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ id: 1 }])
  })

  it('parses multiple JSON SSE events', async () => {
    const body = encode('data: {"a":1}\n\ndata: {"b":2}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('skips and logs non-JSON SSE events', async () => {
    const body = encode('data: not json\n\ndata: {"ok":true}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ ok: true }])
  })

  it('returns empty array for empty stream', async () => {
    const body = encode('')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([])
  })

  it('handles data: without space prefix', async () => {
    const body = encode('data:{"no":"space"}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ no: 'space' }])
  })

  it('handles data: with space prefix', async () => {
    const body = encode('data: {"with":"space"}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ with: 'space' }])
  })

  it('joins multi-line data fields', async () => {
    const body = encode('data: {"multi":\ndata: "line"}\n\n')
    const events = await collect(parseSSEStream(body))
    expect(events).toEqual([{ multi: 'line' }])
  })

  it('throws on buffer overflow (>10MB)', async () => {
    const huge = 'data: ' + 'x'.repeat(11 * 1024 * 1024) + '\n\n'
    const body = encode(huge)
    await expect(collect(parseSSEStream(body))).rejects.toThrow('SSE buffer exceeded size limit')
  })
})

// ── classifyMessage tests ───────────────────────────────────────────────────

describe('classifyMessage', () => {
  it('classifies request (has method and id)', () => {
    expect(classifyMessage({ method: 'tools/call', id: 1 })).toBe('request')
  })

  it('classifies notification (has method only)', () => {
    expect(classifyMessage({ method: 'notifications/progress' })).toBe('notification')
  })

  it('classifies response (has neither method)', () => {
    expect(classifyMessage({ result: {}, id: 1 })).toBe('response')
  })
})

// ── Route-level open-handler tests ──────────────────────────────────────────
//
// Elysia's ws() handler cannot easily be invoked end-to-end through app.handle()
// (which is HTTP-only). Instead we reach into the router's recorded hooks and
// invoke the `open` handler directly with a mock ws object. This covers the
// authentication and SSRF-validation branches of the open handler.

type MockWs = {
  id: string
  data: { query: { ticket?: string } }
  closeCalls: Array<{ code?: number; reason?: string }>
  sentMessages: string[]
  send: (data: string | ArrayBuffer) => void
  close: (code?: number, reason?: string) => void
}

const createMockWs = (ticket?: string): MockWs => {
  const ws: MockWs = {
    id: `mock-ws-${Math.random().toString(36).slice(2)}`,
    data: { query: ticket !== undefined ? { ticket } : {} },
    closeCalls: [],
    sentMessages: [],
    send(data) {
      this.sentMessages.push(typeof data === 'string' ? data : String(data))
    },
    close(code, reason) {
      this.closeCalls.push({ code, reason })
    },
  }
  return ws
}

type WsRoute = {
  method: string
  path: string
  hooks: { open: (ws: MockWs) => void | Promise<void> }
}

const getOpenHandler = () => {
  const app = createAgentProxyRoutes()
  const route = (app.router.history as WsRoute[]).find(
    (r) => r.method === 'WS' && r.path === '/agent-proxy/ws/:agentId',
  )
  if (!route) throw new Error('WS route not registered')
  return route.hooks.open
}

describe('createAgentProxyRoutes (open handler)', () => {
  it('registers the agent-proxy ws route', () => {
    const app = createAgentProxyRoutes()
    const route = (app.router.history as WsRoute[]).find(
      (r) => r.method === 'WS' && r.path === '/agent-proxy/ws/:agentId',
    )
    expect(route).toBeDefined()
  })

  it('closes with 4001 when ticket query param is missing', async () => {
    const open = getOpenHandler()
    const ws = createMockWs()
    await open(ws)
    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]!.code).toBe(4001)
  })

  it('closes with 4001 when ticket is invalid or already consumed', async () => {
    const open = getOpenHandler()
    const ws = createMockWs('bogus-ticket-id-that-does-not-exist')
    await open(ws)
    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]!.code).toBe(4001)
  })

  it('closes with 4003 when ticket payload has a private-IP URL (SSRF)', async () => {
    const open = getOpenHandler()
    const ticketId = createWsTicket('user-ssrf', { url: 'http://127.0.0.1/ws' })
    const ws = createMockWs(ticketId)
    await open(ws)
    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]!.code).toBe(4003)
  })

  it('closes with 4004 when ticket has no url in payload', async () => {
    const open = getOpenHandler()
    const ticketId = createWsTicket('user-no-url')
    const ws = createMockWs(ticketId)
    await open(ws)
    expect(ws.closeCalls).toHaveLength(1)
    expect(ws.closeCalls[0]!.code).toBe(4004)
  })

  it('consumes a valid ticket and opens an upstream connection (http scheme)', async () => {
    const open = getOpenHandler()
    // Use a public-looking hostname so SSRF validation passes. The handler will
    // create an HttpConnectionState without issuing any network request until a
    // message arrives, so this is safe to invoke in unit tests.
    const ticketId = createWsTicket('user-valid', { url: 'https://agent.example.com/acp' })
    const ws = createMockWs(ticketId)
    await open(ws)

    // No close should have happened — connection is considered open.
    expect(ws.closeCalls).toEqual([])
    // Ticket must have been consumed (one-time use).
    expect(consumeWsTicket(ticketId)).toBeNull()
  })
})
