import { describe, expect, it, beforeEach, mock } from 'bun:test'

// Mock crypto to avoid IndexedDB
mock.module('@/crypto', () => ({
  encrypt: async (plaintext: string) => ({
    iv: btoa(`iv`),
    ciphertext: btoa(`ct-${plaintext}`),
  }),
  decrypt: async () => '',
  getCK: async () => 'mock-ck' as unknown as CryptoKey,
  generateKeyPair: async () => ({}),
  generateCK: async () => ({}),
  reimportAsNonExtractable: async () => ({}),
  exportPublicKey: async () => '',
  importPublicKey: async () => ({}),
  wrapCK: async () => '',
  rewrapCK: async () => '',
  unwrapCK: async () => ({}),
  createCanary: async () => ({ canaryIv: '', canaryCtext: '' }),
  verifyCanary: async () => true,
  encodeRecoveryKey: async () => '',
  decodeRecoveryKey: async () => ({}),
  storeKeyPair: async () => {},
  getKeyPair: async () => null,
  storeCK: async () => {},
  clearCK: async () => {},
  clearAllKeys: async () => {},
  EncryptionError: class extends Error {},
  DecryptionError: class extends Error {},
  StorageError: class extends Error {},
  ValidationError: class extends Error {},
}))

// Must also ensure encryption is enabled
const { setEncryptionEnabled } = await import('./enabled')
const { invalidateCKCache } = await import('./codec')
const { encodeForUpload } = await import('./upload-encoder')

describe('encodeForUpload', () => {
  beforeEach(() => {
    setEncryptionEnabled(true)
    invalidateCKCache()
  })

  it('encodes encrypted columns for known tables', async () => {
    const op = {
      op: 'PUT' as const,
      type: 'tasks',
      id: '123',
      data: { item: 'Buy groceries', order: 1, is_complete: 0 },
    }

    const result = await encodeForUpload(op)

    // 'item' is an encrypted column for tasks
    expect(typeof result.data?.item).toBe('string')
    expect((result.data?.item as string).startsWith('__enc:')).toBe(true)
    // 'order' is NOT encrypted
    expect(result.data?.order).toBe(1)
    // 'is_complete' is NOT encrypted
    expect(result.data?.is_complete).toBe(0)
  })

  it('passes through DELETE operations', async () => {
    const op = {
      op: 'DELETE' as const,
      type: 'tasks',
      id: '123',
    }

    const result = await encodeForUpload(op)
    expect(result).toEqual(op)
  })

  it('passes through unknown tables', async () => {
    const op = {
      op: 'PUT' as const,
      type: 'unknown_table',
      id: '123',
      data: { foo: 'bar' },
    }

    const result = await encodeForUpload(op)
    expect(result.data?.foo).toBe('bar')
  })

  it('passes through when encryption is disabled', async () => {
    setEncryptionEnabled(false)

    const op = {
      op: 'PUT' as const,
      type: 'tasks',
      id: '123',
      data: { item: 'Buy groceries' },
    }

    const result = await encodeForUpload(op)
    expect(result.data?.item).toBe('Buy groceries')

    setEncryptionEnabled(true)
  })

  it('does not encode non-string values', async () => {
    const op = {
      op: 'PUT' as const,
      type: 'tasks',
      id: '123',
      data: { item: null, order: 5 },
    }

    const result = await encodeForUpload(op)
    expect(result.data?.item).toBeNull()
    expect(result.data?.order).toBe(5)
  })

  it('encodes multiple encrypted columns', async () => {
    const op = {
      op: 'PUT' as const,
      type: 'chat_messages',
      id: '456',
      data: {
        content: 'Hello',
        parts: '[{"type":"text"}]',
        chat_thread_id: 'thread-1',
      },
    }

    const result = await encodeForUpload(op)

    // 'content' and 'parts' are encrypted columns for chat_messages
    expect((result.data?.content as string).startsWith('__enc:')).toBe(true)
    expect((result.data?.parts as string).startsWith('__enc:')).toBe(true)
    // 'chat_thread_id' is NOT encrypted
    expect(result.data?.chat_thread_id).toBe('thread-1')
  })
})
