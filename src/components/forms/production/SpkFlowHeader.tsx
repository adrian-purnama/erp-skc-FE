import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Badge as PipelineBadge,
  TONE_BAR,
} from '#/components/forms/ProjectPipelineHeader'
import { apiFetch } from '#/lib/api'
import type { PipelineTone } from '#/lib/projectPipeline'
import type { PurchaseFlow } from '#/lib/purchaseFlow'
import type { ProductionOrder } from '#/lib/production'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Stage = {
  key: string
  title: string
  tone: PipelineTone
  label: string
  detail: string
  pct: number | null
  links?: Array<{ id: string; number: string; note: string }>
  /** What to do when this is the first stage not done. */
  next: string
}

const pctOf = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0
const linkClass =
  'text-sky-700 underline-offset-4 hover:underline dark:text-sky-300'

/** The PO side of a stage: none, waiting, approved; and the POs to link. */
function orderStage(orders: PurchaseFlow['orders']) {
  const live = orders.filter((o) => o.status !== 'cancelled' || o.closedPartial)
  const approved = live.filter(
    (o) => o.status === 'approved' || o.closedPartial,
  )
  const pending = live.find((o) => o.status === 'pending_approval')
  return { live, approved, pending }
}

/**
 * Where an SPK stands, stage by stage. Inhouse: material → production.
 * Subcon: vendor → material → at vendor → handed over.
 * Outsource: vendor → handed over.
 * Fee PO numbers stay in purchasing/finance; only a text next-action is shown.
 */
