import { emailMessagesTable, embeddingsTable } from '@/db/schema'
import { DrizzleContextType } from '@/types'
import { count, eq, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { generateEmbeddings } from './embeddings'

export class Indexer {
  private db: DrizzleContextType['db']
  private batchSize: number
  private isIndexing: boolean
  private shouldCancelAfterNextBatch: boolean
  private messageCount: number
  private embeddingsCount: number
  private debug: {
    slowMessageThreshold: number
    slowMessages: string[]
    totalEmbeddingTime: number
    totalEmbeddingsProcessed: number
  }

  constructor({ db, batchSize = 10 }: { db: DrizzleContextType['db']; batchSize?: number }) {
    this.db = db
    this.batchSize = batchSize
    this.isIndexing = false
    this.shouldCancelAfterNextBatch = false
    this.messageCount = 0
    this.embeddingsCount = 0
    this.debug = {
      slowMessageThreshold: 1000,
      slowMessages: [],
      totalEmbeddingTime: 0,
      totalEmbeddingsProcessed: 0,
    }
  }

  async fetchNextBatch() {
    const messages = await this.db
      .select()
      .from(emailMessagesTable)
      .leftJoin(embeddingsTable, eq(emailMessagesTable.id, embeddingsTable.email_message_id))
      .where(sql`${embeddingsTable.id} IS NULL`)
      .orderBy(sql`${emailMessagesTable.date} DESC`)
      .limit(this.batchSize)
    return messages
  }

  async embedNextBatch() {
    const messages = await this.fetchNextBatch()
    const texts = messages.map((message) => (message.email_messages.text_body.trim().length < 50 ? '<No Message Body>' : message.email_messages.text_body.trim()))

    console.log(texts)

    const startTime = performance.now()
    const embeddings = await generateEmbeddings(texts)
    const endTime = performance.now()

    const embeddingTime = endTime - startTime
    this.debug.totalEmbeddingTime += embeddingTime
    this.debug.totalEmbeddingsProcessed += texts.length

    if (embeddingTime > this.debug.slowMessageThreshold) {
      this.debug.slowMessages.push(messages[0].email_messages.id)
    }

    return texts.map((_text, index) => ({
      embedding: embeddings[index],
      email_message_id: messages[index].email_messages.id,
    }))
  }

  async indexNextBatch() {
    const embeddings = await this.embedNextBatch()
    for (let embedding of embeddings) {
      await this.db.insert(embeddingsTable).values({
        id: uuidv7(),
        ...embedding,
      })
    }
  }

  async indexAll() {
    this.isIndexing = true
    this.shouldCancelAfterNextBatch = false

    while (true) {
      if (this.shouldCancelAfterNextBatch) {
        this.isIndexing = false
        this.shouldCancelAfterNextBatch = false
        break
      }

      await this.updateProgress()

      if (this.messageCount === this.embeddingsCount) {
        break
      }

      await this.indexNextBatch()
    }
  }

  async updateProgress() {
    const messagesCount = await this.db.select({ count: count() }).from(emailMessagesTable).get()
    if (!messagesCount) {
      throw new Error('Failed to get messages count')
    }
    this.messageCount = messagesCount.count

    const embeddingsCount = await this.db.select({ count: count() }).from(embeddingsTable).get()
    if (!embeddingsCount) {
      throw new Error('Failed to get embeddings count')
    }
    this.embeddingsCount = embeddingsCount.count
  }

  cancel() {
    this.shouldCancelAfterNextBatch = true
  }

  getStatus() {
    return {
      isIndexing: this.isIndexing,
      messageCount: this.messageCount,
      embeddingsCount: this.embeddingsCount,
      shouldCancelAfterNextBatch: this.shouldCancelAfterNextBatch,
      batchSize: this.batchSize,
      debug: this.debug,
    }
  }
}
