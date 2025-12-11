import type { AnyDrizzleDatabase, DatabaseInterface } from './database-interface'
import type { PowerSyncConfig } from './powersync-connector'
import type { PowerSyncDatabaseWrapper } from './powersync-database'

export type DatabaseType = 'wa-sqlite' | 'libsql-tauri' | 'bun-sqlite' | 'powersync'

export class DatabaseSingleton {
  static #instance: DatabaseSingleton | null = null
  static #initialized = false

  #database: DatabaseInterface | null = null

  /**
   * Get the initialized DatabaseSingleton instance.
   * Initializes the instance if it doesn't exist.
   * @returns The initialized DatabaseSingleton instance.
   */
  public static get instance(): DatabaseSingleton {
    if (!this.#instance) {
      this.#instance = new DatabaseSingleton()
    }
    return this.#instance
  }

  /**
   * Initialize the database connection.
   * This method is idempotent - it will only initialize once.
   * @param type - The database type to use ('wa-sqlite', 'libsql-tauri', 'bun-sqlite', or 'powersync')
   * @param config - Configuration for the database
   */
  public async initialize({
    type = 'wa-sqlite',
    path,
    powersyncConfig,
  }: {
    type?: DatabaseType
    path: string
    powersyncConfig?: PowerSyncConfig
  }): Promise<AnyDrizzleDatabase> {
    if (DatabaseSingleton.#initialized && this.#database) {
      return this.#database.db
    }

    if (type === 'libsql-tauri') {
      // Lazy load LibSQLTauriDatabase (only used in Tauri/mobile, not browser)
      const { LibSQLTauriDatabase } = await import('./libsql-tauri-database')
      this.#database = new LibSQLTauriDatabase()
    } else if (type === 'bun-sqlite') {
      // Lazy load BunSQLiteDatabase (only used in tests, not production)
      const { BunSQLiteDatabase } = await import('./bun-sqlite-database')
      this.#database = new BunSQLiteDatabase()
    } else if (type === 'powersync') {
      // PowerSync for cross-device sync
      const { PowerSyncDatabaseWrapper } = await import('./powersync-database')
      const powerSyncDb = new PowerSyncDatabaseWrapper()
      if (powersyncConfig) {
        powerSyncDb.configure(powersyncConfig)
      }
      this.#database = powerSyncDb
    } else {
      // Default to wa-sqlite for web (best performance with web workers)
      const { WaSQLiteDatabase } = await import('./wa-sqlite-database')
      this.#database = new WaSQLiteDatabase()
    }

    await this.#database.initialize(path)
    DatabaseSingleton.#initialized = true

    const dbTypeNames: Record<DatabaseType, string> = {
      'libsql-tauri': 'LibSQL for Tauri',
      'bun-sqlite': 'Bun SQLite',
      powersync: 'PowerSync',
      'wa-sqlite': 'wa-sqlite',
    }
    console.info(`Initialized ${dbTypeNames[type]} database at ${path}`)

    return this.#database.db
  }

  /**
   * Get the Drizzle database instance.
   * Throws an error if not initialized.
   */
  public get db() {
    if (!this.#database) {
      throw new Error('DatabaseSingleton not initialized. Call initialize() first.')
    }
    return this.#database.db
  }

  /**
   * Get the database instance.
   * Throws an error if not initialized.
   */
  public get database() {
    if (!this.#database) {
      throw new Error('DatabaseSingleton not initialized. Call initialize() first.')
    }
    return this.#database
  }

  /**
   * Get the PowerSync database instance (if using PowerSync).
   * Returns null if not using PowerSync or not initialized.
   */
  public get powerSyncDatabase(): PowerSyncDatabaseWrapper | null {
    if (!this.#database) {
      return null
    }
    // Check if it's a PowerSync database by checking for the powerSync getter
    if ('powerSync' in this.#database) {
      return this.#database as unknown as PowerSyncDatabaseWrapper
    }
    return null
  }

  /**
   * Check if the database is initialized.
   */
  public get isInitialized(): boolean {
    return DatabaseSingleton.#initialized && this.#database !== null
  }

  /**
   * Close the database connection.
   */
  public async close(): Promise<void> {
    if (this.#database?.close) {
      await this.#database.close()
    }
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    if (this.#instance && this.#instance.#database && this.#instance.#database.close) {
      this.#instance.#database.close()
    }
    if (this.#instance) {
      this.#instance.#database = null
    }
    this.#instance = null
    this.#initialized = false
  }
}