export default function SpkFlowHeader({ order }: { order: ProductionOrder }) {
  const [flow, setFlow] = useState<PurchaseFlow | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<PurchaseFlow>(
          `/purchasing/flow?kind=spk&id=${order.id}`,
        )
        if (!cancelled) setFlow(response.success ? response.data : null)
      } catch {
        if (!cancelled) setFlow(null)
      }
    })()
    return () => {
      cancelled = true
    }
    // Refetch whenever the SPK itself changed (status, progress, documents).
  }, [order])

  // Without purchasing access, fall back to the SPK's own PO list (no receipt detail).
  const orders: PurchaseFlow['orders'] =
    flow?.orders ??
    order.purchaseOrders.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      closedPartial: false,
      approvalLevel: null,
      vendorName: p.vendorName,
      total: p.total,
      estimatedTotal: p.total,
      vendorFee: p.vendorFee,
      receipt: 'none' as const,
      receivedSubtotal: '0',
      payable: null,
      paid: null,
    }))
  const fee = orderStage(orders.filter((o) => o.vendorFee))
  const material = orderStage(orders.filter((o) => !o.vendorFee))
  const done = Number(order.doneQty)
  const qty = Number(order.qty)
  const stages: Stage[] = []

  if (order.type !== 'inhouse') {
    stages.push({
      key: 'vendor',
      title: 'Vendor',
      ...(fee.approved.length > 0
        ? {
            tone: 'ok' as const,
            label: 'Ready',
            detail: fee.approved[0]!.vendorName,
          }
        : fee.pending || fee.live.length > 0
          ? {
              tone: 'progress' as const,
              label: 'Waiting fee PO',
              detail: fee.pending?.vendorName || fee.live[0]?.vendorName || '',
            }
          : {
              tone: 'idle' as const,
              label: 'No vendor',
              detail: 'Request vendor fee',
            }),
      pct: null,
      next:
        fee.pending || fee.live.length > 0
          ? 'Waiting fee PO'
          : 'Next: request vendor fee',
    })
  }

  if (order.type !== 'outsource') {
    const arrived =
      material.approved.length > 0 &&
      material.approved.every((o) => o.receipt === 'full' || o.closedPartial)
    const partly = material.approved.some((o) => o.receipt !== 'none')
    const hasMaterial = order.materials.some(
      (m) =>
        !order.vendorFees.some((f) => f.materialItemId === m.materialItemId),
    )
    stages.push({
      key: 'material',
      title: order.type === 'subcon' ? 'Material bought' : 'Material',
      ...(!hasMaterial
        ? {
            tone: 'ok' as const,
            label: 'None needed',
            detail: 'No BOQ material',
          }
        : arrived
          ? {
              tone: 'ok' as const,
              label: 'Arrived',
              detail: `${material.approved.length} PO`,
            }
          : partly
            ? {
                tone: 'progress' as const,
                label: 'Partly arrived',
                detail: `${material.approved.length} PO`,
              }
            : material.live.length > 0
              ? {
                  tone: 'progress' as const,
                  label: material.approved.length ? 'Ordered' : 'Ordering',
                  detail: `${material.live.length} PO`,
                }
              : (flow?.requests.length ?? 0) > 0
                ? {
                    tone: 'progress' as const,
                    label: 'Requested',
                    detail: 'Make the PO',
                  }
                : {
                    tone: 'idle' as const,
                    label: 'Not requested',
                    detail: 'Request the material',
                  }),
      pct: null,
      links: material.live.map((o) => ({
        id: o.id,
        number: o.number,
        note: o.receipt === 'full' ? 'arrived' : o.status.replace('_', ' '),
      })),
      next:
        material.live.length > 0
          ? 'Waiting for the material to arrive'
          : 'Next: request the material',
    })
  }

  if (order.type === 'subcon') {
    const mats = order.materialsAtVendor
    const atVendor = mats.filter(
      (m) => Number(m.atVendorQty) >= Number(m.needQty),
    ).length
    stages.push({
      key: 'atVendor',
      title: 'At vendor',
      tone:
        mats.length === 0 || atVendor === mats.length
          ? 'ok'
          : atVendor > 0 || order.dispatches.some((d) => d.status === 'sent')
            ? 'progress'
            : 'idle',
      label:
        mats.length === 0 ? 'None needed' : `${atVendor} of ${mats.length}`,
      detail: order.dispatches.some((d) =>
        ['draft', 'pending_approval', 'approved'].includes(d.status),
      )
        ? 'Surat jalan in progress'
        : mats.length === 0 || atVendor === mats.length
          ? 'All there'
          : 'Not sent yet',
      pct: mats.length ? pctOf(atVendor, mats.length) : null,
      next: 'Next: send material to the vendor',
    })
  }

  stages.push({
    key: 'work',
    title: order.type === 'inhouse' ? 'Production' : 'Handed over',
    tone: done >= qty ? 'ok' : done > 0 ? 'progress' : 'idle',
    label: `${order.doneQty} of ${order.qty}`,
    detail:
      order.type === 'inhouse'
        ? 'Reported done'
        : `${order.handovers.filter((h) => h.status === 'posted').length} handover(s)`,
    pct: pctOf(done, qty),
    next:
      order.type === 'inhouse'
        ? 'Production in progress: report output'
        : "Waiting for the vendor's handover",
  })

  /** Fee lives in purchasing/finance — text cue only, never PO numbers or amounts. */
  const feeCue =
    order.type === 'inhouse' || fee.approved.length > 0
      ? null
      : fee.pending || fee.live.length > 0
        ? 'Waiting fee PO'
        : 'Next: request vendor fee'

  const first = stages.find((s) => s.tone !== 'ok')
  const nextText =
    order.status === 'draft'
      ? 'Next: release this SPK'
      : order.status === 'cancelled'
        ? 'This SPK was cancelled'
        : order.status === 'completed' && !first
          ? 'SPK completed'
          : (first?.next ?? feeCue ?? 'All stages done: complete the SPK')

  return (
    <section
      aria-label="SPK progress"
      className="rounded-md border border-(--line)"
    >
      <p className="border-b border-(--line) px-4 py-2 text-sm font-medium">
        {nextText}
      </p>
      <ol
        className={cn(
          'grid gap-px bg-(--line)',
          stages.length >= 4
            ? 'sm:grid-cols-2 lg:grid-cols-4'
            : stages.length === 3
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-2',
        )}
      >
        {stages.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              'flex min-w-0 flex-col gap-1 bg-(--background) px-3 py-2.5 text-xs',
              s === first && 'bg-(--surface)',
            )}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="truncate text-sm font-medium">
                {i + 1} {s.title}
              </span>
              <PipelineBadge tone={s.tone}>{s.label}</PipelineBadge>
            </span>
            <p className={cn('truncate', hintClassName)}>{s.detail}</p>
            {s.links?.slice(0, 2).map((l): ReactNode => (
              <p key={l.id} className="truncate tabular-nums">
                <Link
                  to="/dashboard/purchasing/orders/$orderId"
                  params={{ orderId: l.id }}
                  className={linkClass}
                >
                  {l.number}
                </Link>
                <span className={hintClassName}> · {l.note}</span>
              </p>
            ))}
            {s.pct !== null ? (
              <span className="mt-auto block h-1 w-full overflow-hidden rounded-full bg-(--line)">
                <span
                  className={cn('block h-full rounded-full', TONE_BAR[s.tone])}
                  style={{ width: `${s.pct}%` }}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}
