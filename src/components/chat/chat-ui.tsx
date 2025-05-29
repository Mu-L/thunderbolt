import { Model } from '@/types'
import type { UseChatHelpers } from '@ai-sdk/react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { AgentToolResponse } from './agent-tool-response'
import { ChatLoadingIndicator } from './chat-loading-indicator'
import { Reasoning } from './reasoning'
import { StreamingMarkdown } from './streaming-markdown'

interface ChatUIProps {
  chatHelpers: UseChatHelpers
  models: Model[]
  selectedModel: string | null
  onModelChange: (model: string | null) => void
}

interface SuggestionButtonProps {
  label: string
  prompt: string
  onSelect: (prompt: string) => void
}

const SuggestionButton = ({ label, prompt, onSelect }: SuggestionButtonProps) => (
  <Button
    variant="outline"
    className="bg-white text-sm text-gray-700 rounded-full px-3 py-1.5 border border-gray-200 shadow-sm hover:bg-gray-50 whitespace-nowrap flex-shrink-0"
    onClick={() => onSelect(prompt)}
  >
    {label}
  </Button>
)

const SuggestionButtons = ({ onSelectPrompt }: { onSelectPrompt: (prompt: string) => void }) => {
  const suggestions = [
    { label: 'Check the weather', prompt: 'What is the forecast for this week?' },
    { label: 'Check your to dos', prompt: 'What are my current tasks?' },
    { label: 'Write a message', prompt: 'Write a thank you email to my coworker for helping with the meeting yesterday.' },
    { label: 'Understand a topic', prompt: 'Explain how checks and balances work between the three branches of government.' },
  ]

  return (
    <div className="flex flex-nowrap gap-2 justify-center mt-4 min-w-max mx-auto">
      {suggestions.map((suggestion, index) => (
        <SuggestionButton key={index} label={suggestion.label} prompt={suggestion.prompt} onSelect={onSelectPrompt} />
      ))}
    </div>
  )
}

export default function ChatUI({ chatHelpers, models, selectedModel, onModelChange }: ChatUIProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [hasMessages, setHasMessages] = useState(chatHelpers.messages.length > 0)
  const formRef = useRef<HTMLFormElement>(null)
  const containerWidth = 696 // 728px container - 16px padding on each side

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
    setHasMessages(chatHelpers.messages.length > 0)
  }, [chatHelpers.messages])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    chatHelpers.handleSubmit(e)
  }

  const handleSelectPrompt = (prompt: string) => {
    chatHelpers.setInput(prompt)
    setTimeout(() => {
      const inputElement = formRef.current?.querySelector('input')
      if (inputElement) {
        inputElement.focus()
      }
    }, 0)
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden max-w-[728px] mx-auto">
      <AnimatePresence>
        {hasMessages && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 p-4 overflow-y-auto space-y-4">
            {chatHelpers.messages.map((message, i) => {
              if (message.role === 'assistant') {
                return (
                  <div key={i} className="space-y-2 p-4 rounded-md bg-secondary mr-auto">
                    {message.parts
                      .filter((part) => part.type === 'tool-invocation')
                      .map((part, j) => (
                        <AgentToolResponse key={j} part={part} />
                      ))}
                    {message.parts
                      .filter((part) => part.type === 'reasoning')
                      .map((part, j) => (
                        <Reasoning key={j} text={part.text} />
                      ))}
                    {message.parts
                      .filter((part) => part.type === 'text')
                      .map((part, j) => (
                        <StreamingMarkdown
                          key={j}
                          content={part.text}
                          isStreaming={chatHelpers.status === 'streaming' && i === chatHelpers.messages.length - 1}
                          className="text-secondary-foreground leading-relaxed"
                        />
                      ))}
                  </div>
                )
              } else if (message.role === 'user') {
                return message.parts
                  .filter((part) => part.type === 'text')
                  .map((part, j) => (
                    <div key={j} className="p-4 rounded-md max-w-3/4 bg-primary text-primary-foreground ml-auto">
                      <div className="space-y-2">
                        <div className="text-primary-foreground leading-relaxed">{part.text}</div>
                      </div>
                    </div>
                  ))
              }
              return null
            })}

            {/* Show loading indicator when waiting for server response */}
            {chatHelpers.status === 'submitted' && <ChatLoadingIndicator message="Thinking..." />}

            <div ref={messagesEndRef} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="p-4"
        style={{
          display: 'flex',
          flex: !hasMessages ? '1' : 'none',
          alignItems: !hasMessages ? 'center' : 'flex-end',
          justifyContent: !hasMessages ? 'center' : 'flex-start',
        }}
        initial={false}
        layout
        transition={{
          type: 'tween',
          ease: [0.2, 0.9, 0.1, 1],
          duration: 0.25,
        }}
      >
        <motion.div
          className="flex flex-col items-center"
          layout
          transition={{
            type: 'tween',
            ease: [0.2, 0.9, 0.1, 1],
            duration: 0.25,
          }}
        >
          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            className="flex flex-col gap-2 bg-secondary p-4 rounded-md"
            style={{ width: containerWidth }}
            layout
            transition={{
              type: 'tween',
              ease: [0.2, 0.9, 0.1, 1],
              duration: 0.25,
            }}
          >
            <Input variant="ghost" autoFocus value={chatHelpers.input} onChange={chatHelpers.handleInputChange} placeholder="Say something..." className="flex-1 px-4 py-2" />
            <div className="flex gap-2 justify-end items-center w-full">
              <Select value={selectedModel || ''} onValueChange={onModelChange}>
                <SelectTrigger className="rounded-full" size="sm" variant="outline">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <p className="text-left">{model.name}</p>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" variant="default" className="h-6 w-6 rounded-full flex items-center justify-center">
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </motion.form>

          {!hasMessages && (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: 0.1 }} className="w-full overflow-x-auto pb-2">
                <SuggestionButtons onSelectPrompt={handleSelectPrompt} />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}
