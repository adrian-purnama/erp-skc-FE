import { createFileRoute } from '@tanstack/react-router'
import PurchaseRequestEditor from '#/components/forms/purchasing/PurchaseRequestEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/requests/$requestId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.view'),
  component: PurchaseRequestPage,
})

function PurchaseRequestPage() {
  const { requestId } = Route.useParams()
  return <PurchaseRequestEditor key={requestId} requestId={requestId} />
}
