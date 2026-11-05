import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, CircleCheck, TriangleAlert } from 'lucide-react'
import { RabLink } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { amountOf } from '#/components/forms/purchasing/PurchaseOrderLines'
import type { PoLineRow } from '#/components/forms/purchasing/PurchaseOrderLines'
import { formatRupiah, parseQty } from '#/lib/purchasing'
import type { PurchaseRequestSummary } from '#/lib/purchasing'
import { formatYmdLong } from '#/lib/quotation'
import { useAuth } from '#/context/authContext'
import { hintClassName, metaTextClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  request: PurchaseRequestSummary | null
  rows: PoLineRow[]
  total: number
  /** Σ qty × RAB price over lines with a RAB price. */
  rabTotal: number
  budgetLabel: string | null
  budgetRabId: string | null
  projectId: string | null
}

const linkClass = 'underline-offset-4 hover:underline'
/** Context links open beside the PO, so the approval stays in place. */
const newTab = { target: '_blank', rel: 'noreferrer' } as const

function pct(part: number, whole: number): string {
  if (whole <= 0) return ''
  const p = (part / whole) * 100
  return `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`
}

/** One concern on one line, worded for the approver. */
type Concern = { material: string; text: string; lastPaid: string | null }

function lineConcerns(r: PoLineRow): Concern[] {
  const out: Concern[] = []
  const name = r.ref.materialName
  const uom = r.ref.uomSymbol
  const last = r.ref.priceHistory.at(0)
  const lastPaid = last
    ? `Cheapest before: ${formatRupiah(last.lastPrice)} at ${last.vendorName}`
    : null
  if (!r.ref.inRab || r.ref.rabQty === null) {
    out.push({ material: name, text: 'Not on the RAB', lastPaid })
    return out
  }
  const price = Number(r.unitPrice)
  const rabPrice = r.ref.rabUnitPrice ? Number(r.ref.rabUnitPrice) : null
  if (rabPrice !== null && price > rabPrice) {
    out.push({
      material: name,
      text: `${formatRupiah(r.unitPrice)} vs RAB ${formatRupiah(r.ref.rabUnitPrice)} (+${pct(price - rabPrice, rabPrice)})`,
      lastPaid,
    })
  }
  const q = parseQty(r.qty) ?? 0
  const over = Number(r.ref.rabOrderedQty) + q - Number(r.ref.rabQty)
  if (over > 1e-9) {
    out.push({
      material: name,
      text: `${over} ${uom} more than the RAB qty (${r.ref.rabQty} ${uom})`,
      lastPaid: null,
    })
  }
  return out
}

/**
 * For the approver, top to bottom: which project, SPK and SPP this PO is
 * for, then how it sits against the RAB, with only the lines that need a look.
 */
