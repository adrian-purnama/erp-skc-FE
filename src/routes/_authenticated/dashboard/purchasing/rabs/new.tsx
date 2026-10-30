import { createFileRoute } from '@tanstack/react-router'
import PurchaseRabEditor from '#/components/forms/purchasing/PurchaseRabEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/rabs/new',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.rab'),
  component: NewPurchaseRabPage,
})

function NewPurchaseRabPage() {
  return <PurchaseRabEditor />
}
