import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrderApprovalsForm from '#/components/forms/purchasing/PurchaseOrderApprovalsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/approvals/',
)({
  beforeLoad: () =>
    requirePermissionBeforeLoad(['purchasing.approve', 'purchasing.approve2']),
  component: PurchaseOrderApprovalsPage,
})

function PurchaseOrderApprovalsPage() {
  return <PurchaseOrderApprovalsForm />
}
