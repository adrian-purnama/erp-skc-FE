import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import RootMainMenuShell from '#/components/RootMainMenuShell'
import { bootstrapAuth, canAnyFromUser } from '#/context/authContext'
import { appPageClassName } from '#/lib/ui-classes'

const ADMIN_ACCESS = [
  'admin.config.view',
  'admin.user.view',
  'admin.role.view',
  'admin.audit.view',
  'admin.shrinkDb.run',
] as const

export const Route = createFileRoute('/admin')({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await bootstrapAuth()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    if (!canAnyFromUser(user, [...ADMIN_ACCESS])) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <RootMainMenuShell>
      <main className="min-w-0 overflow-x-hidden px-6 py-10 sm:px-8">
        <div className={appPageClassName}>
          <Outlet />
        </div>
      </main>
    </RootMainMenuShell>
  )
}
