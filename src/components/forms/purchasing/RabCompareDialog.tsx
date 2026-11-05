import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Columns2,
  Info,
  LoaderCircle,
} from 'lucide-react'
import { RabLink } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { apiFetch } from '#/lib/api'
import {
  PURCHASE_CHARGE_CATEGORIES,
  PURCHASE_CHARGE_CATEGORY_LABELS,
  formatRupiah,
  formatRupiahDiff,
} from '#/lib/purchasing'
import type {
  PurchaseOrderRabCompare,
  PurchaseOrderRabCompareLine,
} from '#/lib/purchasing'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const warnClassName = 'text-amber-700 dark:text-amber-300'
const goodClassName = 'text-emerald-700 dark:text-emerald-300'
const groupClassName = 'border-l border-(--line)'

function num(v: string | null): number {
  return v === null ? 0 : Number(v)
}

/** Over budget is amber, under is green, zero / unknown is muted. */
function diffClass(n: number | null): string {
  if (n === null || n === 0) return 'text-(--muted)'
  return n > 0 ? warnClassName : goodClassName
}

function rupiahDiff(n: number | null): string {
  return n === null ? '—' : formatRupiahDiff(String(Math.round(n)))
}

/** PO amount minus the same qty at the RAB price. */
function poVsRab(l: PurchaseOrderRabCompareLine): number | null {
  if (l.poQty === null || l.rabUnitPrice === null) return null
  return num(l.poAmount) - Math.round(num(l.poQty) * num(l.rabUnitPrice))
}

/** Actual cost minus the same qty at the PO price. */
function actualVsPo(l: PurchaseOrderRabCompareLine): number | null {
  if (l.poUnitPrice === null || num(l.realizedQty) === 0) return null
  return (
    num(l.realizedAmount) - Math.round(num(l.realizedQty) * num(l.poUnitPrice))
  )
}

function overQty(l: PurchaseOrderRabCompareLine): boolean {
  if (l.poQty === null || l.rabQty === null) return false
  return num(l.otherOrderedQty) + num(l.poQty) > num(l.rabQty) + 1e-9
}

function overPrice(l: PurchaseOrderRabCompareLine): boolean {
  if (l.poUnitPrice === null || l.rabUnitPrice === null) return false
  return num(l.poUnitPrice) > num(l.rabUnitPrice)
}

