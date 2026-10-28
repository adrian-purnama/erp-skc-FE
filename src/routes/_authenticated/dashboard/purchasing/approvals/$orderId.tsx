import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrderEditor from '#/components/forms/purchasing/PurchaseOrderEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/approvals/$orderId')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.approve'),
  component: PurchaseOrderApprovalPage,
})

function PurchaseOrderApprovalPage() {
  const { orderId } = Route.useParams()
  return <PurchaseOrderEditor key={orderId} orderId={orderId} mode="approval" />
}
