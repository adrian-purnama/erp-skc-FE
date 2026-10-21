import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { bootstrapAuth } from '#/context/authContext'

export const Route = createFileRoute('/_authenticated')({
  ssr: false,
  beforeLoad: async () => {
    const user = await bootstrapAuth()
    if (!user) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return <Outlet />
}
