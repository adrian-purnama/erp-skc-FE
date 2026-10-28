import { createFileRoute } from '@tanstack/react-router'
import GoodsReceiptEditor from '#/components/forms/purchasing/GoodsReceiptEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewReceiptSearch = {
  orderId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/receipts/new')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.receive'),
  validateSearch: (search: Record<string, unknown>): NewReceiptSearch => ({
    orderId: optionalString(search.orderId),
  }),
  component: NewReceiptPage,
})

function NewReceiptPage() {
  const { orderId } = Route.useSearch()
  return <GoodsReceiptEditor key={orderId ?? 'none'} orderId={orderId} />
}
