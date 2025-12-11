import { DrizzleAppSchema } from '@powersync/drizzle-driver'
import { modelsTable } from './tables'

/**
 * Drizzle schema object containing tables that should be synced with PowerSync.
 *
 * Currently syncing:
 * - models: AI model configurations
 *
 * TODO: Add more tables later:
 * - settings: User preferences
 * - prompts: User-created prompts
 * - chatThreads: Chat conversation threads
 * - chatMessages: Individual messages within threads
 */
export const drizzleSchema = {
  models: modelsTable,
}

/**
 * PowerSync schema generated from the Drizzle schema.
 * This ensures the PowerSync and Drizzle schemas stay in sync.
 */
export const PowerSyncAppSchema = new DrizzleAppSchema(drizzleSchema)
