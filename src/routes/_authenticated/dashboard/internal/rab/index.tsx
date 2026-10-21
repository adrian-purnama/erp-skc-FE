import { createFileRoute } from '@tanstack/react-router'
import ProjectRabForm from '#/components/forms/ProjectRabForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type RabSearch = {
  projectId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/internal/rab/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  validateSearch: (search: Record<string, unknown>): RabSearch => ({
    projectId: optionalString(search.projectId),
  }),
  component: RabPage,
})

function RabPage() {
  const { projectId } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ProjectRabForm
      projectId={projectId}
      onProjectIdChange={(next) => {
        void navigate({
          search: { projectId: next },
          replace: true,
        })
      }}
    />
  )
}
