import { getSettings } from '@/config/settings'
import { jwt } from '@elysiajs/jwt'
import { Elysia, t } from 'elysia'
import { type CrudOperation, applyOperation } from './sync'

/**
 * PowerSync API routes for authentication and data sync.
 *
 * These endpoints are called by the PowerSync client connector:
 * - POST /api/powersync/token - Get a JWT for PowerSync authentication
 * - POST /api/powersync/upload - Upload local changes to be applied to Postgres
 */
export const createPowerSyncRoutes = (database: unknown) => {
  const settings = getSettings()

  return new Elysia({ prefix: '/api/powersync' })
    .use(
      jwt({
        name: 'powersyncJwt',
        secret: settings.powersyncJwtSecret,
        exp: `${settings.powersyncTokenExpirySeconds}s`,
        aud: 'powersync',
        kid: settings.powersyncJwtKid,
      }),
    )

    .post(
      '/token',
      async ({ powersyncJwt, body }) => {
        const { userId } = body

        // Generate JWT token for PowerSync
        const expiresAt = new Date(Date.now() + settings.powersyncTokenExpirySeconds * 1000)

        const token = await powersyncJwt.sign({
          sub: userId,
          aud: 'powersync',
          // PowerSync uses 'user_id' claim for sync rules
          user_id: userId,
        })

        return {
          token,
          expiresAt: expiresAt.toISOString(),
        }
      },
      {
        body: t.Object({
          userId: t.String(),
        }),
      },
    )

    .post(
      '/upload',
      async ({ body, set }) => {
        const { userId, operations } = body

        try {
          // Apply each operation to the database
          for (const op of operations) {
            await applyOperation(database, userId, op as CrudOperation)
          }

          return { success: true }
        } catch (error) {
          console.error('PowerSync upload error:', error)
          set.status = 500
          throw new Error(error instanceof Error ? error.message : 'Failed to apply operations')
        }
      },
      {
        body: t.Object({
          userId: t.String(),
          operations: t.Array(
            t.Object({
              op: t.Union([t.Literal('PUT'), t.Literal('PATCH'), t.Literal('DELETE')]),
              table: t.String(),
              id: t.String(),
              data: t.Optional(t.Record(t.String(), t.Unknown())),
            }),
          ),
        }),
      },
    )
}
