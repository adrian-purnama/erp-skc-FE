import { createFileRoute } from '@tanstack/react-router'
import ForgotPasswordForm from '#/components/forms/ForgotPasswordForm'

export const Route = createFileRoute('/_auth/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  return (
    <main className="mx-auto mt-8 mb-12 w-full max-w-md px-6 pt-12 pb-10 text-[var(--ink)] sm:mt-12 sm:pt-16">
      <ForgotPasswordForm />
    </main>
  )
}
