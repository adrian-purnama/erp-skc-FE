import { Link, useNavigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import PasswordInput from '#/components/forms/PasswordInput'
import { apiFetch } from '#/lib/api'
import { useAuth } from '#/context/authContext'
import { useBranding } from '#/context/brandingContext'
import {
  buttonClassNameFull,
  cardClassName,
  hintClassName,
  inputClassNameCompact,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

interface LoginResponse {
  email: string
  jwt: string
}

export default function LoginForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { openRegister, firstRegister } = useBranding()
  const showRegister = openRegister || firstRegister
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim() || !password) {
      toast.error('Email and password are required')
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
      })

      if (!response.success || !response.data?.jwt) {
        toast.error(response.message || 'Login failed')
        return
      }

      await login(response.data.jwt)
      toast.success(response.message || 'Logged in successfully')
      await navigate({ to: '/dashboard' })
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`${cardClassName} w-full p-6 sm:p-8`}>
      <h1 className={cn('mb-6', pageTitleClassName)}>Sign in</h1>

      <form className="w-full space-y-4" onSubmit={handleSubmit}>
        <div className="w-full">
          <label htmlFor="login-email" className="mb-1 block text-sm text-[var(--ink)]">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClassNameCompact}
          />
        </div>

        <div className="w-full">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm text-[var(--ink)]">
              Password
            </label>
            <Link to="/forgot-password" className={`${hintClassName} underline hover:text-[var(--ink)]`}>
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
          />
        </div>

        <label className={`flex items-center gap-2 ${hintClassName}`}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          Remember me
        </label>

        <button type="submit" disabled={loading} className={buttonClassNameFull}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {showRegister ? (
        <p className={`mt-6 ${hintClassName}`}>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-[var(--ink)] underline">
            Register
          </Link>
        </p>
      ) : null}
    </div>
  )
}
