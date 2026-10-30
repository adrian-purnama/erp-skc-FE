import { createFileRoute } from '@tanstack/react-router'
import PurchaseRequestEditor from '#/components/forms/purchasing/PurchaseRequestEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewPurchaseRequestSearch = {
  productionOrderId?: string
  purchaseRabId?: string
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
    purchaseRabId: optionalString(search.purchaseRabId),
  }),
  component: NewPurchaseRequestPage,
})

function NewPurchaseRequestPage() {
  const { productionOrderId, purchaseRabId } = Route.useSearch()
  return (
    <PurchaseRequestEditor
      key={productionOrderId ?? purchaseRabId ?? 'none'}
      productionOrderId={productionOrderId}
      purchaseRabId={purchaseRabId}
    />
  )
}
