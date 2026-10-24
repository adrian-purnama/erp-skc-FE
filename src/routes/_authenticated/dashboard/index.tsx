import { createFileRoute } from '@tanstack/react-router'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/_authenticated/dashboard/')({
  component: DashboardHomePage,
})

function DashboardHomePage() {
  return (
    <>
      <h1 className={pageTitleClassName}>Dashboard</h1>
      <p className={`mt-3 max-w-xl ${hintClassName}`}>
        Open Master Data in the side menu, then choose a screen.
      </p>
    </>
  )
}
