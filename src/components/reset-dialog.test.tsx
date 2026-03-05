import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'bun:test'
import { getClock } from '@/testing-library'
import { ResetDialog, triggerResetDialog } from './reset-dialog'

describe('ResetDialog', () => {
  it('should not show dialog initially', () => {
    render(<ResetDialog />)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('should show device revoked dialog when triggered', async () => {
    render(<ResetDialog />)

    await act(async () => {
      triggerResetDialog('device-revoked')
      await getClock().tickAsync(0)
    })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Device Revoked')).toBeInTheDocument()
    expect(
      screen.getByText('This device has been revoked. The app will now reset and you will need to sign in again.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Resetting app and deleting data...')).toBeInTheDocument()
  })

  it('should show account deleted dialog when triggered', async () => {
    render(<ResetDialog />)

    await act(async () => {
      triggerResetDialog('account-deleted')
      await getClock().tickAsync(0)
    })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Account Deleted')).toBeInTheDocument()
    expect(
      screen.getByText('Your account has been deleted. The app will now reset and all local data will be removed.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Resetting app and deleting data...')).toBeInTheDocument()
  })

  it('should trigger dialog via custom event', async () => {
    render(<ResetDialog />)

    await act(async () => {
      triggerResetDialog('device-revoked')
      await getClock().tickAsync(0)
    })

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Device Revoked')).toBeInTheDocument()
  })
})
