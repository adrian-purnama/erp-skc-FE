import { createFileRoute } from '@tanstack/react-router'
import TermOfPaymentForm from '#/components/forms/TermOfPaymentForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/term-of-payment/',
)({
  beforeLoad: () => requirePermissionBeforeLoad('termOfPayment.view'),
  component: TermOfPaymentPage,
})

function TermOfPaymentPage() {
  return <TermOfPaymentForm />
}
