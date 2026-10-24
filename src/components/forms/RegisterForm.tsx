import { Link, useNavigate } from '@tanstack/react-router'
import { Send } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import PasswordInput from '#/components/forms/PasswordInput'
import { apiFetch } from '#/lib/api'
import { useAuth } from '#/context/authContext'
import { useBranding } from '#/context/brandingContext'
import {
  buttonClassName,
  buttonClassNameFull,
  cardClassName,
  hintClassName,
  inputClassNameCompact,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

interface RegisterResponse {
  email: string
  jwt: string
}

export default function RegisterForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { openLogin } = useBranding()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)

  async function sendOtp() {
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    setSendingOtp(true)

    try {
      const response = await apiFetch<{ email: string }>('/auth/otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), isResetPassword: false }),
      })

      if (!response.success) {
        toast.error(response.message || 'Failed to send OTP')
        return
      }

      setOtpSent(true)
      toast.success('OTP sent to your email')
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setSendingOtp(false)
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    if (!otp.trim() || !password) {
      toast.error('OTP and password are required')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          password,
        }),
      })

      if (!response.success || !response.data?.jwt) {
        toast.error(response.message || 'Registration failed')
        return
      }

      await login(response.data.jwt)
      toast.success(response.message || 'Account created successfully')
      await navigate({ to: '/dashboard' })
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${cardClassName} w-full p-6 sm:p-8`}>
      <h1 className={cn('mb-6', pageTitleClassName)}>Register</h1>

      <form className="w-full space-y-4" onSubmit={handleRegister}>
        <div className="w-full">
          <label htmlFor="register-email" className="mb-1 block text-sm text-[var(--ink)]">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassNameCompact}
          />
        </div>

        <div className="w-full">
          <label htmlFor="register-otp" className="mb-1 block text-sm text-[var(--ink)]">
            OTP
          </label>
          <div className="flex gap-2">
            <input
              id="register-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              className={inputClassNameCompact}
              placeholder={otpSent ? 'Enter code' : 'Send OTP first'}
            />
            <button
              type="button"
              disabled={sendingOtp || !email.trim()}
              onClick={() => void sendOtp()}
              aria-label={otpSent ? 'Resend OTP' : 'Send OTP'}
              className={`${buttonClassName} shrink-0 px-3 py-2 disabled:cursor-not-allowed`}
            >
              {sendingOtp ? (
                '…'
              ) : otpSent ? (
                'Resend'
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="w-full">
          <label htmlFor="register-password" className="mb-1 block text-sm text-[var(--ink)]">
            Password
          </label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>

        <div className="w-full">
          <label
            htmlFor="register-confirm-password"
            className="mb-1 block text-sm text-[var(--ink)]"
          >
            Confirm password
          </label>
          <PasswordInput
            id="register-confirm-password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={buttonClassNameFull}
        >
          {loading ? 'Creating account…' : 'Register'}
        </button>
      </form>

      {openLogin ? (
        <p className={`mt-6 ${hintClassName}`}>
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--ink)] underline">
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  )
}
