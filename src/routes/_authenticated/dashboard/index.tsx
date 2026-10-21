import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard/')({
  component: DashboardHomePage,
})

function DashboardHomePage() {
  return (
    <>
      <h1 className="text-2xl font-medium">Dashboard</h1>
      <p className="mt-3 max-w-xl text-sm text-[var(--muted)]">
        Open Master Data in the side menu, then choose a master data screen.
      </p>
    </>
  )
}
