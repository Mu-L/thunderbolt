import { createAcpClient } from '@/acp/client'
import { createBuiltInAgent } from '@/acp/built-in-agent'
import { createInProcessStreams } from '@/acp/streams'
import { runBuiltInPrompt } from '@/acp/run-built-in-prompt'
import { handleSessionUpdate } from './use-acp-chat'
import { useChatStore } from './chat-store'
import type { Agent, Mode, Model } from '@/types'
import type { AcpClient } from '@/acp/client'
import type { AgentSessionState } from '@/acp/types'
import type { MCPClient } from '@/lib/mcp-provider'
import { AgentSideConnection } from '@agentclientprotocol/sdk'

type CreateAcpSessionOptions = {
  chatId: string
  agent: Agent
  modes: Mode[]
  models: Model[]
  selectedModeId: string
  selectedModelId: string
  mcpClients: MCPClient[]
}

type AcpSessionResult = {
  acpClient: AcpClient
  sessionState: AgentSessionState
}

/**
 * Create an ACP session for a chat.
 * For built-in agents, creates an in-process connection with the built-in agent handler.
 * For local/remote agents, creates the appropriate transport connection.
 */
export const createAcpSession = async ({
  chatId,
  agent,
  modes,
  models,
  selectedModeId,
  selectedModelId,
  mcpClients,
}: CreateAcpSessionOptions): Promise<AcpSessionResult> => {
  if (agent.type !== 'built-in') {
    throw new Error(
      `Agent "${agent.name}" (${agent.type}) is not available. ` +
        (agent.type === 'local'
          ? 'Local CLI agents require the desktop app with ACP stdio transport.'
          : 'Remote agents require a configured server connection.'),
    )
  }

  // Create in-process streams for the built-in agent
  const { clientStream, agentStream } = createInProcessStreams()

  // Create the built-in agent handler
  const agentHandler = createBuiltInAgent({
    getModes: () => modes,
    getModels: () => models,
    getSelectedModeId: () => {
      const session = useChatStore.getState().sessions.get(chatId)
      return session?.currentModeId ?? selectedModeId
    },
    getSelectedModelId: () => {
      const session = useChatStore.getState().sessions.get(chatId)
      return session?.selectedModel?.id ?? selectedModelId
    },
    onModeChange: (modeId) => {
      useChatStore.getState().updateSession(chatId, { currentModeId: modeId })
    },
    onModelChange: (modelId) => {
      const model = models.find((m) => m.id === modelId)
      if (model) {
        useChatStore.getState().updateSession(chatId, { selectedModel: model })
      }
    },
    runPrompt: async ({ sessionId, modelId, modeId, conn, abortSignal }) => {
      // Get current messages from the store for context
      const session = useChatStore.getState().sessions.get(chatId)
      const currentMessages = session?.messages ?? []

      // Find the mode's system prompt
      const mode = modes.find((m) => m.id === modeId)

      return runBuiltInPrompt({
        sessionId,
        messages: currentMessages,
        modelId,
        modeSystemPrompt: mode?.systemPrompt ?? undefined,
        modeName: mode?.name ?? undefined,
        conn,
        abortSignal,
        mcpClients,
      })
    },
  })

  // Create the ACP client with streaming update handler
  const acpClient = createAcpClient({
    stream: clientStream,
    onSessionUpdate: (update) => {
      handleSessionUpdate(chatId, update)
    },
  })

  // Start the agent side
  new AgentSideConnection(agentHandler, agentStream)

  // Initialize and create session
  await acpClient.initialize()
  const sessionState = await acpClient.createSession()

  return { acpClient, sessionState }
}
