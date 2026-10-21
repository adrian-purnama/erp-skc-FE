import { createFileRoute } from '@tanstack/react-router'
import VendorForm from '#/components/forms/VendorForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/vendors/new')({
  beforeLoad: () =>
    requirePermissionBeforeLoad('vendor.manage', '/dashboard/vendors'),
  component: NewVendorPage,
})

function NewVendorPage() {
  return <VendorForm mode="create" />
}
