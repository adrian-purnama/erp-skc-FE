import { createFileRoute } from '@tanstack/react-router'
import ProjectProductionPage from '#/components/forms/production/ProjectProductionPage'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type ProductionProjectSearch = {
  projectId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/internal/production/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('production.view'),
  validateSearch: (
    search: Record<string, unknown>,
  ): ProductionProjectSearch => ({
    projectId: optionalString(search.projectId),
  }),
  component: ProductionProjectRoute,
})

function ProductionProjectRoute() {
  const { projectId } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ProjectProductionPage
      projectId={projectId}
      onProjectIdChange={(next) => {
        void navigate({ search: { projectId: next }, replace: true })
      }}
    />
  )
}
