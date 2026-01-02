import { createTracedSSEStream, startChatTrace } from '@/langsmith/streaming'
import { isLangSmithConfigured } from '@/langsmith/client'
import { isPostHogConfigured } from '@/posthog/client'
import { createSSEStreamFromCompletion } from '@/utils/streaming'
import type { OpenAI as PostHogOpenAI } from '@posthog/ai'
import { Elysia } from 'elysia'
import { APIConnectionError, APIConnectionTimeoutError } from 'openai'
import {
  getInferenceClient,
  isHeliconeConfigured,
  HELICONE_SUPPORTED_PROVIDERS,
  type InferenceProvider,
} from './client'

type ModelConfig = {
  provider: InferenceProvider
  internalName: string
}

export const supportedModels: Record<string, ModelConfig> = {
  'gpt-oss-120b': {
    provider: 'thunderbolt',
    internalName: 'openai/gpt-oss-120b',
  },
  'mistral-medium-3.1': {
    provider: 'mistral',
    internalName: 'mistral-medium-2508',
  },
  'mistral-large-3': {
    provider: 'mistral',
    internalName: 'mistral-large-2512',
  },
  'sonnet-4.5': {
    provider: 'anthropic',
    internalName: 'claude-sonnet-4-5',
  },
}

/**
 * Parse source tags from X-Evaluation-Source header
 * Format: comma-separated tags, e.g., "evaluation,behavioral"
 */
const parseSourceTags = (header: string | null): string[] | undefined => {
  if (!header) return undefined
  return header
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Session context for conversation tracking
 * Used by both LangSmith and Helicone for grouping related requests
 */
type SessionContext = {
  conversationId: string | undefined
  turnNumber: number
}

/**
 * Inference API routes
 */
export const createInferenceRoutes = () => {
  return new Elysia({
    prefix: '/chat',
  }).post('/completions', async (ctx) => {
    const body = await ctx.request.json()

    if (!body.stream) {
      throw new Error('Non-streaming requests are not supported')
    }

    const modelConfig = supportedModels[body.model]
    if (!modelConfig) {
      throw new Error('Model not found')
    }

    const { provider, internalName } = modelConfig

    const { client } = getInferenceClient(provider)

    // Parse conversation session context (for LangSmith + Helicone tracking)
    const session: SessionContext = {
      conversationId: ctx.request.headers.get('X-Conversation-Id') ?? undefined,
      turnNumber: parseInt(ctx.request.headers.get('X-Turn-Number') ?? '1', 10) || 1,
    }

    const heliconeEnabled = isHeliconeConfigured() && HELICONE_SUPPORTED_PROVIDERS.includes(provider)
    const sessionInfo = session.conversationId ? ` [session: ${session.conversationId.slice(0, 8)}...]` : ''
    console.info(
      `Routing model "${body.model}" to ${provider} provider${heliconeEnabled ? ' (via Helicone)' : ''}${sessionInfo}`,
    )

    try {
      const startTime = Date.now()

      // Check for evaluation source header (used by evaluation framework)
      const sourceTags = parseSourceTags(ctx.request.headers.get('X-Evaluation-Source'))

      // Start LangSmith trace if configured
      const traceContext = isLangSmithConfigured()
        ? await startChatTrace(
            body.messages,
            {
              model: body.model,
              provider,
              hasTools: !!body.tools,
              temperature: body.temperature,
              sessionId: session.conversationId,
            },
            sourceTags,
          )
        : null

      // Build per-request headers for Helicone session tracking
      const heliconeSessionHeaders: Record<string, string> =
        isHeliconeConfigured() && HELICONE_SUPPORTED_PROVIDERS.includes(provider) && session.conversationId
          ? {
              'Helicone-Session-Id': session.conversationId,
              'Helicone-Session-Path': `/turn-${session.turnNumber}`,
              'Helicone-Session-Name': 'User Conversation',
            }
          : {}

      const completion = await (client as PostHogOpenAI).chat.completions.create(
        {
          model: internalName,
          messages: body.messages,
          temperature: body.temperature,
          tools: body.tools,
          tool_choice: body.tool_choice,
          stream: true,
          ...(isPostHogConfigured() && {
            posthogProperties: {
              model_provider: provider,
              endpoint: '/chat/completions',
              has_tools: !!body.tools,
              temperature: body.temperature,
              conversation_id: session.conversationId,
            },
          }),
        },
        {
          headers: heliconeSessionHeaders,
        },
      )

      // Use traced streaming if LangSmith is configured
      const stream = traceContext
        ? createTracedSSEStream(completion, traceContext, startTime)
        : createSSEStreamFromCompletion(completion, body.model)

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    } catch (error) {
      if (error instanceof APIConnectionError) {
        console.error('Failed to connect to inference provider', error.cause)
        throw new Error('Failed to connect to inference provider')
      }
      if (error instanceof APIConnectionTimeoutError) {
        console.error('Connection timeout to inference provider', error.cause)
        throw new Error('Connection timeout to inference provider')
      }
      throw error
    }
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createInferenceRoutes instead
 */
export const createOpenAIRoutes = createInferenceRoutes
