import { createFileRoute } from '@tanstack/react-router'
import ItemMasterForm from '#/components/forms/ItemMasterForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/item-master/')({
  beforeLoad: () => requirePermissionBeforeLoad('itemMaster.view'),
  component: ItemMasterPage,
})

function ItemMasterPage() {
  return <ItemMasterForm />
}
