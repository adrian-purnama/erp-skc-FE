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
        <RabCompareDialog orderId={orderId} open={open} onOpenChange={setOpen} />
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
    const forecast = actual + Math.max(poTotal - receivedAtPo, 0) + forecastCharges
    // This PO's share of the RAB's own charge budget, pro rata to its RAB goods.
    const rabGoods = num(data?.rab?.total ?? '0')
    const rabChargeShare =
      rabGoods > 0 ? Math.round((rabAtPoQty * num(data?.rab?.chargesTotal ?? '0')) / rabGoods) : 0
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
      forecastVsRab: rabAtPoQty > 0 ? forecast - rabAtPoQty - rabChargeShare : null,
      fullyReceived,
      notOnRab: onPo.filter((l) => l.rabQty === null).length,
      overRab: onPo.filter((l) => overPrice(l) || overQty(l)).length,
      biggest,
    }
  }, [data])

  /** Short “why” lines — drivers of the verdict, not a repeat of the headline. */
  const why: Array<{ tone: 'warn' | 'good' | 'info'; text: string }> = []
  if (data) {
    const s = stats
    if (s.poVsRabTotal !== null && s.poVsRabTotal !== 0) {
      why.push({
        tone: s.poVsRabTotal > 0 ? 'warn' : 'good',
        text: `Goods on the PO are ${formatRupiah(String(Math.abs(s.poVsRabTotal)))} ${s.poVsRabTotal > 0 ? 'above' : 'below'} RAB price for the same qty.`,
      })
    }
    if (data.realizationCount > 0 && s.actualVsPoTotal !== 0) {
      why.push({
        tone: s.actualVsPoTotal > 0 ? 'warn' : 'good',
        text: `What arrived cost ${formatRupiah(String(Math.abs(s.actualVsPoTotal)))} ${s.actualVsPoTotal > 0 ? 'more' : 'less'} than the PO price.`,
      })
    }
    if (s.charges > 0) {
      why.push({
        tone: 'warn',
        text: `${formatRupiah(String(s.charges))} in charges (tax, delivery, fees) on top of the goods.`,
      })
    }
    if (s.biggest) {
      why.push({
        tone: 'warn',
        text: `Biggest overrun: ${s.biggest.name} (${formatRupiahDiff(String(s.biggest.diff))} vs RAB).`,
      })
    }
    if (s.notOnRab > 0) {
      why.push({
        tone: 'warn',
        text: `${s.notOnRab} ${s.notOnRab === 1 ? 'item is' : 'items are'} not on the RAB.`,
      })
    } else if (data.realizationCount === 0 && why.length < 3) {
      why.push({
        tone: 'info',
        text: 'Nothing received yet — expected final uses PO prices for the rest.',
      })
    }
  }
  const whyLines = why.slice(0, 3)
  const rabOnlyCount = (data?.lines.length ?? 0) - stats.onPo.length
  const verdict =
    stats.forecastVsRab === null
      ? { tone: 'info' as const, label: 'No RAB to compare' }
      : stats.forecastVsRab > 0
        ? { tone: 'warn' as const, label: 'Over budget' }
        : stats.forecastVsRab < 0
          ? { tone: 'good' as const, label: 'Under budget' }
          : { tone: 'good' as const, label: 'On budget' }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>RAB · PO · Realization</DialogTitle>
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
            <div className="rounded-md border border-(--line) bg-(--surface) px-3.5 py-3">
              <div className="flex gap-2.5">
                {verdict.tone === 'warn' ? (
                  <AlertTriangle
                    className={cn('mt-0.5 size-4 shrink-0', warnClassName)}
                    aria-hidden
                  />
                ) : verdict.tone === 'good' ? (
                  <CheckCircle2
                    className={cn('mt-0.5 size-4 shrink-0', goodClassName)}
                    aria-hidden
                  />
                ) : (
                  <Info
                    className="mt-0.5 size-4 shrink-0 text-(--muted)"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        verdict.tone === 'warn'
                          ? warnClassName
                          : verdict.tone === 'good'
                            ? goodClassName
                            : 'text-(--ink)',
                      )}
                    >
                      {verdict.label}
                      {stats.forecastVsRab !== null ? (
                        <span className="font-normal tabular-nums">
                          {' · '}
                          {rupiahDiff(stats.forecastVsRab)} vs RAB
                        </span>
                      ) : null}
                    </p>
                    <p className={cn('mt-0.5 text-xs tabular-nums', hintClassName)}>
                      Expected final {formatRupiah(String(stats.forecast))}
                    </p>
                  </div>
                  <CostCompareStrip
                    rab={
                      stats.rabAtPoQty > 0
                        ? stats.rabAtPoQty + stats.rabChargeShare
                        : null
                    }
                    po={stats.poTotal}
                    inSoFar={stats.actual + stats.charges}
                    expected={stats.forecast}
                  />
                  {whyLines.length > 0 ? (
                    <div
                      className={cn(
                        'space-y-0.5 border-t border-(--line)/60 pt-2 text-xs leading-relaxed',
                        hintClassName,
                      )}
                    >
                      {whyLines.map((i) => (
                        <p key={i.text}>{i.text}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <details className="group rounded-md border border-(--line) open:pb-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  className="size-3.5 shrink-0 text-(--muted) transition-transform group-open:rotate-90"
                  aria-hidden
                />
                Charge categories
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
                  Line details
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
                    <th rowSpan={2} className="px-3 py-2 text-left font-medium">
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
                    <th className={cn(groupClassName, 'px-3 py-1.5 text-right font-medium')}>
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
                      <td colSpan={9} className={cn('px-3 py-6 text-center', hintClassName)}>
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
                        <tr key={l.key} className={cn(l.poQty === null && 'opacity-60')}>
                          <td className="max-w-64 px-3 py-2">
                            <p className="truncate font-medium">{l.materialName}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-(--muted)">
                              <span className="tabular-nums">{l.materialCode}</span>
                              {l.rabQty === null ? (
                                <Badge variant="destructive" className="px-1.5 py-0">
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
                              l.rabQty !== null && num(l.otherOrderedQty) > 0
                                ? `${l.otherOrderedQty} on other POs`
                                : null
                            }
                          />
                          <AmountCell amount={l.rabAmount} unitPrice={l.rabUnitPrice} />
                          {/* PO */}
                          <QtyCell
                            first
                            qty={l.poQty}
                            uom={l.uomSymbol}
                            warn={overQty(l)}
                            title={overQty(l) ? 'Ordered qty goes past the RAB qty' : undefined}
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
                            sub={l.poQty !== null ? `${Math.round(received * 100)}% in` : null}
                            good={l.poQty !== null && received >= 1 - 1e-9}
                          />
                          <AmountCell
                            amount={l.realizedQty !== null && num(l.realizedQty) > 0 ? l.realizedAmount : null}
                            unitPrice={l.realizedUnitPrice}
                            warnPrice={
                              l.realizedUnitPrice !== null &&
                              l.poUnitPrice !== null &&
                              num(l.realizedUnitPrice) > num(l.poUnitPrice)
                            }
                          />
                          <td className={cn(groupClassName, 'px-3 py-2 text-right tabular-nums whitespace-nowrap', diffClass(d1))}>
                            {rupiahDiff(d1)}
                          </td>
                          <td className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', diffClass(d2))}>
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
                        {stats.rabAtPoQty > 0 ? formatRupiah(String(stats.rabAtPoQty)) : '—'}
                        <span className="block text-xs font-normal text-(--muted)">at PO qty</span>
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
                      <td className={cn(groupClassName, 'px-3 py-2 text-right tabular-nums whitespace-nowrap', diffClass(stats.poVsRabTotal))}>
                        {rupiahDiff(stats.poVsRabTotal)}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', diffClass(data.realizationCount > 0 ? stats.actualVsPoTotal : null))}>
                        {data.realizationCount > 0 ? rupiahDiff(stats.actualVsPoTotal) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
            <p className={cn('text-xs', hintClassName)}>
              Differences compare the same qty at each price. Realized counts
              posted receipts and notas only; expected final cost assumes the
              rest comes in at the PO price.
            </p>
              </div>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Numbers + neutral bars; only the Expected overshoot/undershoot is tinted. */
function CostCompareStrip({
  rab,
  po,
  inSoFar,
  expected,
}: {
  rab: number | null
  po: number
  inSoFar: number
  expected: number
}) {
  const rows: Array<{ label: string; value: number | null }> = [
    { label: 'RAB', value: rab },
    { label: 'PO', value: po },
    { label: 'In so far', value: inSoFar },
    { label: 'Expected', value: expected },
  ]
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1)
  const rabPct = rab !== null && rab > 0 ? Math.min((rab / max) * 100, 100) : null
  const expectedOver = rab !== null && expected > rab
  const expectedUnder = rab !== null && expected < rab

  return (
    <div className="space-y-2.5 border-t border-(--line)/60 pt-2.5">
      <dl
        className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs"
        aria-label="Cost comparison"
      >
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dt className={hintClassName}>{r.label}</dt>
            <dd className="font-medium tabular-nums text-(--ink)">
              {r.value === null ? '—' : formatRupiah(String(r.value))}
            </dd>
          </div>
        ))}
      </dl>
      <div
        className="space-y-1.5"
        role="img"
        aria-label="Cost comparison chart"
      >
        {rows.map((r) => {
          const pct =
            r.value === null || r.value <= 0
              ? 0
              : Math.max((r.value / max) * 100, 1.5)
          const isExpected = r.label === 'Expected'
          return (
            <div
              key={r.label}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2"
            >
              <span className={cn('truncate text-xs', hintClassName)}>
                {r.label}
              </span>
              <div className="relative h-2 overflow-hidden rounded-sm bg-(--line)/70">
                {rabPct !== null && r.label !== 'RAB' ? (
                  <span
                    className="absolute inset-y-0 z-1 w-px bg-(--muted)"
                    style={{ left: `${rabPct}%` }}
                    aria-hidden
                  />
                ) : null}
                {isExpected && expectedOver && rabPct !== null ? (
                  <>
                    <div
                      className="absolute inset-y-0 left-0 rounded-l-sm bg-(--ink)/50"
                      style={{ width: `${rabPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 rounded-r-sm bg-amber-500/80"
                      style={{
                        left: `${rabPct}%`,
                        width: `${Math.max(pct - rabPct, 0)}%`,
                      }}
                    />
                  </>
                ) : (
                  <div
                    className={cn(
                      'h-full rounded-sm',
                      isExpected && expectedUnder
                        ? 'bg-emerald-600/75'
                        : r.label === 'RAB'
                          ? 'bg-(--muted)/40'
                          : 'bg-(--ink)/50',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SubHeads() {
  return (
    <>
      <th className={cn(groupClassName, 'px-3 py-1.5 text-right font-medium')}>Qty</th>
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
        <span className={cn('block text-xs', good ? goodClassName : 'text-(--muted)')}>
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
        <span className={cn('block text-xs', warnPrice ? warnClassName : 'text-(--muted)')}>
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
  }).filter(
    (r) => r.budget > 0 || r.estimate !== null || r.actual > 0,
  )
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
