import { createFileRoute } from '@tanstack/react-router'
import VendorInvoicesForm from '#/components/forms/purchasing/VendorInvoicesForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/invoices/')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.viewAll'),
  component: VendorInvoicesPage,
})

function VendorInvoicesPage() {
  return <VendorInvoicesForm />
}
