import { createFileRoute } from '@tanstack/react-router'
import TenderCalendarForm from '#/components/forms/TenderCalendarForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type TenderCalendarSearch = {
  projectId?: string
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/tender/calendar/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  validateSearch: (search: Record<string, unknown>): TenderCalendarSearch => ({
    projectId:
      typeof search.projectId === 'string' && search.projectId.trim()
        ? search.projectId.trim()
        : undefined,
  }),
  component: TenderCalendarPage,
})

function TenderCalendarPage() {
  const { projectId } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <TenderCalendarForm
      projectId={projectId}
      onProjectIdChange={(next) => {
        void navigate({
          search: (prev) => ({
            ...prev,
            projectId: next,
          }),
          replace: true,
        })
      }}
    />
  )
}
