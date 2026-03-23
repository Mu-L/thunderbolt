import { describe, expect, it } from 'bun:test'
import { isBase64, encodeIfNotBase64, decodeIfBase64 } from './base64'

describe('base64 utilities', () => {
  describe('isBase64', () => {
    it('returns true for b64: prefixed strings', () => {
      expect(isBase64('b64:aGVsbG8=')).toBe(true)
    })

    it('returns false for non-prefixed strings', () => {
      expect(isBase64('hello')).toBe(false)
      expect(isBase64('aGVsbG8=')).toBe(false)
    })

    it('returns false for empty/whitespace strings', () => {
      expect(isBase64('')).toBe(false)
      expect(isBase64('  ')).toBe(false)
    })
  })

  describe('encodeIfNotBase64', () => {
    it('encodes with b64: prefix', () => {
      const encoded = encodeIfNotBase64('hello')
      expect(encoded.startsWith('b64:')).toBe(true)
    })

    it('is idempotent — does not double-encode', () => {
      const encoded = encodeIfNotBase64('hello')
      expect(encodeIfNotBase64(encoded)).toBe(encoded)
    })

    it('returns empty string as-is', () => {
      expect(encodeIfNotBase64('')).toBe('')
    })
  })

  describe('decodeIfBase64', () => {
    it('decodes prefixed format', () => {
      const encoded = encodeIfNotBase64('hello world')
      expect(decodeIfBase64(encoded)).toBe('hello world')
    })

    it('handles unicode', () => {
      const original = 'café résumé'
      const encoded = encodeIfNotBase64(original)
      expect(decodeIfBase64(encoded)).toBe(original)
    })

    it('returns non-base64 strings as-is', () => {
      expect(decodeIfBase64('just text')).toBe('just text')
    })

    it('returns empty string as-is', () => {
      expect(decodeIfBase64('')).toBe('')
    })

    it('returns invalid base64 as-is', () => {
      expect(decodeIfBase64('b64:not!valid!base64!!!')).toBe('b64:not!valid!base64!!!')
    })
  })

  describe('round-trip', () => {
    it('encode → decode returns original', () => {
      const cases = ['hello', 'hello world', 'café', '{"key": "value"}', '🎉', '']
      for (const original of cases) {
        if (original === '') {
          continue // empty passthrough
        }
        const encoded = encodeIfNotBase64(original)
        const decoded = decodeIfBase64(encoded)
        expect(decoded).toBe(original)
      }
    })
  })
})
