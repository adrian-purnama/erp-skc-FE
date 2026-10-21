import { createFileRoute, redirect } from '@tanstack/react-router'
import { bootstrapAuth, canFromUser } from '#/context/authContext'

export const Route = createFileRoute('/admin/')({
  beforeLoad: async () => {
    const user = await bootstrapAuth()
    if (!user) throw redirect({ to: '/login' })
    if (canFromUser(user, 'admin.config.view')) {
      throw redirect({ to: '/admin/app-config' })
    }
    if (canFromUser(user, 'admin.user.view')) {
      throw redirect({ to: '/admin/users' })
    }
    if (canFromUser(user, 'admin.role.view')) {
      throw redirect({ to: '/admin/roles' })
    }
    if (canFromUser(user, 'admin.audit.view')) {
      throw redirect({ to: '/admin/audit' })
    }
    if (canFromUser(user, 'admin.shrinkDb.run')) {
      throw redirect({ to: '/admin/shrink-db' })
    }
    throw redirect({ to: '/dashboard' })
  },
})
