import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

export type ResetReason = 'device-revoked' | 'account-deleted'

const resetDialogEvent = 'thunderbolt:reset-dialog'

type ResetDialogEventDetail = {
  reason: ResetReason
}

/**
 * Shows a modal when the device is revoked or account is deleted.
 * Rendered outside the main app component tree to ensure it works
 * even when the app state is being cleared during reset.
 */
export const ResetDialog = () => {
  const [reason, setReason] = useState<ResetReason | null>(null)

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ResetDialogEventDetail>
      setReason(customEvent.detail.reason)
    }

    window.addEventListener(resetDialogEvent, handler)
    return () => window.removeEventListener(resetDialogEvent, handler)
  }, [])

  const isOpen = reason !== null

  const title = reason === 'device-revoked' ? 'Device Revoked' : 'Account Deleted'
  const description =
    reason === 'device-revoked'
      ? 'This device has been revoked. The app will now reset and you will need to sign in again.'
      : 'Your account has been deleted. The app will now reset and all local data will be removed.'

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="animate-spin text-gray-500" size={20} />
          <span className="text-sm text-muted-foreground">Resetting app and deleting data...</span>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Helper function to trigger the reset dialog
 */
export const triggerResetDialog = (reason: ResetReason): void => {
  const event = new CustomEvent(resetDialogEvent, { detail: { reason } })
  window.dispatchEvent(event)
}
