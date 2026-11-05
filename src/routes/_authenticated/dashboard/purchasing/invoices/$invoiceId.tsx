import { createFileRoute } from '@tanstack/react-router'
import VendorInvoiceEditor from '#/components/forms/purchasing/VendorInvoiceEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/invoices/$invoiceId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.viewAll'),
  component: VendorInvoicePage,
})

function VendorInvoicePage() {
  const { invoiceId } = Route.useParams()
  return <VendorInvoiceEditor key={invoiceId} invoiceId={invoiceId} />
}
