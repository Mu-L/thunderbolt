export type { RemoteAgentDescriptor } from '@shared/agent-types'

export type AgentProvider = {
  getAgents: () => import('@shared/agent-types').RemoteAgentDescriptor[]
}
