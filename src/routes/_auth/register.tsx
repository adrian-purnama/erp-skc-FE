import { createFileRoute } from '@tanstack/react-router'
import RegisterForm from '#/components/forms/RegisterForm'
import { useBranding } from '#/context/brandingContext'

export const Route = createFileRoute('/_auth/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const { appLogo, appName, openRegister, firstRegister, ready } = useBranding()
  const canRegister = openRegister || firstRegister

  return (
    <main className="mx-auto mt-8 mb-12 w-full max-w-md px-6 pt-12 pb-10 text-[var(--ink)] sm:mt-12 sm:pt-16">
      {appLogo && (
        <img
          src={appLogo}
          alt={appName}
          className="mb-4 h-15 w-auto max-w-full object-contain object-left"
        />
      )}

      {!ready ? null : canRegister ? (
        <RegisterForm />
      ) : (
        <p className="text-sm text-[var(--muted)]">
          Registration is closed. Please contact an administrator.
        </p>
      )}
    </main>
  )
}
