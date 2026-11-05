import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ReceiptText } from 'lucide-react'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { formatRupiah } from '#/lib/purchasing'
import type { VendorInvoiceSummary } from '#/lib/purchasing'
import { buttonOutlineClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** A PO's vendor invoices, and a way to add one while a goods receipt is not invoiced. */
export default function PoInvoicesSection({
  orderId,
  hasVendorReceipt,
}: {
  orderId: string
  /** The PO has posted vendor goods receipts (otherwise there is nothing to invoice). */
  hasVendorReceipt: boolean
}) {
  const { can } = useAuth()
  const [rows, setRows] = useState<VendorInvoiceSummary[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void apiFetch<VendorInvoiceSummary[]>(`/purchasing/invoices?purchaseOrderId=${orderId}`)
      .then((r) => {
        if (!cancelled) setRows(r.success ? r.data : [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (rows === null || (rows.length === 0 && !hasVendorReceipt)) return null
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ReceiptText className="size-3.5" aria-hidden />
          Vendor invoices · {rows.length}
        </p>
        {can('purchasing.realize') && hasVendorReceipt ? (
          <Link
            to="/dashboard/purchasing/invoices/new"
            search={{ orderId }}
            className={cn(buttonOutlineClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
          >
            Add invoice
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className={cn('text-sm', hintClassName)}>
          No invoice yet: goods receipts count at the PO price until their invoice is posted.
        </p>
      ) : (
        <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/dashboard/purchasing/invoices/$invoiceId"
                params={{ invoiceId: r.id }}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm no-underline hover:bg-accent"
              >
                <span className="font-medium tabular-nums">{r.number}</span>
                <span className={cn('text-xs tabular-nums', hintClassName)}>
                  {r.vendorInvoiceNumber || 'no vendor no.'} · {r.receipts.map((g) => g.number).join(', ')}
                </span>
                <span className="ml-auto tabular-nums">{formatRupiah(r.total)}</span>
                <RealizationStatusChip status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
