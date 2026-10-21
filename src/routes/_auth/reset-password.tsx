import { createFileRoute } from '@tanstack/react-router'
import ResetPasswordForm from '#/components/forms/ResetPasswordForm'

type ResetPasswordSearch = {
  token: string
  email: string
  otp: string
}

export const Route = createFileRoute('/_auth/reset-password')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === 'string' ? search.token : '',
    email: typeof search.email === 'string' ? search.email : '',
    otp: typeof search.otp === 'string' ? search.otp : '',
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  return (
    <main className="mx-auto mt-8 mb-12 w-full max-w-md px-6 pt-12 pb-10 text-[var(--ink)] sm:mt-12 sm:pt-16">
      <ResetPasswordForm />
    </main>
  )
}
