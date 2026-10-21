import { createFileRoute } from '@tanstack/react-router'
import CustomerForm from '#/components/forms/CustomerForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/customers/$customerId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('customer.view'),
  component: EditCustomerPage,
})

function EditCustomerPage() {
  const { customerId } = Route.useParams()
  return <CustomerForm mode="edit" customerId={customerId} />
}
