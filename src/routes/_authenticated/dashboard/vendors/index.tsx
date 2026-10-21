import { createFileRoute } from '@tanstack/react-router'
import VendorForm from '#/components/forms/VendorForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/vendors/')({
  beforeLoad: () => requirePermissionBeforeLoad('vendor.view'),
  component: VendorsPage,
})

function VendorsPage() {
  return <VendorForm mode="list" />
}
