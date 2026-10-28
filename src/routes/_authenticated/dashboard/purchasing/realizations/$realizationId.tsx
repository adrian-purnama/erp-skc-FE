import { createFileRoute } from '@tanstack/react-router'
import RealizationEditor from '#/components/forms/purchasing/RealizationEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/realizations/$realizationId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.viewAll'),
  component: RealizationPage,
})

function RealizationPage() {
  const { realizationId } = Route.useParams()
  return <RealizationEditor key={realizationId} realizationId={realizationId} />
}
