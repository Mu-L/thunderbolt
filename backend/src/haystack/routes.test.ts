import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { Elysia, t } from 'elysia'
import type { HaystackClient } from './client'

const createTestHaystackRoutes = (mockClient: Partial<HaystackClient> | null) => {
  return new Elysia({ name: 'haystack-test' })
    .onError(({ code, error, set }) => {
      set.status = code === 'VALIDATION' ? 400 : 500
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      }
    })
    .state('haystackClient', mockClient as HaystackClient | null)
    .post('/sessions', async ({ store }) => {
      if (!store.haystackClient) {
        throw new Error('Haystack service is not configured.')
      }
      const session = await store.haystackClient.createSession()
      return { data: session, success: true }
    })
    .post(
      '/chat',
      async ({ body, store }) => {
        if (!store.haystackClient) {
          throw new Error('Haystack service is not configured.')
        }
        const response = await store.haystackClient.chat({
          query: body.query,
          sessionId: body.sessionId,
          chatHistoryLimit: body.chatHistoryLimit,
        })
        return { data: response, success: true }
      },
      {
        body: t.Object({
          query: t.String(),
          sessionId: t.String(),
          chatHistoryLimit: t.Optional(t.Number()),
        }),
      },
    )
    .get('/sessions', async ({ store }) => {
      if (!store.haystackClient) {
        throw new Error('Haystack service is not configured.')
      }
      const sessions = await store.haystackClient.listSessions()
      return { data: sessions, success: true }
    })
}

describe('Haystack Routes', () => {
  let app: ReturnType<typeof createTestHaystackRoutes>
  let mockCreateSession: ReturnType<typeof mock>
  let mockChat: ReturnType<typeof mock>
  let mockListSessions: ReturnType<typeof mock>

  beforeEach(() => {
    mockCreateSession = mock(() => Promise.resolve({ searchSessionId: 'da81f24c-1586-4518-8360-70f40fcee960' }))
    mockChat = mock(() =>
      Promise.resolve({
        queryId: '34b9ada9-e8b6-434e-8798-882342981e2d',
        results: [
          {
            queryId: '34b9ada9-e8b6-434e-8798-882342981e2d',
            query: 'test',
            answers: [
              { answer: 'test answer', type: 'generative', documentIds: [], files: [], meta: { _references: [] } },
            ],
            documents: [],
          },
        ],
      }),
    )
    mockListSessions = mock(() =>
      Promise.resolve({
        searchSessions: [{ searchSessionId: 'session-1', pipelineId: 'pipeline-1', searchHistory: null }],
        hasMore: false,
        total: 1,
      }),
    )

    const mockClient = {
      createSession: mockCreateSession,
      chat: mockChat,
      listSessions: mockListSessions,
    }

    app = new Elysia().use(createTestHaystackRoutes(mockClient as unknown as HaystackClient))
  })

  describe('POST /sessions', () => {
    it('should create session successfully', async () => {
      const response = await app.handle(new Request('http://localhost/sessions', { method: 'POST' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual({
        data: { searchSessionId: 'da81f24c-1586-4518-8360-70f40fcee960' },
        success: true,
      })
      expect(mockCreateSession).toHaveBeenCalledTimes(1)
    })

    it('should return 500 when service is not configured', async () => {
      const appNoClient = new Elysia().use(createTestHaystackRoutes(null))

      const response = await appNoClient.handle(new Request('http://localhost/sessions', { method: 'POST' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Haystack service is not configured')
    })

    it('should handle upstream API errors', async () => {
      mockCreateSession.mockRejectedValueOnce(new Error('Haystack API error: 500 Internal Server Error'))

      const response = await app.handle(new Request('http://localhost/sessions', { method: 'POST' }))

      expect(response.status).toBe(500)
    })
  })

  describe('POST /chat', () => {
    it('should send chat message successfully', async () => {
      const response = await app.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'What is in the workspace?', sessionId: 'session-123' }),
        }),
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.queryId).toBe('34b9ada9-e8b6-434e-8798-882342981e2d')
      expect(mockChat).toHaveBeenCalledWith({
        query: 'What is in the workspace?',
        sessionId: 'session-123',
        chatHistoryLimit: undefined,
      })
    })

    it('should pass chatHistoryLimit when provided', async () => {
      const response = await app.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', sessionId: 'session-123', chatHistoryLimit: 5 }),
        }),
      )

      expect(response.status).toBe(200)
      expect(mockChat).toHaveBeenCalledWith({
        query: 'test',
        sessionId: 'session-123',
        chatHistoryLimit: 5,
      })
    })

    it('should return 400 when query is missing', async () => {
      const response = await app.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'session-123' }),
        }),
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 400 when sessionId is missing', async () => {
      const response = await app.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test' }),
        }),
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.success).toBe(false)
    })

    it('should return 500 when service is not configured', async () => {
      const appNoClient = new Elysia().use(createTestHaystackRoutes(null))

      const response = await appNoClient.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', sessionId: 'session-123' }),
        }),
      )

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Haystack service is not configured')
    })

    it('should handle upstream API errors', async () => {
      mockChat.mockRejectedValueOnce(new Error('Haystack API error: 429 Too Many Requests'))

      const response = await app.handle(
        new Request('http://localhost/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', sessionId: 'session-123' }),
        }),
      )

      expect(response.status).toBe(500)
    })
  })

  describe('GET /sessions', () => {
    it('should list sessions successfully', async () => {
      const response = await app.handle(new Request('http://localhost/sessions', { method: 'GET' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.data.searchSessions).toHaveLength(1)
      expect(data.data.total).toBe(1)
      expect(data.data.hasMore).toBe(false)
      expect(mockListSessions).toHaveBeenCalledTimes(1)
    })

    it('should return 500 when service is not configured', async () => {
      const appNoClient = new Elysia().use(createTestHaystackRoutes(null))

      const response = await appNoClient.handle(new Request('http://localhost/sessions', { method: 'GET' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Haystack service is not configured')
    })

    it('should handle upstream API errors', async () => {
      mockListSessions.mockRejectedValueOnce(new Error('Haystack API error: 403 Forbidden'))

      const response = await app.handle(new Request('http://localhost/sessions', { method: 'GET' }))

      expect(response.status).toBe(500)
    })
  })
})
