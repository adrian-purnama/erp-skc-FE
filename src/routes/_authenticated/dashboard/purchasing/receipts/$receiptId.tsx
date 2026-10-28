import { createFileRoute } from '@tanstack/react-router'
import GoodsReceiptEditor from '#/components/forms/purchasing/GoodsReceiptEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/receipts/$receiptId')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.viewAll'),
  component: ReceiptPage,
})

function ReceiptPage() {
  const { receiptId } = Route.useParams()
  return <GoodsReceiptEditor key={receiptId} receiptId={receiptId} />
}
