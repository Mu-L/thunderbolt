import { describe, expect, it } from 'bun:test'
import { HaystackClient } from './client'

const apiKey = process.env.HAYSTACK_API_KEY ?? ''
const baseUrl = process.env.HAYSTACK_BASE_URL ?? 'https://api.cloud.deepset.ai'
const workspaceName = process.env.HAYSTACK_WORKSPACE_NAME ?? ''
const pipelineName = process.env.HAYSTACK_PIPELINE_NAME ?? ''
const pipelineId = process.env.HAYSTACK_PIPELINE_ID ?? ''

const isConfigured = Boolean(apiKey && workspaceName && pipelineName && pipelineId)

describe.skipIf(!isConfigured)('Haystack E2E', () => {
  const client = new HaystackClient({ apiKey, baseUrl, workspaceName, pipelineName, pipelineId })

  it('should create session, send message, and get documents', async () => {
    const session = await client.createSession()
    expect(session.searchSessionId).toBeTruthy()

    const response = await client.chat({
      query: 'What documents are in this workspace?',
      sessionId: session.searchSessionId,
    })

    expect(response.queryId).toBeTruthy()
    expect(response.results).toHaveLength(1)
    expect(response.results[0].answers).toHaveLength(1)
    expect(response.results[0].answers[0].answer).toBeTruthy()
    expect(response.results[0].answers[0].type).toBe('generative')
    expect(response.results[0].documents.length).toBeGreaterThan(0)
  }, 30000)

  it('should maintain conversational context in follow-up', async () => {
    const session = await client.createSession()

    await client.chat({
      query: 'What documents are in this workspace?',
      sessionId: session.searchSessionId,
    })

    const followUp = await client.chat({
      query: 'Tell me more about the first document you mentioned',
      sessionId: session.searchSessionId,
    })

    expect(followUp.results[0].answers[0].answer).toBeTruthy()
    expect(followUp.results[0].documents.length).toBeGreaterThan(0)
  }, 60000)

  it('should list sessions including newly created one', async () => {
    const session = await client.createSession()

    const list = await client.listSessions()
    expect(list.total).toBeGreaterThan(0)

    const found = list.searchSessions.find((s) => s.searchSessionId === session.searchSessionId)
    expect(found).toBeTruthy()
    expect(found?.pipelineId).toBe(pipelineId)
  }, 15000)
})
