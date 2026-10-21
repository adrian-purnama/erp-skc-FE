import { createFileRoute } from '@tanstack/react-router'
import CustomerForm from '#/components/forms/CustomerForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/customers/')({
  beforeLoad: () => requirePermissionBeforeLoad('customer.view'),
  component: CustomersPage,
})

function CustomersPage() {
  return <CustomerForm mode="list" />
}
