import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router'
import RootMainMenuShell from '#/components/RootMainMenuShell'
import { bootstrapAuth, canAnyFromUser } from '#/context/authContext'

const ADMIN_ACCESS = [
  'admin.config.view',
  'admin.user.view',
  'admin.role.view',
  'admin.audit.view',
  'admin.shrinkDb.run',
] as const

export const Route = createFileRoute('/admin')({
  ssr: false,
  beforeLoad: async () => {
    const user = await bootstrapAuth()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    if (!canAnyFromUser(user, [...ADMIN_ACCESS])) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: AdminLayout,
})

function breadcrumbFor(pathname: string): string[] {
  if (pathname.startsWith('/admin/app-config')) return ['Admin', 'Config']
  if (pathname.startsWith('/admin/users')) return ['Admin', 'Users']
  if (pathname.startsWith('/admin/roles/new')) return ['Admin', 'Roles', 'New']
  if (pathname.startsWith('/admin/roles/')) return ['Admin', 'Roles', 'Edit']
  if (pathname.startsWith('/admin/roles')) return ['Admin', 'Roles']
  if (pathname.startsWith('/admin/permissions')) return ['Admin', 'Permissions']
  if (pathname.startsWith('/admin/audit')) return ['Admin', 'Audit Log']
  if (pathname.startsWith('/admin/shrink-db')) return ['Admin', 'Shrink DB']
  return ['Admin']
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const crumbs = breadcrumbFor(pathname)

  return (
    <RootMainMenuShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <nav
          className="mb-4 text-sm text-[var(--muted)]"
          aria-label="Breadcrumb"
        >
          {crumbs.map((crumb, index) => (
            <span key={`${crumb}-${index}`}>
              {index > 0 ? <span className="mx-1.5">/</span> : null}
              <span
                className={
                  index === crumbs.length - 1
                    ? 'font-medium text-[var(--ink)]'
                    : undefined
                }
              >
                {crumb}
              </span>
            </span>
          ))}
        </nav>
        <Outlet />
      </div>
    </RootMainMenuShell>
  )
}
