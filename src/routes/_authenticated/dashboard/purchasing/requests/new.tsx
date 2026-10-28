import { createFileRoute } from '@tanstack/react-router'
import PurchaseRequestEditor from '#/components/forms/purchasing/PurchaseRequestEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewPurchaseRequestSearch = {
  productionOrderId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/requests/new',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.request'),
  validateSearch: (
    search: Record<string, unknown>,
  ): NewPurchaseRequestSearch => ({
    productionOrderId: optionalString(search.productionOrderId),
  }),
  component: NewPurchaseRequestPage,
})

function NewPurchaseRequestPage() {
  const { productionOrderId } = Route.useSearch()
  return (
    <PurchaseRequestEditor
      key={productionOrderId ?? 'none'}
      productionOrderId={productionOrderId}
    />
  )
}
