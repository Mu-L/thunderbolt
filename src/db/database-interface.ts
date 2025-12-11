import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type * as schema from './schema'

/**
 * Base type for any async SQLite database with our schema.
 * The second type parameter (QueryResult) varies by driver:
 * - wa-sqlite/libsql: uses `any`
 * - PowerSync: uses `QueryResult` from @powersync/common
 *
 * We use `unknown` to be compatible with both.
 */
export type AnyDrizzleDatabase = BaseSQLiteDatabase<'async', unknown, typeof schema>

export interface DatabaseInterface {
  db: AnyDrizzleDatabase
  initialize(path: string): Promise<void>
  close?(): Promise<void>
}
