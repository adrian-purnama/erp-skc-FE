import { createFileRoute } from '@tanstack/react-router'
import PurchaseRabEditor from '#/components/forms/purchasing/PurchaseRabEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/rabs/$rabId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.view'),
  component: PurchaseRabPage,
})

function PurchaseRabPage() {
  const { rabId } = Route.useParams()
  return <PurchaseRabEditor key={rabId} rabId={rabId} />
}
