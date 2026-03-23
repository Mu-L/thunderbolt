import {
  generateKeyPair,
  generateCK,
  reimportAsNonExtractable,
  exportPublicKey,
  importPublicKey,
  wrapCK,
  unwrapCK,
  encodeRecoveryKey,
  decodeRecoveryKey,
  createCanary,
  verifyCanary,
  storeKeyPair,
  getKeyPair,
  storeCK,
  getCK,
  clearCK,
  clearAllKeys,
} from '@/crypto'
import { registerDevice, storeEnvelope, fetchMyEnvelope, fetchCanary } from '@/api/encryption'
import { getDeviceId } from '@/lib/auth-token'
import { getDeviceDisplayName } from '@/lib/platform'
import { setEncryptionEnabled } from '@/db/encryption'

type SetupFirstDeviceResult = {
  recoveryKey: string
}

/**
 * Flow C — First device ever.
 * Generates key pair + CK, creates canary, wraps envelope, stores on server.
 * Returns the recovery key (shown once to the user).
 */
export const setupFirstDevice = async (baseUrl: string): Promise<SetupFirstDeviceResult> => {
  // 1. Generate device key pair
  const keyPair = await generateKeyPair()
  await storeKeyPair(keyPair.privateKey, keyPair.publicKey)

  // 2. Generate CK (extractable for recovery key encoding)
  const extractableCK = await generateCK(true)

  // 3. Encode recovery key
  const recoveryKey = await encodeRecoveryKey(extractableCK)

  // 4. Create canary
  const canary = await createCanary(extractableCK)

  // 5. Wrap CK with own public key
  const wrappedCK = await wrapCK(extractableCK, keyPair.publicKey)

  // 6. Re-import CK as non-extractable and store
  const nonExtractableCK = await reimportAsNonExtractable(extractableCK)
  await storeCK(nonExtractableCK)

  // 7. Store envelope + canary on server
  const deviceId = getDeviceId()
  await storeEnvelope(baseUrl, deviceId, wrappedCK, canary)

  // 8. Enable encryption
  setEncryptionEnabled(true)

  return { recoveryKey }
}

/**
 * Flow D (new device side) — Request device approval.
 * Generates key pair, registers device on server.
 * Returns the server response (APPROVAL_PENDING with firstDevice flag).
 */
export const requestDeviceApproval = async (baseUrl: string) => {
  // Generate key pair
  const keyPair = await generateKeyPair()
  await storeKeyPair(keyPair.privateKey, keyPair.publicKey)

  // Export public key and register
  const publicKeyBase64 = await exportPublicKey(keyPair.publicKey)
  const deviceId = getDeviceId()
  const name = getDeviceDisplayName()

  return registerDevice(baseUrl, deviceId, publicKeyBase64, name)
}

/**
 * Flow D (trusted device side) — Approve a pending device.
 * Wraps CK with the pending device's public key and stores envelope on server.
 */
export const approveDevice = async (baseUrl: string, pendingDeviceId: string, pendingDevicePublicKey: string) => {
  const ck = await getCK()
  if (!ck) {
    throw new Error('CK not available — cannot approve device')
  }

  // Import the pending device's public key
  const publicKey = await importPublicKey(pendingDevicePublicKey)

  // Wrap CK with the pending device's public key
  const wrappedCK = await wrapCK(ck, publicKey)

  // Store envelope on server for the pending device
  await storeEnvelope(baseUrl, pendingDeviceId, wrappedCK)
}

/**
 * Flow E — Recover with recovery key.
 * Verifies the key against the canary, then creates own envelope.
 */
export const recoverWithKey = async (baseUrl: string, recoveryKeyHex: string): Promise<boolean> => {
  // 1. Decode recovery key → CK
  const ck = await decodeRecoveryKey(recoveryKeyHex)

  // 2. Fetch canary from server
  const { canaryIv, canaryCtext } = await fetchCanary(baseUrl)

  // 3. Verify canary
  const isValid = await verifyCanary(ck, canaryIv, canaryCtext)
  if (!isValid) {
    return false
  }

  // 4. Store CK locally
  await storeCK(ck)

  // 5. Get key pair (should already exist from requestDeviceApproval)
  const keyPair = await getKeyPair()
  if (!keyPair) {
    throw new Error('Key pair not found — was requestDeviceApproval called first?')
  }

  // 6. Wrap CK with own public key and store envelope
  const wrappedCK = await wrapCK(ck, keyPair.publicKey)
  const deviceId = getDeviceId()
  await storeEnvelope(baseUrl, deviceId, wrappedCK)

  // 7. Enable encryption
  setEncryptionEnabled(true)

  return true
}

/**
 * Flow F — Recover CK from envelope (returning device, CK lost from IndexedDB).
 */
export const recoverCKFromEnvelope = async (baseUrl: string) => {
  const keyPair = await getKeyPair()
  if (!keyPair) {
    throw new Error('Key pair not found')
  }

  const { wrappedCK } = await fetchMyEnvelope(baseUrl)
  const ck = await unwrapCK(wrappedCK, keyPair.privateKey)
  await storeCK(ck)
  setEncryptionEnabled(true)
}

/**
 * Flow D Continue — Check if device has been approved.
 * Fetches own envelope. If found, unwraps CK and enables encryption.
 * Returns true if approved, false if still pending.
 */
export const checkApprovalAndUnwrap = async (baseUrl: string): Promise<boolean> => {
  try {
    const { wrappedCK } = await fetchMyEnvelope(baseUrl)
    const keyPair = await getKeyPair()
    if (!keyPair) {
      throw new Error('Key pair not found')
    }
    const ck = await unwrapCK(wrappedCK, keyPair.privateKey)
    await storeCK(ck)
    setEncryptionEnabled(true)
    return true
  } catch {
    return false
  }
}

/**
 * Flow G — Sign out. Clears CK but keeps key pair.
 */
export const handleSignOut = async () => {
  await clearCK()
  setEncryptionEnabled(false)
}

/**
 * Flow H — Full wipe. Clears all key material.
 */
export const handleFullWipe = async () => {
  await clearAllKeys()
  setEncryptionEnabled(false)
}
