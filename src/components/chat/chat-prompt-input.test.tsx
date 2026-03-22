import { resetTestDatabase, setupTestDatabase, teardownTestDatabase } from '@/dal/test-utils'
import { createMockChatThread, createMockModel, hydrateStore, resetStore } from '@/test-utils/chat-store-mocks'
import { createQueryTestWrapper } from '@/test-utils/react-query'
import type { Model } from '@/types'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { createElement, type ReactNode, type RefObject } from 'react'
import { BrowserRouter } from 'react-router'
import { ChatPromptInput, type ChatPromptInputRef } from './chat-prompt-input'

const createMockUseContextTracking =
  (
    isOverflowing: boolean = false,
    isContextKnown: boolean = true,
    usedTokens: number | null = 1000,
    maxTokens: number | null = 2000,
  ) =>
  (_options?: { model?: Model | null; chatThreadId?: string; currentInput?: string; onOverflow?: () => void }) => ({
    usedTokens,
    maxTokens,
    isContextKnown,
    isOverflowing,
    isLoading: false,
    estimateTokensForInput: (_input: string) => 0,
  })

const createMockUseIsMobile =
  (isMobile: boolean = false) =>
  () => ({
    isMobile,
  })

const TestWrapper = ({ children }: { children: ReactNode }) => {
  const queryWrapper = createQueryTestWrapper()
  return createElement(BrowserRouter, null, createElement(queryWrapper, null, children))
}

/** Hydrate the chat store with sensible defaults for testing */
const setupStore = () => {
  const mockModel = createMockModel()

  hydrateStore({
    chatThread: createMockChatThread(),
    id: 'thread-1',
    mcpClients: [],
    selectedModel: mockModel,
    triggerData: null,
  })

  return { mockModel }
}

describe('ChatPromptInput', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(() => {
    resetStore()
  })

  afterEach(async () => {
    cleanup()
    resetStore()
    await resetTestDatabase()
  })

  describe('rendering', () => {
    it('should render textarea with placeholder', () => {
      setupStore()

      render(<ChatPromptInput useIsMobile={createMockUseIsMobile()} />, {
        wrapper: TestWrapper,
      })

      expect(screen.getByPlaceholderText('Ask me anything...')).toBeInTheDocument()
    })
  })

  describe('mobile layout', () => {
    it('should apply mobile class names', () => {
      setupStore()

      const { container } = render(<ChatPromptInput useIsMobile={createMockUseIsMobile(true)} />, {
        wrapper: TestWrapper,
      })

      const form = container.querySelector('form')
      expect(form?.className).toContain('gap-0')
      expect(form?.className).toContain('p-2')
    })

    it('should apply unified class names when not mobile', () => {
      setupStore()

      const { container } = render(<ChatPromptInput useIsMobile={createMockUseIsMobile(false)} />, {
        wrapper: TestWrapper,
      })

      const form = container.querySelector('form')
      expect(form?.className).toContain('gap-0')
      expect(form?.className).toContain('p-2')
    })

    it('should hide context usage indicator on mobile', () => {
      setupStore()

      render(
        <ChatPromptInput
          useIsMobile={createMockUseIsMobile(true)}
          useContextTracking={createMockUseContextTracking(false, true, 1000, 2000)}
        />,
        { wrapper: TestWrapper },
      )

      expect(screen.queryByText('50%')).toBeNull()
    })

    it('should show context usage indicator on desktop', () => {
      setupStore()

      render(
        <ChatPromptInput
          useIsMobile={createMockUseIsMobile(false)}
          useContextTracking={createMockUseContextTracking(false, true, 1000, 2000)}
        />,
        { wrapper: TestWrapper },
      )

      expect(screen.getByText('50%')).toBeInTheDocument()
    })
  })

  describe('ref methods', () => {
    it('should expose focus method that focuses textarea', () => {
      setupStore()
      const ref = { current: null } as unknown as RefObject<ChatPromptInputRef>

      render(<ChatPromptInput ref={ref} useIsMobile={createMockUseIsMobile()} />, {
        wrapper: TestWrapper,
      })

      const textarea = screen.getByPlaceholderText('Ask me anything...') as HTMLTextAreaElement
      const focusSpy = mock(() => {})
      const setSelectionRangeSpy = mock(() => {})
      textarea.focus = focusSpy
      textarea.setSelectionRange = setSelectionRangeSpy

      act(() => {
        ref.current?.focus()
      })

      expect(focusSpy).toHaveBeenCalled()
      expect(setSelectionRangeSpy).toHaveBeenCalled()
    })

    it('should expose setInput method that updates textarea value', () => {
      setupStore()
      const ref = { current: null } as unknown as RefObject<ChatPromptInputRef>

      render(<ChatPromptInput ref={ref} useIsMobile={createMockUseIsMobile()} />, {
        wrapper: TestWrapper,
      })

      act(() => {
        ref.current?.setInput('Test input')
      })

      const textarea = screen.getByPlaceholderText('Ask me anything...') as HTMLTextAreaElement
      expect(textarea.value).toBe('Test input')
    })
  })

  describe('submitOnEnter', () => {
    it('should disable submit on enter when mobile viewport', () => {
      setupStore()

      const { container } = render(<ChatPromptInput useIsMobile={createMockUseIsMobile(true)} />, {
        wrapper: TestWrapper,
      })

      const textarea = container.querySelector('textarea')!
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      const preventDefaultSpy = mock(() => {})
      Object.defineProperty(enterEvent, 'preventDefault', { value: preventDefaultSpy })

      textarea.dispatchEvent(enterEvent)

      // On mobile, Enter should NOT be prevented (it creates a newline naturally)
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })
  })

  describe('dependency injection', () => {
    it('should render with store-based state', () => {
      setupStore()

      const { container } = render(<ChatPromptInput useIsMobile={createMockUseIsMobile()} />, {
        wrapper: TestWrapper,
      })

      expect(container.querySelector('form')).not.toBeNull()
    })

    it('should accept injected useContextTracking', () => {
      setupStore()

      const { container } = render(
        <ChatPromptInput useContextTracking={createMockUseContextTracking()} useIsMobile={createMockUseIsMobile()} />,
        { wrapper: TestWrapper },
      )

      expect(container.querySelector('form')).not.toBeNull()
    })
  })
})
