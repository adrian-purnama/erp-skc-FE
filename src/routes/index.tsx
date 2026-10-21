import { createFileRoute, redirect } from '@tanstack/react-router'
import { bootstrapAuth } from '#/context/authContext'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const user = await bootstrapAuth()
    throw redirect({ to: user ? '/dashboard' : '/login' })
  },
  component: () => null,
})
