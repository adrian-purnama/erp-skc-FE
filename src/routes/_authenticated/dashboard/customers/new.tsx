import { createFileRoute } from '@tanstack/react-router'
import CustomerForm from '#/components/forms/CustomerForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/customers/new')({
  beforeLoad: () =>
    requirePermissionBeforeLoad('customer.manage', '/dashboard/customers'),
  component: NewCustomerPage,
})

function NewCustomerPage() {
  return <CustomerForm mode="create" />
}