/** Button that opens the PO beside its RAB and realizations. */
export function RabCompareButton({
  orderId,
  className,
  size = 'sm',
}: {
  orderId: string
  className?: string
  size?: 'sm' | 'xs'
}) {
  const [open, setOpen] = useState(false)
  // Lists open the PO on row click / Enter; React events bubble out of the
  // dialog portal too, so stop them here.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <span className="contents" onClick={stop} onKeyDown={stop}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(size === 'xs' ? 'h-7 px-2 text-xs' : 'h-8', className)}
        onClick={() => setOpen(true)}
      >
        <Columns2 className="size-3.5" aria-hidden />
        Compare
      </Button>
      {open ? (
        <RabCompareDialog
          orderId={orderId}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </span>
  )
}

export default function RabCompareDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [data, setData] = useState<PurchaseOrderRabCompare | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        const response = await apiFetch<PurchaseOrderRabCompare>(
          `/purchasing/orders/${orderId}/rab-compare`,
        )
        if (cancelled) return
        if (!response.success) {
          setError(response.message || 'Failed to load the comparison')
          return
        }
        setData(response.data)
      } catch {
        if (!cancelled) setError('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, open])

  const lines = useMemo(
    () => (data?.lines ?? []).filter((l) => showAll || l.poQty !== null),
    [data, showAll],
  )

  const stats = useMemo(() => {
    const onPo = (data?.lines ?? []).filter((l) => l.poQty !== null)
    let rabAtPoQty = 0
    let poPriced = 0
    let receivedAtPo = 0
    let actualVsPoTotal = 0
    let fullyReceived = 0
    let biggest: { name: string; diff: number } | null = null
    for (const l of onPo) {
      if (l.rabUnitPrice !== null) {
        rabAtPoQty += Math.round(num(l.poQty) * num(l.rabUnitPrice))
        poPriced += num(l.poAmount)
      }
      receivedAtPo += Math.round(num(l.realizedQty) * num(l.poUnitPrice))
      actualVsPoTotal += actualVsPo(l) ?? 0
      if (num(l.realizedQty) + 1e-9 >= num(l.poQty)) fullyReceived += 1
      // Worst item against the RAB: actual cost when bought, else the PO.
      if (l.rabUnitPrice !== null) {
        const remaining = Math.max(num(l.poQty) - num(l.realizedQty), 0)
        const forecast =
          num(l.realizedAmount) + Math.round(remaining * num(l.poUnitPrice))
        const diff = forecast - Math.round(num(l.poQty) * num(l.rabUnitPrice))
        if (diff > 0 && (!biggest || diff > biggest.diff)) {
          biggest = { name: l.materialName, diff }
        }
      }
    }
    const poTotal = num(data?.poTotal ?? '0')
    const actual = num(data?.realizedSubtotal ?? '0')
    const charges = num(data?.realizedCharges ?? '0')
    const allIn = onPo.length > 0 && fullyReceived === onPo.length
    // Until everything is in, each charge category costs at least its PO estimate.
    const forecastCharges = allIn
      ? charges
      : PURCHASE_CHARGE_CATEGORIES.reduce(
          (sum, c) =>
            sum +
            Math.max(
              num(data?.realizedChargesByCategory[c] ?? '0'),
              num(data?.estimates[c] ?? '0'),
            ),
          0,
        )
    // Goods not received yet are assumed to cost the PO price.
    const forecast =
      actual + Math.max(poTotal - receivedAtPo, 0) + forecastCharges
    // This PO's share of the RAB's own charge budget, pro rata to its RAB goods.
    const rabGoods = num(data?.rab?.total ?? '0')
    const rabChargeShare =
      rabGoods > 0
        ? Math.round(
            (rabAtPoQty * num(data?.rab?.chargesTotal ?? '0')) / rabGoods,
          )
        : 0
    return {
      onPo,
      rabAtPoQty,
      poVsRabTotal: rabAtPoQty > 0 ? poPriced - rabAtPoQty : null,
      poTotal,
      actual,
      charges,
      receivedAtPo,
      actualVsPoTotal,
      forecast,
      forecastCharges,
      rabChargeShare,
      forecastVsRab:
        rabAtPoQty > 0 ? forecast - rabAtPoQty - rabChargeShare : null,
      fullyReceived,
      notOnRab: onPo.filter((l) => l.rabQty === null).length,
      overRab: onPo.filter((l) => overPrice(l) || overQty(l)).length,
      biggest,
    }
  }, [data])

  /** Where the difference comes from (the steps already show PO and received). */
  const why: Array<{ tone: 'warn' | 'good' | 'info'; text: string }> = []
  if (data) {
    const s = stats
    if (s.biggest) {
      why.push({
        tone: 'warn',
        text: `Biggest difference: ${s.biggest.name}, ${formatRupiahDiff(String(s.biggest.diff))} vs RAB.`,
      })
    }
    if (s.notOnRab > 0) {
      why.push({
        tone: 'warn',
        text: `${s.notOnRab} ${s.notOnRab === 1 ? 'item is' : 'items are'} not on the RAB, so they have no budget.`,
      })
    }
    if (s.charges > 0) {
      why.push({
        tone: 'warn',
        text: `${formatRupiah(String(s.charges))} in tax, delivery and fees on top of the goods.`,
      })
    }
  }
  const whyLines = why.slice(0, 3)
  const rabOnlyCount = (data?.lines.length ?? 0) - stats.onPo.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>Budget check</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
              {data ? (
                <>
                  <span className="font-medium tabular-nums text-(--ink)">
                    {data.orderNumber}
                  </span>
                  <span>· {data.vendorName} ·</span>
                  {data.rab ? (
                    <RabLink
                      purchaseRabId={data.rab.purchaseRabId}
                      projectId={data.rab.projectId}
                      label={data.rab.label}
                    />
                  ) : (
                    <span>No RAB</span>
                  )}
                  {data.projectNumber !== '—' ? (
                    <span>
                      · {data.projectNumber} · {data.projectName}
                    </span>
                  ) : null}
                </>
              ) : (
                <span>Budget, order and actual cost per item.</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !data ? (
          <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Loading…
          </p>
        ) : (
          <div className="min-w-0 space-y-5">
            <BudgetStory data={data} stats={stats} whyLines={whyLines} />

            <details className="group rounded-md border border-(--line) open:pb-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-3.5 shrink-0 text-(--muted) transition-transform group-open:rotate-90"
                  aria-hidden
                />
                Tax, delivery and other charges
              </summary>
              <div className="px-3">
                <ChargeCategoryTable
                  data={data}
                  rabShare={
                    num(data.rab?.total ?? '0') > 0
                      ? stats.rabAtPoQty / num(data.rab!.total)
                      : 0
                  }
                />
              </div>
            </details>

            <details className="group rounded-md border border-(--line) open:pb-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-3.5 shrink-0 text-(--muted) transition-transform group-open:rotate-90"
                  aria-hidden
                />
                <span className="flex flex-wrap items-center gap-2">
                  Per item
                  {stats.notOnRab > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      {stats.notOnRab} not on RAB
                    </Badge>
                  ) : null}
                  {stats.overRab > 0 ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-xs text-amber-700 dark:text-amber-300"
                    >
                      {stats.overRab} above RAB
                    </Badge>
                  ) : null}
                </span>
              </summary>
              <div className="space-y-3 px-3">
                {data.rab && rabOnlyCount > 0 ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={showAll}
                      onCheckedChange={(v) => setShowAll(v === true)}
                    />
                    Show all RAB items ({rabOnlyCount} not on this PO)
                  </label>
                ) : null}

                <div className="overflow-x-auto rounded-md border border-(--line)">
                  <table className="w-full min-w-[1040px] text-xs">
                    <thead className="text-xs text-(--muted)">
                      <tr className="border-b border-(--line)">
                        <th
                          rowSpan={2}
                          className="px-3 py-2 text-left font-medium"
                        >
                          Item
                        </th>
                        {['RAB', 'PO', 'Realized'].map((g) => (
                          <th
                            key={g}
                            colSpan={2}
                            className={cn(
                              groupClassName,
                              'px-3 py-1.5 text-center font-semibold text-(--ink)',
                            )}
                          >
                            {g}
                          </th>
                        ))}
                        <th
                          colSpan={2}
                          className={cn(
                            groupClassName,
                            'px-3 py-1.5 text-center font-semibold text-(--ink)',
                          )}
                        >
                          Difference
                        </th>
                      </tr>
                      <tr className="border-b border-(--line)">
                        {['RAB', 'PO', 'Realized'].map((g) => (
                          <SubHeads key={g} />
                        ))}
                        <th
                          className={cn(
                            groupClassName,
                            'px-3 py-1.5 text-right font-medium',
                          )}
                        >
                          PO vs RAB
                        </th>
                        <th className="px-3 py-1.5 text-right font-medium">
                          Actual vs PO
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--line)">
                      {lines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className={cn(
                              'px-3 py-6 text-center',
                              hintClassName,
                            )}
                          >
                            No items to compare.
                          </td>
                        </tr>
                      ) : (
                        lines.map((l) => {
                          const d1 = poVsRab(l)
                          const d2 = actualVsPo(l)
                          const received =
                            l.poQty !== null && num(l.poQty) > 0
                              ? num(l.realizedQty) / num(l.poQty)
                              : 0
                          return (
                            <tr
                              key={l.key}
                              className={cn(l.poQty === null && 'opacity-60')}
                            >
                              <td className="max-w-64 px-3 py-2">
                                <p className="truncate font-medium">
                                  {l.materialName}
                                </p>
                                <p className="flex items-center gap-1.5 truncate text-xs text-(--muted)">
                                  <span className="tabular-nums">
                                    {l.materialCode}
                                  </span>
                                  {l.rabQty === null ? (
                                    <Badge
                                      variant="destructive"
                                      className="px-1.5 py-0"
                                    >
                                      Not on RAB
                                    </Badge>
                                  ) : null}
                                </p>
                              </td>
                              {/* RAB */}
                              <QtyCell
                                first
                                qty={l.rabQty}
                                uom={l.uomSymbol}
                                sub={
                                  l.rabQty !== null &&
                                  num(l.otherOrderedQty) > 0
                                    ? `${l.otherOrderedQty} on other POs`
                                    : null
                                }
                              />
                              <AmountCell
                                amount={l.rabAmount}
                                unitPrice={l.rabUnitPrice}
                              />
                              {/* PO */}
                              <QtyCell
                                first
                                qty={l.poQty}
                                uom={l.uomSymbol}
                                warn={overQty(l)}
                                title={
                                  overQty(l)
                                    ? 'Ordered qty goes past the RAB qty'
                                    : undefined
                                }
                              />
                              <AmountCell
                                amount={l.poAmount}
                                unitPrice={l.poUnitPrice}
                                warnPrice={overPrice(l)}
                              />
                              {/* Realized */}
                              <QtyCell
                                first
                                qty={l.realizedQty}
                                uom={l.uomSymbol}
                                sub={
                                  l.poQty !== null
                                    ? `${Math.round(received * 100)}% in`
                                    : null
                                }
                                good={l.poQty !== null && received >= 1 - 1e-9}
                              />
                              <AmountCell
                                amount={
                                  l.realizedQty !== null &&
                                  num(l.realizedQty) > 0
                                    ? l.realizedAmount
                                    : null
                                }
                                unitPrice={l.realizedUnitPrice}
                                warnPrice={
                                  l.realizedUnitPrice !== null &&
                                  l.poUnitPrice !== null &&
                                  num(l.realizedUnitPrice) > num(l.poUnitPrice)
                                }
                              />
                              <td
                                className={cn(
                                  groupClassName,
                                  'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                                  diffClass(d1),
                                )}
                              >
                                {rupiahDiff(d1)}
                              </td>
                              <td
                                className={cn(
                                  'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                                  diffClass(d2),
                                )}
                              >
                                {rupiahDiff(d2)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                    {stats.onPo.length > 0 ? (
                      <tfoot className="border-t border-(--line) font-medium">
                        <tr>
                          <td className="px-3 py-2">PO items</td>
                          <td className={groupClassName} />
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {stats.rabAtPoQty > 0
                              ? formatRupiah(String(stats.rabAtPoQty))
                              : '—'}
                            <span className="block text-xs font-normal text-(--muted)">
                              at PO qty
                            </span>
                          </td>
                          <td className={groupClassName} />
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {formatRupiah(data.poTotal)}
                          </td>
                          <td className={groupClassName} />
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {formatRupiah(data.realizedSubtotal)}
                            {stats.charges > 0 ? (
                              <span className="block text-xs font-normal text-(--muted)">
                                +{formatRupiah(data.realizedCharges)} charges
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={cn(
                              groupClassName,
                              'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                              diffClass(stats.poVsRabTotal),
                            )}
                          >
                            {rupiahDiff(stats.poVsRabTotal)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                              diffClass(
                                data.realizationCount > 0
                                  ? stats.actualVsPoTotal
                                  : null,
                              ),
                            )}
                          >
                            {data.realizationCount > 0
                              ? rupiahDiff(stats.actualVsPoTotal)
                              : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    ) : null}
                  </table>
                </div>
                <p className={cn('text-xs', hintClassName)}>
                  Differences compare the same qty at each price. Realized
                  counts posted receipts and notas only; expected final cost
                  assumes the rest comes in at the PO price.
                </p>
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** One step of the money story: what it is, the amount, and how it compares. */
function StoryStep({
  label,
  hint,
  amount,
  note,
  tone = 'muted',
}: {
  label: string
  hint: string
  amount: string
  note?: string | null
  tone?: 'muted' | 'warn' | 'good'
}) {
  return (
    <div className="min-w-0 flex-1 rounded-md border border-(--line) bg-(--background) px-3 py-2.5">
      <p className="text-xs font-medium">{label}</p>
      <p className={cn('text-xs', hintClassName)}>{hint}</p>
      <p className="mt-1.5 text-base font-semibold tabular-nums">{amount}</p>
      {note ? (
        <p
          className={cn(
            'text-xs tabular-nums',
            tone === 'warn'
              ? warnClassName
              : tone === 'good'
                ? goodClassName
                : hintClassName,
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  )
}

function pctOf(part: number, whole: number): string {
  if (whole <= 0) return ''
  const p = (Math.abs(part) / whole) * 100
  return `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`
}

/**
 * The summary as a short story: a one-sentence verdict, then budget →
 * ordered → received, then where the difference comes from.
 */
function BudgetStory({
  data,
  stats,
  whyLines,
}: {
  data: PurchaseOrderRabCompare
  stats: {
    rabAtPoQty: number
    rabChargeShare: number
    poTotal: number
    actual: number
    charges: number
    actualVsPoTotal: number
    forecast: number
    forecastVsRab: number | null
    fullyReceived: number
    onPo: PurchaseOrderRabCompareLine[]
  }
  whyLines: Array<{ tone: 'warn' | 'good' | 'info'; text: string }>
}) {
  const budget =
    stats.rabAtPoQty > 0 ? stats.rabAtPoQty + stats.rabChargeShare : null
  const poVsBudget = budget !== null ? stats.poTotal - budget : null
  const inSoFar = stats.actual + stats.charges
  const received = data.realizationCount > 0
  const allIn =
    stats.onPo.length > 0 && stats.fullyReceived === stats.onPo.length
  const final = stats.forecastVsRab

  const headline =
    final === null
      ? { tone: 'info' as const, text: 'No RAB to compare this PO with' }
      : final > 0
        ? {
            tone: 'warn' as const,
            text: `${allIn ? 'Cost' : 'Will cost'} ${formatRupiah(String(final))} more than budgeted (+${pctOf(final, budget ?? 0)})`,
          }
        : final < 0
          ? {
              tone: 'good' as const,
              text: `${allIn ? 'Cost' : 'Will cost'} ${formatRupiah(String(-final))} less than budgeted`,
            }
          : { tone: 'good' as const, text: 'Exactly on budget' }

  return (
    <div className="space-y-3 rounded-md border border-(--line) bg-(--surface) px-3.5 py-3">
      <p
        className={cn(
          'flex items-center gap-2 text-sm font-semibold',
          headline.tone === 'warn'
            ? warnClassName
            : headline.tone === 'good'
              ? goodClassName
              : 'text-(--ink)',
        )}
      >
        {headline.tone === 'warn' ? (
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
        ) : headline.tone === 'good' ? (
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        ) : (
          <Info className="size-4 shrink-0 text-(--muted)" aria-hidden />
        )}
        {headline.text}
      </p>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <StoryStep
          label="1. Budget"
          hint="RAB price for these items"
          amount={budget !== null ? formatRupiah(String(budget)) : '—'}
          note={
            stats.rabChargeShare > 0
              ? `incl. ${formatRupiah(String(stats.rabChargeShare))} charges`
              : null
          }
        />
        <ChevronRight
          className="mx-auto size-4 shrink-0 rotate-90 text-(--muted) sm:rotate-0"
          aria-hidden
        />
        <StoryStep
          label="2. Ordered"
          hint="This PO"
          amount={formatRupiah(String(stats.poTotal))}
          note={
            poVsBudget === null || poVsBudget === 0
              ? poVsBudget === 0
                ? 'Same as budget'
                : null
              : `${poVsBudget > 0 ? '+' : '−'}${formatRupiah(String(Math.abs(poVsBudget)))} vs budget`
          }
          tone={
            poVsBudget === null || poVsBudget === 0
              ? 'muted'
              : poVsBudget > 0
                ? 'warn'
                : 'good'
          }
        />
        <ChevronRight
          className="mx-auto size-4 shrink-0 rotate-90 text-(--muted) sm:rotate-0"
          aria-hidden
        />
        <StoryStep
          label="3. Received"
          hint={
            received
              ? `${stats.fullyReceived} of ${stats.onPo.length} items fully in`
              : 'What actually arrived'
          }
          amount={received ? formatRupiah(String(inSoFar)) : 'Nothing yet'}
          note={
            !received
              ? 'Assumed at PO price until it arrives'
              : stats.actualVsPoTotal !== 0
                ? `${stats.actualVsPoTotal > 0 ? '+' : '−'}${formatRupiah(String(Math.abs(stats.actualVsPoTotal)))} vs PO price`
                : 'At PO price'
          }
          tone={
            received && stats.actualVsPoTotal > 0
              ? 'warn'
              : received && stats.actualVsPoTotal < 0
                ? 'good'
                : 'muted'
          }
        />
      </div>

      {received && !allIn ? (
        <p className={cn('text-xs tabular-nums', hintClassName)}>
          Expected final cost {formatRupiah(String(stats.forecast))}, if the
          rest arrives at the PO price.
        </p>
      ) : null}

      {whyLines.length > 0 ? (
        <ul className="space-y-1 border-t border-(--line) pt-2.5">
          {whyLines.map((w) => (
            <li key={w.text} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  w.tone === 'warn'
                    ? 'bg-amber-500'
                    : w.tone === 'good'
                      ? 'bg-emerald-500'
                      : 'bg-(--muted)',
                )}
                aria-hidden
              />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SubHeads() {
  return (
    <>
      <th className={cn(groupClassName, 'px-3 py-1.5 text-right font-medium')}>
        Qty
      </th>
      <th className="px-3 py-1.5 text-right font-medium">Amount</th>
    </>
  )
}

function QtyCell({
  qty,
  uom,
  sub,
  first,
  warn,
  good,
  title,
}: {
  qty: string | null
  uom: string
  sub?: string | null
  first?: boolean
  warn?: boolean
  good?: boolean
  title?: string
}) {
  return (
    <td
      title={title}
      className={cn(
        first && groupClassName,
        'px-3 py-2 text-right tabular-nums whitespace-nowrap',
        warn && warnClassName,
      )}
    >
      {qty !== null ? `${qty} ${uom}` : '—'}
      {sub ? (
        <span
          className={cn(
            'block text-xs',
            good ? goodClassName : 'text-(--muted)',
          )}
        >
          {sub}
        </span>
      ) : null}
    </td>
  )
}

function AmountCell({
  amount,
  unitPrice,
  warnPrice,
}: {
  amount: string | null
  unitPrice: string | null
  warnPrice?: boolean
}) {
  return (
    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
      {formatRupiah(amount)}
      {unitPrice !== null ? (
        <span
          className={cn(
            'block text-xs',
            warnPrice ? warnClassName : 'text-(--muted)',
          )}
        >
          @ {formatRupiah(unitPrice)}
        </span>
      ) : null}
    </td>
  )
}

/**
 * Tax / delivery / others: the RAB's budget (this PO's share of it), the PO
 * estimate and posted realization charges. `rabShare` = this PO's RAB goods ÷
 * the whole RAB's goods.
 */
function ChargeCategoryTable({
  data,
  rabShare,
}: {
  data: PurchaseOrderRabCompare
  rabShare: number
}) {
  type DiffKind = 'vsBudget' | 'notRealized' | 'none'
  const rows = PURCHASE_CHARGE_CATEGORIES.map((c) => {
    const estimate = data.estimates[c]
    const actual = num(data.realizedChargesByCategory[c])
    const budget = Math.round(
      num(data.rab?.chargesByCategory[c] ?? '0') * rabShare,
    )
    let diff: number | null = null
    let diffKind: DiffKind = 'none'
    if (budget > 0) {
      diff = actual - budget
      diffKind = 'vsBudget'
    } else if (estimate !== null && actual === 0) {
      diffKind = 'notRealized'
    } else if (estimate !== null) {
      diff = actual - num(estimate)
      diffKind = 'vsBudget'
    }
    return {
      category: c,
      budget,
      estimate,
      actual,
      diff,
      diffKind,
    }
  }).filter((r) => r.budget > 0 || r.estimate !== null || r.actual > 0)
  if (rows.length === 0) {
    return (
      <p className={cn('py-2 text-sm', hintClassName)}>
        No additional costs on this PO.
      </p>
    )
  }
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0)
  const totalEstimate = rows.reduce((s, r) => s + num(r.estimate), 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)
  const totalDiff =
    totalBudget > 0
      ? totalActual - totalBudget
      : totalEstimate > 0 && totalActual > 0
        ? totalActual - totalEstimate
        : null
  return (
    <div className="overflow-x-auto rounded-md border border-(--line)">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="text-left text-xs text-(--muted)">
          <tr className="border-b border-(--line)">
            <th className="px-3 py-2 font-medium">Additional costs</th>
            <th
              className="px-3 py-2 text-right font-medium"
              title="The RAB's own additional costs, pro rata to this PO's items"
            >
              RAB budget
            </th>
            <th className="px-3 py-2 text-right font-medium">PO estimate</th>
            <th className="px-3 py-2 text-right font-medium">Realized</th>
            <th
              className="px-3 py-2 text-right font-medium"
              title="Realized vs RAB budget when set; otherwise vs PO estimate"
            >
              Diff
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} className="border-b border-(--line)">
              <td className="px-3 py-1.5">
                {PURCHASE_CHARGE_CATEGORY_LABELS[r.category]}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.budget > 0 ? formatRupiah(String(r.budget)) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.estimate !== null ? formatRupiah(r.estimate) : '—'}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.actual > 0 ? formatRupiah(String(r.actual)) : '—'}
              </td>
              <td
                className={cn(
                  'px-3 py-1.5 text-right tabular-nums',
                  r.diffKind === 'notRealized'
                    ? hintClassName
                    : diffClass(r.diff),
                )}
              >
                {r.diffKind === 'notRealized'
                  ? 'not realized'
                  : rupiahDiff(r.diff)}
              </td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="px-3 py-1.5">Total</td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {totalBudget > 0 ? formatRupiah(String(totalBudget)) : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {totalEstimate > 0 ? formatRupiah(String(totalEstimate)) : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {totalActual > 0 ? formatRupiah(String(totalActual)) : '—'}
            </td>
            <td
              className={cn(
                'px-3 py-1.5 text-right tabular-nums',
                diffClass(totalDiff),
              )}
            >
              {rupiahDiff(totalDiff)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
