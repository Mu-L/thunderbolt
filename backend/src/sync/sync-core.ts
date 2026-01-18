/**
 * Core sync logic shared between HTTP and WebSocket handlers
 * Changes are made in one place and reflected in both transport layers
 */

import { user } from '@/db/auth-schema'
import type { db as DbType } from '@/db/client'
import { and, eq, gt } from 'drizzle-orm'
import { syncChanges } from './schema'
import { compareMigrationVersions, getRequiredMigrationVersion, upsertDevice } from './utils'

/**
 * Serialized change format for network transport
 */
export type SerializedChange = {
  table: string
  pk: string // base64 encoded
  cid: string
  val: unknown
  col_version: string // bigint as string
  db_version: string // bigint as string
  site_id: string // base64 encoded
  cl: number
  seq: number
}

/**
 * Context for sync operations
 */
export type SyncContext = {
  database: typeof DbType
  userId: string
  siteId: string
  migrationVersion?: string
}

/**
 * Result of a push operation
 */
export type PushResult =
  | { success: true; serverVersion: string }
  | { success: false; needsUpgrade: true; requiredVersion: string; serverVersion: string }

/**
 * Result of a pull operation
 */
export type PullResult =
  | { success: true; changes: SerializedChange[]; serverVersion: string }
  | { success: false; needsUpgrade: true; requiredVersion: string; serverVersion: string }

/**
 * Check if client's migration version meets the minimum required version
 * Returns null if OK, or the required version if client needs to upgrade
 */
export const checkMigrationVersion = async (
  database: typeof DbType,
  userId: string,
  clientMigrationVersion?: string,
): Promise<string | null> => {
  const requiredVersion = await getRequiredMigrationVersion(database, userId)

  if (requiredVersion && compareMigrationVersions(clientMigrationVersion ?? null, requiredVersion) < 0) {
    return requiredVersion
  }

  return null
}

/**
 * Get the current server version for a user
 */
export const getServerVersion = async (database: typeof DbType, userId: string): Promise<string> => {
  const lastChange = await database
    .select({ id: syncChanges.id })
    .from(syncChanges)
    .where(eq(syncChanges.userId, userId))
    .orderBy(syncChanges.id)
    .limit(1)

  return lastChange[0]?.id.toString() ?? '0'
}

/**
 * Push changes to the server
 * Core logic shared between HTTP and WebSocket handlers
 */
export const pushChanges = async (ctx: SyncContext, changes: SerializedChange[]): Promise<PushResult> => {
  const { database, userId, siteId, migrationVersion } = ctx

  // Check if client's migration version meets the minimum required version
  const requiredVersion = await checkMigrationVersion(database, userId, migrationVersion)

  if (requiredVersion) {
    return {
      success: false,
      needsUpgrade: true,
      requiredVersion,
      serverVersion: '0',
    }
  }

  // Handle empty changes case
  if (changes.length === 0) {
    const serverVersion = await getServerVersion(database, userId)
    return { success: true, serverVersion }
  }

  // Update syncMigrationVersion BEFORE inserting changes
  // This prevents a race condition where another device could pull the new changes
  // before the migration version is updated, bypassing the version check
  if (migrationVersion) {
    const currentVersion = await getRequiredMigrationVersion(database, userId)
    if (compareMigrationVersions(migrationVersion, currentVersion) > 0) {
      await database.update(user).set({ syncMigrationVersion: migrationVersion }).where(eq(user.id, userId))
    }
  }

  // Insert all changes
  // Note: val is already JSON-encoded from cr-sqlite, store it as-is
  const insertedChanges = await database
    .insert(syncChanges)
    .values(
      changes.map((change) => ({
        userId,
        siteId,
        tableName: change.table,
        pk: change.pk,
        cid: change.cid,
        val: change.val !== null && change.val !== undefined ? String(change.val) : null,
        colVersion: BigInt(change.col_version),
        dbVersion: BigInt(change.db_version),
        cl: change.cl,
        seq: change.seq,
        siteIdRaw: change.site_id,
      })),
    )
    .returning()

  // Get the max server version from inserted changes
  const maxServerVersion = Math.max(...insertedChanges.map((c) => c.id))

  // Update or insert device record with migration version
  await upsertDevice(database, userId, siteId, migrationVersion)

  return {
    success: true,
    serverVersion: maxServerVersion.toString(),
  }
}

/**
 * Pull changes from the server since a given version
 * Core logic shared between HTTP and WebSocket handlers
 */
export const pullChanges = async (
  ctx: SyncContext,
  since: number,
  options: { limit?: number } = {},
): Promise<PullResult> => {
  const { database, userId, siteId, migrationVersion } = ctx
  const { limit = 1000 } = options

  // Check if client's migration version meets the minimum required version
  const requiredVersion = await checkMigrationVersion(database, userId, migrationVersion)

  if (requiredVersion) {
    return {
      success: false,
      needsUpgrade: true,
      requiredVersion,
      serverVersion: since.toString(),
    }
  }

  // Get all changes for this user since the given version
  const changes = await database
    .select({
      table: syncChanges.tableName,
      pk: syncChanges.pk,
      cid: syncChanges.cid,
      val: syncChanges.val,
      col_version: syncChanges.colVersion,
      db_version: syncChanges.dbVersion,
      site_id: syncChanges.siteIdRaw,
      cl: syncChanges.cl,
      seq: syncChanges.seq,
      id: syncChanges.id,
    })
    .from(syncChanges)
    .where(and(eq(syncChanges.userId, userId), gt(syncChanges.id, since)))
    .orderBy(syncChanges.id)
    .limit(limit)

  // Get the max server version
  const maxServerVersion = changes.length > 0 ? Math.max(...changes.map((c) => c.id)) : since

  // Transform to serialized format
  // Note: val is stored as-is (already JSON-encoded from cr-sqlite)
  const serializedChanges: SerializedChange[] = changes.map((change) => ({
    table: change.table,
    pk: change.pk,
    cid: change.cid,
    val: change.val,
    col_version: change.col_version.toString(),
    db_version: change.db_version.toString(),
    site_id: change.site_id,
    cl: change.cl,
    seq: change.seq,
  }))

  // Update device last seen and migration version
  await upsertDevice(database, userId, siteId, migrationVersion)

  return {
    success: true,
    changes: serializedChanges,
    serverVersion: maxServerVersion.toString(),
  }
}
