import { useCallback, useRef } from 'react'

/**
 * Manages Haystack session IDs per chat thread.
 * Each Document Search conversation gets its own Haystack session.
 */
export const useHaystackSessions = () => {
  const sessionsRef = useRef<Map<string, string>>(new Map())

  const getSessionId = useCallback((chatId: string): string | null => {
    return sessionsRef.current.get(chatId) ?? null
  }, [])

  const setSessionId = useCallback((chatId: string, sessionId: string) => {
    sessionsRef.current.set(chatId, sessionId)
  }, [])

  return { getSessionId, setSessionId }
}
