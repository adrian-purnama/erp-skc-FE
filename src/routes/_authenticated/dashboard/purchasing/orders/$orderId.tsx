import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrderEditor from '#/components/forms/purchasing/PurchaseOrderEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/orders/$orderId')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.viewAll'),
  component: PurchaseOrderPage,
})

function PurchaseOrderPage() {
  const { orderId } = Route.useParams()
  return <PurchaseOrderEditor key={orderId} orderId={orderId} />
}
