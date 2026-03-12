import { createParser } from '@/lib/create-parser'
import { z } from 'zod'

/**
 * Zod schema for document-result widget
 */
export const schema = z.object({
  widget: z.literal('document-result'),
  args: z.object({
    name: z.string().min(1, 'File name is required'),
    fileId: z.string().min(1, 'File ID is required'),
    snippet: z.string().optional(),
    score: z.string().optional(),
  }),
})

export type DocumentResultWidget = z.infer<typeof schema>

/**
 * Type of data cached by this widget
 */
export type CacheData = Record<string, never>

/**
 * Parse function - auto-generated from schema
 */
export const parse = createParser(schema)
