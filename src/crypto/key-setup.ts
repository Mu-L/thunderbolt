import { getAuthToken } from '@/lib/auth-token'
import { defaultSettingCloudUrl } from '@/defaults/settings'
import { createCanary, verifyCanary } from './canary'
import type { KeyCanary } from './canary'
import { ValidationError } from './errors'
import { decodeRecoveryKey, deriveKeyFromPassphrase, encodeRecoveryKey, generateSalt } from './key-derivation'
import { keyStorage } from './key-storage'
import { getSalt, setMasterKey, setSalt } from './master-key'
import { exportKeyBytes, generateMasterKey, importKeyBytes } from './primitives'
import { toBase64 } from './utils'

export type KeySetupResult =
  | { success: true }
  | { success: false; error: 'WRONG_KEY' | 'INVALID_FORMAT' | 'SERVER_ERROR' | 'NETWORK_ERROR' }

const getBackendUrl = (): string => defaultSettingCloudUrl.value

const apiHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/** Upload canary + salt to server. Best-effort — failures don't block key creation. */
const uploadEncryptionSetup = async (canary: KeyCanary, salt?: Uint8Array): Promise<void> => {
  try {
    await fetch(`${getBackendUrl()}/encryption/setup`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ canary, salt: salt ? toBase64(salt) : undefined }),
    })
  } catch {
    // Best-effort — import flows fall back to localStorage
  }
}

/** Fetch canary + salt from server. Returns null if unavailable. */
const fetchEncryptionSetup = async (): Promise<{ canary: KeyCanary; salt: string | null } | null> => {
  try {
    const response = await fetch(`${getBackendUrl()}/encryption/setup`, {
      headers: apiHeaders(),
    })
    if (!response.ok) {
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Create a brand-new master key.
 * If passphrase is provided, derives key via PBKDF2 and stores the salt.
 * If passphrase is omitted, generates a random key.
 * Returns the recovery key hex string for display.
 */
export const createNewKey = async (passphrase?: string): Promise<{ result: KeySetupResult; recoveryKey: string }> => {
  let masterKey: CryptoKey
  let salt: Uint8Array | undefined

  if (passphrase) {
    salt = generateSalt()
    masterKey = await deriveKeyFromPassphrase(passphrase, salt)
    setSalt(salt)
  } else {
    masterKey = await generateMasterKey()
  }

  const keyBytes = await exportKeyBytes(masterKey)
  await setMasterKey(keyBytes)

  const canary = await createCanary(masterKey)
  keyStorage.set('thunderbolt_enc_canary', JSON.stringify(canary))

  await uploadEncryptionSetup(canary, salt)

  const recoveryKey = encodeRecoveryKey(keyBytes)
  return { result: { success: true }, recoveryKey }
}

/**
 * Import a key by re-deriving from passphrase.
 * Tries server first for salt + canary, falls back to localStorage.
 */
export const importFromPassphrase = async (passphrase: string): Promise<KeySetupResult> => {
  // Try server first, fall back to localStorage
  const serverSetup = await fetchEncryptionSetup()

  const saltBytes = serverSetup?.salt ? Uint8Array.from(atob(serverSetup.salt), (c) => c.charCodeAt(0)) : getSalt()
  if (!saltBytes) {
    return { success: false, error: 'WRONG_KEY' }
  }

  const canary: KeyCanary | null = serverSetup?.canary ?? getLocalCanary()
  if (!canary) {
    return { success: false, error: 'WRONG_KEY' }
  }

  const masterKey = await deriveKeyFromPassphrase(passphrase, saltBytes)
  const isValid = await verifyCanary(masterKey, canary)

  if (!isValid) {
    return { success: false, error: 'WRONG_KEY' }
  }

  const keyBytes = await exportKeyBytes(masterKey)
  await setMasterKey(keyBytes)
  setSalt(saltBytes)
  keyStorage.set('thunderbolt_enc_canary', JSON.stringify(canary))
  return { success: true }
}

/**
 * Import a key from a 64-char hex recovery key.
 * Decodes hex, imports key, verifies canary against server or local canary.
 */
export const importFromRecoveryKey = async (hexKey: string): Promise<KeySetupResult> => {
  let keyBytes: Uint8Array
  try {
    keyBytes = decodeRecoveryKey(hexKey)
  } catch (e) {
    if (e instanceof ValidationError) {
      return { success: false, error: 'INVALID_FORMAT' }
    }
    throw e
  }

  const masterKey = await importKeyBytes(keyBytes, true)

  const serverSetup = await fetchEncryptionSetup()
  const canary: KeyCanary | null = serverSetup?.canary ?? getLocalCanary()

  if (!canary) {
    // No canary anywhere — first import, just store the key
    await setMasterKey(keyBytes)
    const newCanary = await createCanary(masterKey)
    keyStorage.set('thunderbolt_enc_canary', JSON.stringify(newCanary))
    await uploadEncryptionSetup(newCanary)
    return { success: true }
  }

  const isValid = await verifyCanary(masterKey, canary)
  if (!isValid) {
    return { success: false, error: 'WRONG_KEY' }
  }

  await setMasterKey(keyBytes)
  keyStorage.set('thunderbolt_enc_canary', JSON.stringify(canary))
  return { success: true }
}

const getLocalCanary = (): KeyCanary | null => {
  const json = keyStorage.get('thunderbolt_enc_canary')
  return json ? JSON.parse(json) : null
}
