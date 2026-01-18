import type { Auth } from '@/auth/elysia-plugin'
import type { db as DbType } from '@/db/client'
import { Elysia, t } from 'elysia'
import { getServerVersion, pullChanges, pushChanges, type SerializedChange } from './sync-core'

/**
 * Serialized change schema for request validation
 */
const serializedChangeSchema = t.Object({
  table: t.String(),
  pk: t.String(), // base64 encoded
  cid: t.String(),
  val: t.Unknown(),
  col_version: t.String(), // bigint as string
  db_version: t.String(), // bigint as string
  site_id: t.String(), // base64 encoded
  cl: t.Number(),
  seq: t.Number(),
})

/**
 * Helper to get authenticated user from request
 * Returns null if not authenticated
 */
const getAuthenticatedUser = async (_database: typeof DbType, auth: Auth, headers: Headers) => {
  const session = await auth.api.getSession({ headers })
  if (!session) {
    return null
  }
  return session.user
}

/**
 * Create sync routes for multi-device database synchronization
 */
export const createSyncRoutes = (database: typeof DbType, auth: Auth) => {
  return (
    new Elysia({ prefix: '/sync' })
      .onError(({ code, error, set }) => {
        set.status = code === 'VALIDATION' ? 400 : 500
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      })

      /**
       * Push local changes to the server
       * Requires authentication
       */
      .post(
        '/push',
        async ({ body, request, set }) => {
          const authUser = await getAuthenticatedUser(database, auth, request.headers)
          if (!authUser) {
            set.status = 401
            return { success: false, error: 'Unauthorized' }
          }

          const { siteId, changes, migrationVersion } = body

          const result = await pushChanges(
            {
              database,
              userId: authUser.id,
              siteId,
              migrationVersion,
            },
            changes as SerializedChange[],
          )

          return result
        },
        {
          body: t.Object({
            siteId: t.String(),
            changes: t.Array(serializedChangeSchema),
            dbVersion: t.String(),
            migrationVersion: t.Optional(t.String()),
          }),
        },
      )

      /**
       * Pull changes from the server since a given version
       * Requires authentication
       */
      .get(
        '/pull',
        async ({ query, request, set }) => {
          const authUser = await getAuthenticatedUser(database, auth, request.headers)
          if (!authUser) {
            set.status = 401
            return { changes: [], serverVersion: '0', error: 'Unauthorized' }
          }

          const { since, siteId, migrationVersion } = query
          const sinceVersion = parseInt(since, 10) || 0

          const result = await pullChanges(
            {
              database,
              userId: authUser.id,
              siteId: siteId ?? '',
              migrationVersion,
            },
            sinceVersion,
          )

          if (!result.success) {
            return {
              changes: [],
              serverVersion: result.serverVersion,
              needsUpgrade: result.needsUpgrade,
              requiredVersion: result.requiredVersion,
            }
          }

          return {
            changes: result.changes,
            serverVersion: result.serverVersion,
          }
        },
        {
          query: t.Object({
            since: t.String(),
            siteId: t.Optional(t.String()),
            migrationVersion: t.Optional(t.String()),
          }),
        },
      )

      /**
       * Get the current server version for the user
       * Useful for initial sync setup
       */
      .get('/version', async ({ request, set }) => {
        const authUser = await getAuthenticatedUser(database, auth, request.headers)
        if (!authUser) {
          set.status = 401
          return { serverVersion: '0', error: 'Unauthorized' }
        }

        const serverVersion = await getServerVersion(database, authUser.id)

        return { serverVersion }
      })
  )
}
