import { createFileRoute } from '@tanstack/react-router'
import VendorForm from '#/components/forms/VendorForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/vendors/$vendorId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('vendor.view'),
  component: EditVendorPage,
})

function EditVendorPage() {
  const { vendorId } = Route.useParams()
  return <VendorForm mode="edit" vendorId={vendorId} />
}
