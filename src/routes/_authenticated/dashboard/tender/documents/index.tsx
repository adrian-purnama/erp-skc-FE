import { createFileRoute } from '@tanstack/react-router'
import TenderDocumentsForm from '#/components/forms/TenderDocumentsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type TenderDocumentsSearch = {
  projectId?: string
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/tender/documents/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  validateSearch: (search: Record<string, unknown>): TenderDocumentsSearch => ({
    projectId:
      typeof search.projectId === 'string' && search.projectId.trim()
        ? search.projectId.trim()
        : undefined,
  }),
  component: TenderDocumentsPage,
})

function TenderDocumentsPage() {
  const { projectId } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <TenderDocumentsForm
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
