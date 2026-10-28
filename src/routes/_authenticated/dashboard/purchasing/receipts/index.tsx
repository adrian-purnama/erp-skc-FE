import { createFileRoute } from '@tanstack/react-router'
import GoodsReceiptsForm from '#/components/forms/purchasing/GoodsReceiptsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/receipts/')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.receive'),
  component: GoodsReceiptsPage,
})

function GoodsReceiptsPage() {
  return <GoodsReceiptsForm />
}
