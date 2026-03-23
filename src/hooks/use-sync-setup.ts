import { useReducer, useState } from 'react'
import { setupFirstDevice, requestDeviceApproval, recoverWithKey, checkApprovalAndUnwrap } from '@/services/encryption'

type SyncSetupStep =
  | 'intro'
  | 'detecting'
  | 'first-device-setup'
  | 'recovery-key-display'
  | 'approval-waiting'
  | 'recovery-key-entry'

type SyncSetupState = {
  step: SyncSetupStep
  recoveryKey: string
  recoveryKeyInput: string
  recoveryKeyError: string | null
  approvalChecked: boolean
  approvalError: string | null
  isLoading: boolean
  error: string | null
}

type SyncSetupAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'DETECTED_FIRST_DEVICE' }
  | { type: 'DETECTED_ADDITIONAL_DEVICE' }
  | { type: 'SETUP_COMPLETE'; payload: string }
  | { type: 'GO_TO_FIRST_DEVICE_SETUP' }
  | { type: 'GO_TO_APPROVAL_WAITING' }
  | { type: 'GO_TO_RECOVERY_KEY_ENTRY' }
  | { type: 'SET_RECOVERY_KEY_INPUT'; payload: string }
  | { type: 'SET_RECOVERY_KEY_ERROR'; payload: string | null }
  | { type: 'SET_APPROVAL_CHECKED'; payload: boolean }
  | { type: 'SET_APPROVAL_ERROR'; payload: string | null }
  | { type: 'GO_BACK' }
  | { type: 'RESET' }

const initialState: SyncSetupState = {
  step: 'intro',
  recoveryKey: '',
  recoveryKeyInput: '',
  recoveryKeyError: null,
  approvalChecked: false,
  approvalError: null,
  isLoading: false,
  error: null,
}

const reducer = (state: SyncSetupState, action: SyncSetupAction): SyncSetupState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload, error: null }
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
    case 'DETECTED_FIRST_DEVICE':
      return { ...state, step: 'first-device-setup', isLoading: false }
    case 'DETECTED_ADDITIONAL_DEVICE':
      return { ...state, step: 'approval-waiting', isLoading: false }
    case 'GO_TO_FIRST_DEVICE_SETUP':
      return { ...state, step: 'first-device-setup' }
    case 'GO_TO_APPROVAL_WAITING':
      return { ...state, step: 'approval-waiting' }
    case 'SETUP_COMPLETE':
      return { ...state, step: 'recovery-key-display', recoveryKey: action.payload, isLoading: false }
    case 'GO_TO_RECOVERY_KEY_ENTRY':
      return { ...state, step: 'recovery-key-entry', recoveryKeyInput: '', recoveryKeyError: null }
    case 'SET_RECOVERY_KEY_INPUT':
      return { ...state, recoveryKeyInput: action.payload, recoveryKeyError: null }
    case 'SET_RECOVERY_KEY_ERROR':
      return { ...state, recoveryKeyError: action.payload, isLoading: false }
    case 'SET_APPROVAL_CHECKED':
      return { ...state, approvalChecked: action.payload, approvalError: null }
    case 'SET_APPROVAL_ERROR':
      return { ...state, approvalError: action.payload, isLoading: false }
    case 'GO_BACK':
      return { ...initialState, step: 'intro' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

/**
 * State machine for the sync setup wizard.
 * Orchestrates real crypto + API calls via the encryption service layer.
 */
export const useSyncSetup = (baseUrl: string) => {
  const [state, dispatch] = useReducer(reducer, initialState)
  // Track if device detection returned firstDevice (for the test-only detecting step)
  const [detectedFirstDevice, setDetectedFirstDevice] = useState<boolean | null>(null)

  const continueIntro = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const response = await requestDeviceApproval(baseUrl)
      if (response.status === 'TRUSTED') {
        // Already trusted — skip setup
        dispatch({ type: 'SET_LOADING', payload: false })
        return 'already-trusted' as const
      }
      setDetectedFirstDevice(
        response.status === 'APPROVAL_PENDING' && 'firstDevice' in response && response.firstDevice,
      )
      // Go to detecting step (test-only step with two buttons)
      dispatch({ type: 'SET_LOADING', payload: false })
      return null
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to register device' })
      return null
    }
  }

  const goBack = () => dispatch({ type: 'GO_BACK' })

  // Test-only: manually choose first device path
  const chooseFirstDevice = () => dispatch({ type: 'GO_TO_FIRST_DEVICE_SETUP' })

  // Test-only: manually choose additional device path
  const chooseAdditionalDevice = () => dispatch({ type: 'GO_TO_APPROVAL_WAITING' })

  const continueFirstDeviceSetup = async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const { recoveryKey } = await setupFirstDevice(baseUrl)
      dispatch({ type: 'SETUP_COMPLETE', payload: recoveryKey })
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err instanceof Error ? err.message : 'Failed to set up encryption' })
    }
  }

  const goToRecoveryKeyEntry = () => dispatch({ type: 'GO_TO_RECOVERY_KEY_ENTRY' })

  const setRecoveryKeyInput = (value: string) => dispatch({ type: 'SET_RECOVERY_KEY_INPUT', payload: value })

  const submitRecoveryKey = async (): Promise<boolean> => {
    const cleaned = state.recoveryKeyInput.replace(/\s/g, '')
    if (cleaned.length !== 64) {
      dispatch({ type: 'SET_RECOVERY_KEY_ERROR', payload: 'Recovery key must be 64 characters.' })
      return false
    }
    if (!/^[0-9a-f]+$/i.test(cleaned)) {
      dispatch({
        type: 'SET_RECOVERY_KEY_ERROR',
        payload: 'Recovery key must contain only hex characters (0-9, a-f).',
      })
      return false
    }

    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const isValid = await recoverWithKey(baseUrl, cleaned)
      if (!isValid) {
        dispatch({ type: 'SET_RECOVERY_KEY_ERROR', payload: 'Recovery key is incorrect. Please check and try again.' })
        return false
      }
      dispatch({ type: 'SET_LOADING', payload: false })
      return true
    } catch (err) {
      dispatch({
        type: 'SET_RECOVERY_KEY_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to verify recovery key',
      })
      return false
    }
  }

  const setApprovalChecked = (checked: boolean) => dispatch({ type: 'SET_APPROVAL_CHECKED', payload: checked })

  const confirmApproval = async (): Promise<boolean> => {
    if (!state.approvalChecked) {
      return false
    }

    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const approved = await checkApprovalAndUnwrap(baseUrl)
      if (!approved) {
        dispatch({
          type: 'SET_APPROVAL_ERROR',
          payload: 'Not approved yet. Check your other device and try again.',
        })
        dispatch({ type: 'SET_APPROVAL_CHECKED', payload: false })
        return false
      }
      dispatch({ type: 'SET_LOADING', payload: false })
      return true
    } catch (err) {
      dispatch({
        type: 'SET_APPROVAL_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to check approval',
      })
      return false
    }
  }

  const reset = () => {
    dispatch({ type: 'RESET' })
    setDetectedFirstDevice(null)
  }

  return {
    ...state,
    detectedFirstDevice,
    continueIntro,
    goBack,
    chooseFirstDevice,
    chooseAdditionalDevice,
    continueFirstDeviceSetup,
    goToRecoveryKeyEntry,
    setRecoveryKeyInput,
    submitRecoveryKey,
    setApprovalChecked,
    confirmApproval,
    reset,
  }
}
