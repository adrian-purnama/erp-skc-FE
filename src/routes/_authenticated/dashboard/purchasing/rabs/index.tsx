import { createFileRoute } from '@tanstack/react-router'
import PurchaseRabsForm from '#/components/forms/purchasing/PurchaseRabsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/rabs/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.view'),
  component: PurchaseRabsPage,
})

function PurchaseRabsPage() {
  return <PurchaseRabsForm />
}
