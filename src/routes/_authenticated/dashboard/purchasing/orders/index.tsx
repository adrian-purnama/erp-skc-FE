import { createFileRoute } from '@tanstack/react-router'
import PurchaseOrdersForm from '#/components/forms/purchasing/PurchaseOrdersForm'
import type { PurchaseOrdersTab } from '#/components/forms/purchasing/PurchaseOrdersForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type PurchaseOrdersSearch = { tab?: PurchaseOrdersTab }

export const Route = createFileRoute(
  '/_authenticated/dashboard/purchasing/orders/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.manage'),
  validateSearch: (search: Record<string, unknown>): PurchaseOrdersSearch => ({
    tab: search.tab === 'waiting' ? 'waiting' : undefined,
  }),
  component: PurchaseOrdersPage,
})

function PurchaseOrdersPage() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <PurchaseOrdersForm
      tab={tab ?? 'orders'}
      onTabChange={(next) => {
        void navigate({
          search: { tab: next === 'waiting' ? 'waiting' : undefined },
          replace: true,
        })
      }}
    />
  )
}