export default function PurchaseOrderBrief({
  request,
  rows,
  total,
  rabTotal,
  budgetLabel,
  budgetRabId,
  projectId,
}: Props) {
  const { can } = useAuth()
  const concerns = rows.flatMap(lineConcerns)
  const unbudgeted = rows.filter((r) => !r.ref.rabUnitPrice)
  const budgetedTotal = rows
    .filter((r) => r.ref.rabUnitPrice)
    .reduce((s, r) => s + amountOf(r.qty, r.unitPrice), 0)
  const budgetDiff = budgetedTotal - rabTotal

  return (
    <section
      aria-label="What this PO is for"
      className="grid gap-px overflow-hidden rounded-md border border-(--line) bg-(--line) lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
    >
      <div className="space-y-3 bg-(--background) px-4 py-3">
        <p className={metaTextClassName}>What it is for</p>
        <ol className="flex flex-wrap items-stretch gap-x-2 gap-y-3 text-sm">
          {request?.projectId ? (
            <Step label="Project">
              {can('project.view') ? (
                <Link
                  to="/dashboard/projects/$projectId"
                  params={{ projectId: request.projectId }}
                  className={cn('font-medium tabular-nums', linkClass)}
                  {...newTab}
                >
                  {request.projectNumber}
                </Link>
              ) : (
                <span className="font-medium tabular-nums">
                  {request.projectNumber}
                </span>
              )}
              <span className={cn('block', hintClassName)}>
                {request.projectName}
              </span>
            </Step>
          ) : null}
          {request?.productionOrderId ? (
            <Step label="SPK" arrow={Boolean(request.projectId)}>
              {can('production.view') ? (
                <Link
                  to="/dashboard/production"
                  search={{ spk: request.productionOrderId }}
                  className={cn('font-medium tabular-nums', linkClass)}
                  {...newTab}
                >
                  {request.productionOrderNumber}
                </Link>
              ) : (
                <span className="font-medium tabular-nums">
                  {request.productionOrderNumber}
                </span>
              )}
              {request.itemLabel ? (
                <span className={cn('block', hintClassName)}>
                  {request.itemLabel}
                </span>
              ) : null}
            </Step>
          ) : request?.purchaseRabId ? (
            <Step label="Purchasing RAB" arrow={Boolean(request.projectId)}>
              <RabLink
                newTab
                purchaseRabId={request.purchaseRabId}
                projectId={null}
                label={request.purchaseRabNumber ?? 'RAB'}
              />
              {request.purchaseRabTitle ? (
                <span className={cn('block', hintClassName)}>
                  {request.purchaseRabTitle}
                </span>
              ) : null}
            </Step>
          ) : null}
          {request ? (
            <Step label="SPP" arrow>
              {can('purchasing.view') ? (
                <Link
                  to="/dashboard/purchasing/requests/$requestId"
                  params={{ requestId: request.id }}
                  className={cn('font-medium tabular-nums', linkClass)}
                  {...newTab}
                >
                  {request.number}
                </Link>
              ) : (
                <span className="font-medium tabular-nums">
                  {request.number}
                </span>
              )}
              <span className={cn('block', hintClassName)}>
                {request.requestedBy?.name ?? 'Unknown'} · needed{' '}
                {formatYmdLong(request.neededDate)}
              </span>
            </Step>
          ) : null}
        </ol>
      </div>

      <div className="space-y-2.5 bg-(--background) px-4 py-3">
        <p className={cn('flex items-center gap-2', metaTextClassName)}>
          Against the RAB
          {budgetLabel ? (
            <RabLink
              newTab
              purchaseRabId={budgetRabId}
              projectId={projectId}
              label={budgetLabel}
              className="font-normal tracking-normal normal-case"
            />
          ) : null}
        </p>
        {rabTotal > 0 ? (
          <div className="flex items-start gap-2">
            {budgetDiff > 0 ? (
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-600"
                aria-hidden
              />
            ) : (
              <CircleCheck
                className="mt-0.5 size-4 shrink-0 text-emerald-600"
                aria-hidden
              />
            )}
            <div className="min-w-0 text-sm">
              <p
                className={cn(
                  'font-medium',
                  budgetDiff > 0 && 'text-amber-800 dark:text-amber-300',
                )}
              >
                {budgetDiff > 0
                  ? `${formatRupiah(String(budgetDiff))} above RAB price (+${pct(budgetDiff, rabTotal)})`
                  : budgetDiff < 0
                    ? `${formatRupiah(String(-budgetDiff))} under RAB price`
                    : 'Exactly at RAB price'}
              </p>
              <p className={cn('text-xs tabular-nums', hintClassName)}>
                PO {formatRupiah(String(total))} · at RAB price{' '}
                {formatRupiah(String(rabTotal))}
                {unbudgeted.length > 0
                  ? ` · ${unbudgeted.length} item${unbudgeted.length === 1 ? '' : 's'} without a RAB price`
                  : ''}
              </p>
            </div>
          </div>
        ) : null}
        {concerns.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck
              className="size-4 shrink-0 text-emerald-600"
              aria-hidden
            />
            Every item is on the RAB, within its qty and price.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {concerns.map((c, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">{c.material}</span>
                <span className="text-amber-800 dark:text-amber-300">
                  {' '}
                  · {c.text}
                </span>
                {c.lastPaid ? (
                  <span className={cn('block text-xs', hintClassName)}>
                    {c.lastPaid}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {rabTotal === 0 ? (
          <p className={cn('text-xs', hintClassName)}>
            No RAB prices to compare with.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function Step({
  label,
  arrow = false,
  children,
}: {
  label: string
  arrow?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      {arrow ? (
        <ChevronRight
          className="mt-4 size-4 shrink-0 text-(--muted)"
          aria-hidden
        />
      ) : null}
      <div className="min-w-0">
        <p className={cn('text-xs', hintClassName)}>{label}</p>
        {children}
      </div>
    </li>
  )
}
