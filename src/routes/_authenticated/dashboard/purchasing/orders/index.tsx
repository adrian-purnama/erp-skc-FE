import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrdersForm from '#/components/forms/purchasing/PurchaseOrdersForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/orders/')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.manage'),
  component: PurchaseOrdersPage,
})

function PurchaseOrdersPage() {
  return <PurchaseOrdersForm />
}
