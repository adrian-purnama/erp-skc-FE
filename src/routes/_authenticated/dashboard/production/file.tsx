import { createFileRoute } from '@tanstack/react-router'
import ProductionFileDownload from '#/components/forms/production/ProductionFileDownload'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type FileSearch = {
  projectId: string
  kind: 'sd' | 'production'
  fileId: string
  name: string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/production/file',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  validateSearch: (search: Record<string, unknown>): FileSearch => ({
    projectId: str(search.projectId),
    kind: search.kind === 'production' ? 'production' : 'sd',
    fileId: str(search.fileId),
    name: str(search.name),
  }),
  component: ProductionFilePage,
})

function ProductionFilePage() {
  const { projectId, kind, fileId, name } = Route.useSearch()
  return (
    <ProductionFileDownload
      projectId={projectId}
      kind={kind}
      fileId={fileId}
      name={name}
    />
  )
}
