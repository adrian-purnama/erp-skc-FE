import { createFileRoute } from '@tanstack/react-router'
import VendorInvoiceEditor from '#/components/forms/purchasing/VendorInvoiceEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewInvoiceSearch = {
  orderId?: string
  receiptId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/invoices/new')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.realize'),
  validateSearch: (search: Record<string, unknown>): NewInvoiceSearch => ({
    orderId: optionalString(search.orderId),
    receiptId: optionalString(search.receiptId),
  }),
  component: NewInvoicePage,
})

function NewInvoicePage() {
  const { orderId, receiptId } = Route.useSearch()
  return (
    <VendorInvoiceEditor
      key={`${orderId ?? 'none'}:${receiptId ?? ''}`}
      orderId={orderId}
      receiptId={receiptId}
    />
  )
}
