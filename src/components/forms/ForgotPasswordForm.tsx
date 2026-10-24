import { Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { apiFetch } from '#/lib/api'
import {
  buttonClassNameFull,
  cardClassName,
  hintClassName,
  inputClassNameCompact,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch<{ email: string }>('/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), isResetPassword: true }),
      })

      if (!response.success) {
        toast.error(response.message || 'Failed to send reset link')
        return
      }

      setSent(true)
      toast.success(response.message || 'Reset link sent')
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${cardClassName} w-full p-6 sm:p-8`}>
      <h1 className={cn('mb-6', pageTitleClassName)}>Forgot password</h1>

      {sent ? (
        <p className={`leading-relaxed ${hintClassName}`}>
          If an account exists for that email, we sent a reset link. Check your inbox and follow
          the link to choose a new password.
        </p>
      ) : (
        <form className="w-full space-y-4" onSubmit={handleSubmit}>
          <div className="w-full">
            <label htmlFor="forgot-email" className="mb-1 block text-sm text-[var(--ink)]">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClassNameCompact}
            />
          </div>

          <button type="submit" disabled={loading} className={buttonClassNameFull}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className={`mt-6 ${hintClassName}`}>
        <Link to="/login" className="text-[var(--ink)] underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
