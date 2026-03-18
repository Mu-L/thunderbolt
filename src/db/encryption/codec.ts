import { getMasterKey } from '@/crypto/master-key'
import { decrypt, encrypt } from '@/crypto/primitives'
import { fromBase64, toBase64 } from '@/crypto/utils'
import { decodeIfBase64, isBase64 } from '@/lib/base64'

export type EncryptionCodec = {
  encode: (plaintext: string) => Promise<string>
  decode: (ciphertext: string) => Promise<string>
}

/** AES-GCM encrypted format: `enc:<base64-iv>:<base64-ciphertext>` */
const encPrefix = 'enc:'

const isEncFormat = (str: string): boolean => str.startsWith(encPrefix)

/**
 * AES-GCM codec for column-level encryption.
 * Falls back to base64 PoC encoding when no master key is available.
 * Decoding handles both AES-GCM (enc: prefix) and legacy base64 (b64: prefix) formats.
 */
export const codec: EncryptionCodec = {
  encode: async (plaintext: string): Promise<string> => {
    const masterKey = await getMasterKey()
    if (!masterKey) {
      // No master key yet — skip encryption, return plaintext
      return plaintext
    }
    const plaintextBytes = new TextEncoder().encode(plaintext)
    const { iv, ciphertext } = await encrypt(masterKey, plaintextBytes)
    return `${encPrefix}${toBase64(iv)}:${toBase64(ciphertext)}`
  },

  decode: async (ciphertext: string): Promise<string> => {
    if (!ciphertext) {
      return ciphertext
    }

    // AES-GCM encrypted format
    if (isEncFormat(ciphertext)) {
      const masterKey = await getMasterKey()
      if (!masterKey) {
        return ciphertext
      }
      const parts = ciphertext.slice(encPrefix.length).split(':')
      if (parts.length !== 2) {
        return ciphertext
      }
      try {
        const iv = fromBase64(parts[0])
        const encrypted = fromBase64(parts[1])
        const decrypted = await decrypt(masterKey, iv, encrypted)
        return new TextDecoder().decode(decrypted)
      } catch {
        return ciphertext
      }
    }

    // Legacy base64 format (b64: prefix or round-trip detection)
    if (isBase64(ciphertext)) {
      return decodeIfBase64(ciphertext)
    }

    // Plaintext — return as-is
    return ciphertext
  },
}
