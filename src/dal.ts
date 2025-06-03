import { eq } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import { accountsTable, emailMessagesTable, emailThreadsTable, mcpServersTable, modelsTable, settingsTable } from './db/tables'
import { DrizzleContextType, EmailThreadWithMessagesAndAddresses } from './types'

export const seedAccounts = async (db: DrizzleContextType['db']) => {
  const accounts = await db.select().from(accountsTable)
  // if (accounts.length === 0) {
  //   await db.insert(accountsTable).values({
  //     id: uuidv7(),
  //     type: 'imap',
  //     imapHostname: 'imap.thundermail.com',
  //     imapPort: 993,
  //     imapUsername: 'you@tb.pro',
  //     imapPassword: 'password',
  //   })
  // }
}

export const seedModels = async (db: DrizzleContextType['db']) => {
  const models = await db.select().from(modelsTable)
  if (models.length === 0) {
    const seedData = [
      {
        id: uuidv7(),
        name: 'Llama 3.1 70B',
        provider: 'thunderbolt' as const,
        model: 'llama-v3p1-70b-instruct',
        isSystem: 1,
        enabled: 1,
      },
      {
        id: uuidv7(),
        name: 'Llama 3.1 405B',
        provider: 'thunderbolt' as const,
        model: 'llama-v3p1-405b-instruct',
        isSystem: 1,
        enabled: 1,
      },
      {
        id: uuidv7(),
        name: 'Qwen 3 235B',
        provider: 'thunderbolt' as const,
        model: 'qwen3-235b-a22b',
        isSystem: 1,
        enabled: 1,
      },
      {
        id: uuidv7(),
        name: 'Llama 3.2 3B',
        provider: 'openai_compatible' as const,
        model: 'llama3.2:3b-instruct-q4_1',
        url: 'http://localhost:11434/v1',
        isSystem: 0,
        enabled: 1,
      },
    ]
    for (const model of seedData) {
      await db.insert(modelsTable).values(model)
    }
  }
}

export const seedSettings = async (db: DrizzleContextType['db']) => {
  const cloudUrlSetting = await db.select().from(settingsTable).where(eq(settingsTable.key, 'cloud_url')).get()

  if (!cloudUrlSetting) {
    await db.insert(settingsTable).values({
      key: 'cloud_url',
      value: 'https://thunderbolt-hooc.onrender.com',
    })
  }

  const anonymousId = await db.select().from(settingsTable).where(eq(settingsTable.key, 'anonymous_id')).get()

  if (!anonymousId) {
    await db.insert(settingsTable).values({
      key: 'anonymous_id',
      value: uuidv7(), // @todo look into any concerns here
    })
  }
}

export const seedMcpServers = async (db: DrizzleContextType['db']) => {
  const existingServers = await db.select().from(mcpServersTable).limit(1)

  if (existingServers.length === 0) {
    await db.insert(mcpServersTable).values({
      id: uuidv7(),
      name: 'Local MCP Server',
      url: 'http://localhost:8000/mcp/',
      enabled: 1,
    })
  }
}

export const getEmailThreadByIdWithMessages = async (db: DrizzleContextType['db'], emailThreadId: string): Promise<EmailThreadWithMessagesAndAddresses | null> => {
  const thread = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, emailThreadId)).get()

  if (!thread) return null

  const messages = await db.query.emailMessagesTable.findMany({
    where: eq(emailMessagesTable.emailThreadId, emailThreadId),
    with: {
      sender: true,
      recipients: {
        with: {
          address: true,
        },
      },
    },
    orderBy: (messages, { asc }) => [asc(messages.sentAt)],
  })
  return { ...thread, messages }
}

export const getEmailThreadByMessageImapIdWithMessages = async (db: DrizzleContextType['db'], imapId: string): Promise<EmailThreadWithMessagesAndAddresses | null> => {
  const message = await db.select().from(emailMessagesTable).where(eq(emailMessagesTable.imapId, imapId)).get()

  if (!message || !message.emailThreadId) return null

  const thread = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, message.emailThreadId)).get()

  if (!thread) return null

  const messages = await db.query.emailMessagesTable.findMany({
    where: eq(emailMessagesTable.emailThreadId, thread.id),
    with: {
      sender: true,
      recipients: {
        with: {
          address: true,
        },
      },
    },
    orderBy: (messages, { asc }) => [asc(messages.sentAt)],
  })

  return { ...thread, messages }
}

export const getEmailThreadByMessageIdWithMessages = async (db: DrizzleContextType['db'], emailMessageId: string): Promise<EmailThreadWithMessagesAndAddresses | null> => {
  const message = await db.select().from(emailMessagesTable).where(eq(emailMessagesTable.id, emailMessageId)).get()

  if (!message || !message.emailThreadId) return null

  const thread = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, message.emailThreadId)).get()

  if (!thread) return null

  const messages = await db.query.emailMessagesTable.findMany({
    where: eq(emailMessagesTable.emailThreadId, thread.id),
    with: {
      sender: true,
      recipients: {
        with: {
          address: true,
        },
      },
    },
    orderBy: (messages, { asc }) => [asc(messages.sentAt)],
  })

  return { ...thread, messages }
}
