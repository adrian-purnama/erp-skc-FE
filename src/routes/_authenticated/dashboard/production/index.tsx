import { createFileRoute } from '@tanstack/react-router'
import ProductionOrdersForm from '#/components/forms/production/ProductionOrdersForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type ProductionSearch = {
  /** Opens this SPK (links from notifications and flow headers). */
  spk?: string
}

export const Route = createFileRoute('/_authenticated/dashboard/production/')({
  beforeLoad: () => requirePermissionBeforeLoad('production.view'),
  validateSearch: (search: Record<string, unknown>): ProductionSearch => ({
    spk: typeof search.spk === 'string' && search.spk ? search.spk : undefined,
  }),
  component: ProductionPage,
})

function ProductionPage() {
  const { spk } = Route.useSearch()
  return <ProductionOrdersForm key={spk ?? 'list'} initialOrderId={spk ?? null} />
}
