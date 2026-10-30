import { createFileRoute } from '@tanstack/react-router'
import PaymentsForm from '#/components/forms/finance/PaymentsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type PaymentsSearch = {
  /** Opens this payment (links from notifications and flow headers). */
  payment?: string
}

export const Route = createFileRoute(
  '/_authenticated/dashboard/finance/payments/',
)({
  beforeLoad: () =>
    requirePermissionBeforeLoad([
      'purchasing.pay',
      'purchasing.realize',
      'purchasing.manage',
    ]),
  validateSearch: (search: Record<string, unknown>): PaymentsSearch => ({
    payment:
      typeof search.payment === 'string' && search.payment
        ? search.payment
        : undefined,
  }),
  component: PaymentsPage,
})

function PaymentsPage() {
  const { payment } = Route.useSearch()
  return (
    <PaymentsForm
      key={payment ?? 'list'}
      initialPaymentId={payment ?? null}
    />
  )
}
