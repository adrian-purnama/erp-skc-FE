import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrderEditor from '#/components/forms/purchasing/PurchaseOrderEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewPurchaseOrderSearch = {
  requestId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/orders/new')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.manage'),
  validateSearch: (search: Record<string, unknown>): NewPurchaseOrderSearch => ({
    requestId: optionalString(search.requestId),
  }),
  component: NewPurchaseOrderPage,
})

function NewPurchaseOrderPage() {
  const { requestId } = Route.useSearch()
  return <PurchaseOrderEditor key={requestId ?? 'none'} requestId={requestId} />
}
