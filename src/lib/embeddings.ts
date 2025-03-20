import { emailMessagesTable, embeddingsTable } from '@/db/schema'
import { DrizzleContextType } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { eq, sql } from 'drizzle-orm'

/**
 * Generates embeddings for email messages in the database
 * @param batchSize The number of messages to process in each batch
 * @returns A promise that resolves when the operation is complete
 */
export async function generateEmbeddings(batchSize: number = 100): Promise<void> {
  try {
    await invoke('generate_embeddings', { batchSize })
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    throw error
  }
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const result = await invoke('get_embedding', { text })
    return result as number[]
  } catch (error) {
    console.error('Failed to get embedding:', error)
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
    // Get embedding for the search text
    const embedding = await getEmbedding(searchText)
    // console.log('aaaa')

    // Use vector_distance_cos for similarity search
    // const queryResult = await db
    //   .select({
    //     subject: sql<string>`e.subject`,
    //     text_body: sql<string>`e.text_body`,
    //     date: sql<string>`e.date`,
    //     from: sql<string>`e."from"`,
    //     distance: sql<number>`vector_distance_cos(emb.embedding, vector32(${JSON.stringify(embedding)}))`,
    //   })
    //   .from(
    //     sql`embeddings emb
    //     JOIN email_messages e ON e.id = emb.email_message_id`
    //   )
    //   // .orderBy(sql`distance`)
    //   .limit(limit)

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS embeddings_test_index ON embeddings (libsql_vector_idx(embedding));
    `)

    const y = await db
      .select({
        embedding_id: embeddingsTable.id,
        email_message_id: sql`${emailMessagesTable}.id`.as('email_message_id'),
        distance: sql`vector_distance_cos(${embeddingsTable.embedding}, vector32(${JSON.stringify(embedding)}))`.as('distance'),

        id: sql`${emailMessagesTable}.id`,
        subject: emailMessagesTable.subject,
        text_body: emailMessagesTable.text_body,
        date: emailMessagesTable.date,
        from: emailMessagesTable.from,
      })
      .from(sql`vector_top_k('embeddings_test_index', vector32(${JSON.stringify(embedding)}), ${limit}) as r`)
      .leftJoin(embeddingsTable, sql`${embeddingsTable}.rowid = r.id`)
      .leftJoin(emailMessagesTable, eq(emailMessagesTable.id, sql`email_message_id`))
      .orderBy(sql`distance ASC`)

    console.log('wtf', y)
    return y
  } catch (error) {
    console.error('Failed to search similar messages:', error)
    throw error
  }
}
