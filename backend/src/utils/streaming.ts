import type { Stream } from 'openai/streaming'

type ChatCompletionChunk = {
  usage?: any
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: unknown[]
    }
  }>
  [key: string]: any
}

/** Callback invoked when streaming completes with the full response content */
export type StreamCompleteCallback = (responseContent: string) => void

/**
 * Creates a ReadableStream from an OpenAI completion stream with SSE formatting
 * @param completion - The OpenAI completion stream
 * @param model - Model name for logging purposes
 * @param onComplete - Optional callback invoked with full response when streaming completes
 * @returns ReadableStream formatted for Server-Sent Events
 */
export const createSSEStreamFromCompletion = (
  completion: Stream<ChatCompletionChunk>,
  model: string,
  onComplete?: StreamCompleteCallback,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder()
  let lastUsage: any = null
  let isCancelled = false
  let responseContent = '' // Accumulate response content for logging

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          // Stop processing if client disconnected
          if (isCancelled) {
            break
          }

          // Track usage data if present
          if (chunk.usage) {
            lastUsage = chunk.usage
          }

          // Accumulate content for logging callback
          if (onComplete && chunk.choices?.[0]?.delta?.content) {
            responseContent += chunk.choices[0].delta.content
          }

          // Convert chunk back to SSE format for client compatibility
          const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`

          try {
            controller.enqueue(encoder.encode(sseChunk))
          } catch (enqueueError) {
            // Controller already closed (client disconnected)
            break
          }
        }

        // Send [DONE] message if not cancelled
        if (!isCancelled) {
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } catch {
            // Ignore if controller is closed
          }
        }

        // Log usage if captured (PostHog will also capture this automatically)
        if (lastUsage) {
          // console.log('Fireworks usage', {
          //   model,
          //   usage: lastUsage,
          //   analytics: 'captured by PostHog',
          // })
        }

        // Invoke completion callback with accumulated response
        if (onComplete && responseContent) {
          onComplete(responseContent)
        }

        if (controller.desiredSize !== null) {
          controller.close()
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('OpenAI streaming error:', error)
          controller.error(error)
        }
      }
    },
    cancel() {
      // Mark as cancelled to stop processing chunks
      isCancelled = true
      // Abort the OpenAI stream
      completion.controller?.abort()
    },
  })
}
