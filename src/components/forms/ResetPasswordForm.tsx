import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import PasswordInput from '#/components/forms/PasswordInput'
import { apiFetch } from '#/lib/api'
import { decodeResetToken } from '#/lib/reset-token'
import {
  buttonClassNameFull,
  cardClassName,
  hintClassName,
  inputClassNameCompact,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const readOnlyInputClassName = cn(
  inputClassNameCompact,
  'read-only:bg-[var(--surface)] read-only:text-[var(--muted)]',
)

export default function ResetPasswordForm() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_auth/reset-password' })
  const tokenPayload = search.token ? decodeResetToken(search.token) : null
  const email = tokenPayload?.email ?? search.email
  const otp = tokenPayload?.otp ?? search.otp
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const hasRequiredParams = Boolean(email && otp)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasRequiredParams) {
      toast.error('Invalid reset link')
      return
    }

    if (!password) {
      toast.error('Password is required')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch<{ email: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, otp, password }),
      })

      if (!response.success) {
        toast.error(response.message || 'Password reset failed')
        return
      }

      toast.success(response.message || 'Password reset successfully')
      await navigate({ to: '/login' })
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!hasRequiredParams) {
    return (
      <div className={`${cardClassName} w-full p-6 sm:p-8`}>
        <h1 className={cn('mb-6', pageTitleClassName)}>Reset password</h1>
        <p className={`mb-6 ${hintClassName}`}>
          This reset link is invalid or incomplete. Request a new one to continue.
        </p>
        <Link to="/forgot-password" className="text-sm text-[var(--ink)] underline">
          Request a new reset link
        </Link>
      </div>
    )
  }

  return (
    <div className={`${cardClassName} w-full p-6 sm:p-8`}>
      <h1 className={cn('mb-6', pageTitleClassName)}>Reset password</h1>

      <form className="w-full space-y-4" onSubmit={handleSubmit}>
        <div className="w-full">
          <label htmlFor="reset-email" className="mb-1 block text-sm text-[var(--ink)]">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            readOnly
            value={email}
            className={readOnlyInputClassName}
          />
        </div>

        <div className="w-full">
          <label htmlFor="reset-otp" className="mb-1 block text-sm text-[var(--ink)]">
            OTP
          </label>
          <input
            id="reset-otp"
            type="text"
            readOnly
            value={otp}
            className={readOnlyInputClassName}
          />
        </div>

        <div className="w-full">
          <label htmlFor="reset-password" className="mb-1 block text-sm text-[var(--ink)]">
            New password
          </label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>

        <div className="w-full">
          <label
            htmlFor="reset-confirm-password"
            className="mb-1 block text-sm text-[var(--ink)]"
          >
            Confirm password
          </label>
          <PasswordInput
            id="reset-confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </div>

        <button type="submit" disabled={loading} className={buttonClassNameFull}>
          {loading ? 'Resetting…' : 'Reset password'}
        </button>
      </form>

      <p className={`mt-6 ${hintClassName}`}>
        <Link to="/login" className="text-[var(--ink)] underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
