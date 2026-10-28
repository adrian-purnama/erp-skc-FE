import { createFileRoute } from '@tanstack/react-router'
import PurchaseRequestsForm from '#/components/forms/purchasing/PurchaseRequestsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/requests/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.view'),
  component: PurchaseRequestsPage,
})

function PurchaseRequestsPage() {
  return <PurchaseRequestsForm />
}
