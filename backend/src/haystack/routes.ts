import type { Auth } from '@/auth/elysia-plugin'
import { Elysia, t } from 'elysia'
import { getSettings, getHaystackPipelines } from '@/config/settings'
import { HaystackClient } from './client'
import { createHaystackWebSocketHandler } from './websocket-handler'

/**
 * Create Haystack routes: file proxy and WebSocket ACP endpoints.
 * Discovery is handled by the generic /agents endpoint.
 * Returns an empty router if Haystack is not configured.
 */
export const createHaystackRoutes = (auth: Auth, fetchFn: typeof fetch = globalThis.fetch) => {
  const settings = getSettings()
  const pipelines = getHaystackPipelines(settings)

  const router = new Elysia({ prefix: '/haystack' })

  if (pipelines.length === 0) {
    return router
  }

  router
    .derive(async ({ request, set }) => {
      const session = await auth.api.getSession({ headers: request.headers })

      if (!session) {
        set.status = 401
        return { user: null }
      }

      return { user: session.user }
    })
    .onBeforeHandle(({ user: sessionUser, set }) => {
      if (!sessionUser) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
    })

  const clients = new Map(
    pipelines.map((p) => [
      p.slug,
      new HaystackClient(
        {
          apiKey: settings.haystackApiKey,
          baseUrl: settings.haystackBaseUrl,
          workspaceName: settings.haystackWorkspace,
          pipelineName: p.pipelineName,
          pipelineId: p.pipelineId,
        },
        fetchFn,
      ),
    ]),
  )

  // All pipelines share the same workspace/auth, so any client works for file downloads
  const anyClient = clients.values().next().value as HaystackClient

  router.get(
    '/files/:fileId',
    async ({ params }) => {
      const response = await anyClient.downloadFile(params.fileId)

      // Pass through content type and disposition headers
      const headers: Record<string, string> = {}
      const contentType = response.headers.get('content-type')
      if (contentType) {
        headers['content-type'] = contentType
      }
      const contentDisposition = response.headers.get('content-disposition')
      if (contentDisposition) {
        headers['content-disposition'] = contentDisposition
      }

      return new Response(response.body, { headers })
    },
    {
      params: t.Object({ fileId: t.String() }),
    },
  )

  for (const pipeline of pipelines) {
    const client = clients.get(pipeline.slug)!
    const handler = createHaystackWebSocketHandler(pipeline, client)

    router.ws(`/ws/${pipeline.slug}`, handler)
  }

  return router
}
