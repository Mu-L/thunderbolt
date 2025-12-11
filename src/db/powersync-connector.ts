import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web'

export type PowerSyncConfig = {
  /** PowerSync instance URL (e.g., https://your-instance.powersync.com) */
  powersyncUrl: string
  /** Backend URL for fetching auth tokens and uploading data */
  backendUrl: string
  /** Hardcoded user ID for POC (will be replaced with real auth later) */
  userId: string
}

/**
 * PowerSync backend connector that handles:
 * 1. Fetching authentication credentials from our backend
 * 2. Uploading local changes to our backend (which syncs to Postgres)
 */
export class PowerSyncConnector implements PowerSyncBackendConnector {
  private config: PowerSyncConfig

  constructor(config: PowerSyncConfig) {
    this.config = config
  }

  /**
   * Fetch credentials from our backend's token endpoint.
   * The backend generates a JWT that PowerSync uses to authenticate.
   */
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const response = await fetch(`${this.config.backendUrl}/api/powersync/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: this.config.userId,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to fetch PowerSync credentials: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return {
      endpoint: this.config.powersyncUrl,
      token: data.token,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    }
  }

  /**
   * Upload local changes to our backend.
   * PowerSync calls this when there are local changes that need to be synced.
   *
   * The backend is responsible for:
   * 1. Validating the changes
   * 2. Applying them to Postgres
   * 3. PowerSync then syncs the changes back to other clients
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction()

    if (!transaction) {
      return
    }

    try {
      // Send all CRUD operations to our backend
      const response = await fetch(`${this.config.backendUrl}/api/powersync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.config.userId,
          operations: transaction.crud.map((op) => ({
            op: op.op,
            table: op.table,
            id: op.id,
            data: op.opData,
          })),
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to upload data: ${response.status} - ${errorText}`)
      }

      // Mark the transaction as complete
      await transaction.complete()
    } catch (error) {
      console.error('PowerSync upload error:', error)
      throw error
    }
  }
}
