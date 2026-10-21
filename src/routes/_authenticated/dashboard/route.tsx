import { Outlet, createFileRoute } from '@tanstack/react-router'
import RootMainMenuShell from '#/components/RootMainMenuShell'
import { dashboardPageClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <RootMainMenuShell>
      <main className="px-6 py-10 sm:px-8">
        <div className={dashboardPageClassName}>
          <Outlet />
        </div>
      </main>
    </RootMainMenuShell>
  )
}
