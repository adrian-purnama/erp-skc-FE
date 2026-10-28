import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ShoppingCart } from 'lucide-react'
import { PurchaseRequestStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { apiFetch } from '#/lib/api'
import type { PurchaseRequestPlan, PurchaseRequestSummary } from '#/lib/purchasing'
import {
  buttonClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  productionOrderId: string
  /** SPK is released or in progress, so materials can be requested. */
  canRequest: boolean
}

/** Shows `qty uom`, or a dash for nothing yet. */
function qtyCell(qty: string, uom: string): string {
  return Number(qty) > 0 ? `${qty} ${uom}` : '—'
}

/** SPK detail: where each material stands, its requests, and a way to ask for more. */
export default function SpkMaterialRequests({
  productionOrderId,
  canRequest,
}: Props) {
  const [rows, setRows] = useState<PurchaseRequestSummary[] | null>(null)
  const [plan, setPlan] = useState<PurchaseRequestPlan | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [list, p] = await Promise.all([
          apiFetch<PurchaseRequestSummary[]>(
            `/purchasing/requests?productionOrderId=${productionOrderId}`,
          ),
          apiFetch<PurchaseRequestPlan>(`/purchasing/requests/plan/${productionOrderId}`),
        ])
        if (cancelled) return
        setRows(list.success ? list.data : [])
        setPlan(p.success ? p.data : null)
      } catch {
        if (!cancelled) setRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [productionOrderId])

  const anyFlow = (plan?.rows ?? []).some(
    (r) => Number(r.requestedQty) > 0 || Number(r.receivedQty) > 0,
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={sectionTitleClassName}>Material status</h3>
        {canRequest ? (
          <Link
            to="/dashboard/purchasing/requests/new"
            search={{ productionOrderId }}
            className={cn(
              buttonClassName,
              'inline-flex h-8 items-center gap-1.5 no-underline',
            )}
          >
            <ShoppingCart className="size-3.5" aria-hidden />
            Request materials
          </Link>
        ) : null}
      </div>

      {plan && plan.rows.length > 0 && anyFlow ? (
        <div className="overflow-x-auto rounded-md border border-(--line)">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-(--muted)">
              <tr className="border-b border-(--line)">
                <th className="px-3 py-2 font-medium">Material</th>
                <th className="px-3 py-2 text-right font-medium">Needs</th>
                <th className="px-3 py-2 text-right font-medium">Requested</th>
                <th className="px-3 py-2 text-right font-medium">Ordered</th>
                <th className="px-3 py-2 text-right font-medium">Arrived</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => {
                const ready = Number(r.receivedQty) >= Number(r.plannedQty) && Number(r.plannedQty) > 0
                return (
                  <tr
                    key={`${r.materialItemId}:${r.itemUomId}`}
                    className="border-b border-(--line) last:border-0"
                  >
                    <td className="px-3 py-1.5">{r.materialName}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.plannedQty} {r.uomSymbol}
                    </td>
                    <td className="px-3 py-1.5 text-right text-(--muted) tabular-nums">
                      {qtyCell(r.requestedQty, r.uomSymbol)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-(--muted) tabular-nums">
                      {qtyCell(r.orderedQty, r.uomSymbol)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right font-medium tabular-nums',
                        ready && 'text-emerald-700 dark:text-emerald-300',
                      )}
                    >
                      {qtyCell(r.receivedQty, r.uomSymbol)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {rows === null ? (
        <p className={cn('text-sm', hintClassName)}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={cn('text-sm', hintClassName)}>
          No materials requested yet.
        </p>
      ) : (
        <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to="/dashboard/purchasing/requests/$requestId"
                params={{ requestId: r.id }}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm no-underline hover:bg-(--surface)"
              >
                <span className="font-medium tabular-nums">{r.number}</span>
                <span className={cn('text-xs', hintClassName)}>
                  {r.lineCount} {r.lineCount === 1 ? 'item' : 'items'} ·
                  needed by {r.neededDate}
                </span>
                <PurchaseRequestStatusChip status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
