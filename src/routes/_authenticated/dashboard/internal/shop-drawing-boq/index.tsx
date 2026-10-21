import { createFileRoute } from '@tanstack/react-router'
import ShopDrawingBoqForm from '#/components/forms/ShopDrawingBoqForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type ShopDrawingBoqSearch = {
  projectId?: string
  itemId?: string
  fileId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/internal/shop-drawing-boq/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  validateSearch: (search: Record<string, unknown>): ShopDrawingBoqSearch => ({
    projectId: optionalString(search.projectId),
    itemId: optionalString(search.itemId),
    fileId: optionalString(search.fileId),
  }),
  component: ShopDrawingBoqPage,
})

function ShopDrawingBoqPage() {
  const { projectId, itemId, fileId } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ShopDrawingBoqForm
      projectId={projectId}
      itemId={itemId}
      fileId={fileId}
      onProjectIdChange={(next) => {
        void navigate({
          search: {
            projectId: next,
            itemId: undefined,
            fileId: undefined,
          },
          replace: true,
        })
      }}
      onSelectionChange={(next) => {
        if (next.itemId === itemId && next.fileId === fileId) return
        void navigate({
          search: (prev) => ({
            ...prev,
            itemId: next.itemId,
            fileId: next.fileId,
          }),
          replace: true,
        })
      }}
    />
  )
}
