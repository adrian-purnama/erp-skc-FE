import { createFileRoute } from '@tanstack/react-router'
import ProjectQuotationForm from '#/components/forms/ProjectQuotationForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type QuotationSearch = {
  projectId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/internal/quotation/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('quotation.view'),
  validateSearch: (search: Record<string, unknown>): QuotationSearch => ({
    projectId: optionalString(search.projectId),
  }),
  component: QuotationPage,
})

function QuotationPage() {
  const { projectId } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ProjectQuotationForm
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
