import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Hourglass,
  Layers,
  ReceiptText,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react'
import PaymentDialog from '#/components/forms/purchasing/PaymentDialog'
import ListTable, {
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import { formatRupiah, paymentLabel } from '#/lib/purchasing'
import type { PurchasePayment } from '#/lib/purchasing'

function waitingFor(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

/** Notas of a reimbursement that wait on you. */
function myItems(p: PurchasePayment) {
  return p.items.filter((i) => i.viewerCanApprove)
}

/** Vendor payments and reimbursement notas waiting on your approval. */
export default function PaymentApprovalsList({
  onCount,
}: {
  onCount?: (count: number) => void
}) {
  const [rows, setRows] = useState<PurchasePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<PurchasePayment[]>(
        '/purchasing/payments/approvals',
      )
      if (!response.success) {
        setError(response.message || 'Failed to load payments')
        return
      }
      setRows(response.data)
      onCount?.(response.data.length)
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [onCount])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo<ListTableColumn<PurchasePayment>[]>(
    () => [
      {
        header: 'Payment',
        icon: ReceiptText,
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      {
        header: 'What',
        icon: Truck,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate">{paymentLabel(r)}</p>
            <p className="truncate text-xs text-(--muted)">
              {r.kind === 'vendor' ? r.vendorName : `to ${r.payeeName}`}
            </p>
          </div>
        ),
      },
      {
        header: 'PO',
        icon: ShoppingCart,
        cellClassName: 'w-48 tabular-nums',
        cell: (r) =>
          r.kind === 'vendor'
            ? r.purchaseOrderNumber
            : [...new Set(myItems(r).map((i) => i.purchaseOrderNumber))].join(
                ', ',
              ),
      },
      {
        header: 'Amount',
        icon: Wallet,
        cellClassName: 'w-40 text-right tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">
              {formatRupiah(
                r.kind === 'vendor'
                  ? r.amount
                  : String(
                      myItems(r).reduce((s, i) => s + Number(i.amount), 0),
                    ),
              )}
            </p>
            {r.kind === 'reimburse' ? (
              <p className="text-xs text-(--muted)">
                {myItems(r).length} of {r.items.length} notas for you
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Level',
        icon: Layers,
        cellClassName: 'w-24',
        cell: (r) =>
          `Level ${(r.kind === 'vendor' ? r.approvalLevel : myItems(r)[0]?.approvalLevel) ?? '—'}`,
      },
      {
        header: 'Waiting',
        icon: Hourglass,
        cellClassName: 'w-24 text-xs tabular-nums',
        cell: (r) => waitingFor(r.submittedAt),
      },
    ],
    [],
  )

  if (error) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-red-600">{error}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          Retry
        </Button>
      </div>
    )
  }

  return (
    <>
      <ListTable
        loading={loading}
        loadingLabel="Loading payments…"
        empty="No payments are waiting for your approval."
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        minWidthClassName="min-w-[900px]"
        onRowClick={(r) => setOpenId(r.id)}
      />
      <PaymentDialog
        paymentId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
        onChanged={() => void load()}
      />
    </>
  )
}
