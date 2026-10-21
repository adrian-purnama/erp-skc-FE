import { createFileRoute } from '@tanstack/react-router'
import LoginForm from '#/components/forms/LoginForm'
import { useBranding } from '#/context/brandingContext'

export const Route = createFileRoute('/_auth/login')({
  component: LoginPage,
})

function LoginPage() {
  const { appLogo, appName, openLogin, ready } = useBranding()

  return (
    <main className="mx-auto mt-8 mb-12 w-full max-w-md px-6 pt-12 pb-10 text-[var(--ink)] sm:mt-12 sm:pt-16">
      {appLogo && (
        <img
          src={appLogo}
          alt={appName}
          className="mb-4 h-15 w-auto max-w-full object-contain object-left"
        />
      )}

      {!ready ? null : openLogin ? (
        <LoginForm />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Login is closed. Please contact an administrator.
        </p>
      )}
    </main>
  )
}
