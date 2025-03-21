import { emailMessagesTable, embeddingsTable } from '@/db/schema'
import { DrizzleContextType } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { eq, sql } from 'drizzle-orm'

/**
 * Initializes the embedder model in the backend
 * @returns A promise that resolves when the embedder is initialized
 */
export async function initEmbedder(): Promise<void> {
  try {
    await invoke('init_embedder')
  } catch (error) {
    console.error('Failed to initialize embedder:', error)
    throw error
  }
}

/**
 * Generates embeddings for email messages in the database
 * @param batchSize The number of messages to process in each batch
 * @returns A promise that resolves with the generated embeddings
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    return await invoke('generate_embeddings', { texts })
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    throw error
  }
}

/**
 * Searches for similar email messages based on text similarity
 * @param searchText The text to search for
 * @param limit The maximum number of results to return (default: 5)
 * @returns A promise that resolves to an array of matching email messages
 */
export async function search(db: DrizzleContextType['db'], searchText: string, limit: number = 5): Promise<any[]> {
  try {
    const [embedding] = await generateEmbeddings([searchText])

    // This is done via migration but I'm putting it here just in case we reset the migrations.
    const indexCreationResult = await db.run(sql`
      CREATE INDEX IF NOT EXISTS embeddings_index ON embeddings (libsql_vector_idx(embedding));
    `)
    console.log('Index Created (If Not Exists):', indexCreationResult)

    const results = await db
      .select({
        distance: sql`vector_distance_cos(${embeddingsTable.embedding}, vector32(${JSON.stringify(embedding)}))`.as('distance'),
        email_message: emailMessagesTable,
      })
      .from(sql`vector_top_k('embeddings_index', vector32(${JSON.stringify(embedding)}), ${limit}) as r`)
      .leftJoin(embeddingsTable, sql`${embeddingsTable}.rowid = r.id`)
      .leftJoin(emailMessagesTable, eq(emailMessagesTable.id, sql`email_message_id`))
      .orderBy(sql`distance ASC`)

    return results
  } catch (error) {
    console.error('Failed to search similar messages:', error)
    throw error
  }
}
