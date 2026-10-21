import { createFileRoute } from '@tanstack/react-router'
import UomForm from '#/components/forms/UomForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/uom/')({
  beforeLoad: () => requirePermissionBeforeLoad('uom.view'),
  component: UomPage,
})

function UomPage() {
  return <UomForm />
}
