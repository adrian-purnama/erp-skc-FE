import { useState } from 'react'
import {
  Banknote,
  ChevronDown,
  CircleCheck,
  ChevronRight,
  Hash,
  Package,
  Store,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  FLAG_LABELS,
  FLAG_TITLES,
} from '#/components/forms/purchasing/PurchaseRequestBadges'
import type { LineFlag } from '#/components/forms/purchasing/PurchaseRequestBadges'
import ListTable, { ListChip } from '#/components/forms/shared/ListTable'
import type { ListTableColumn } from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { RupiahInput } from '#/components/ui/rupiah-input'
import { formatRupiah, parseQty } from '#/lib/purchasing'
import type { OpenRequestLine, PurchasingOption } from '#/lib/purchasing'
import { hintClassName, inputClassNameCompact } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** One PO line being edited; `ref` describes its SPP line. */
export type PoLineRow = {
  ref: Omit<OpenRequestLine, 'orderedQty' | 'remainingQty'>
  /** What the SPP line still needed when the row was added. */
  leftQty: string
  vendorId: string
  qty: string
  unitPrice: string
  orderNote: string
}

/** qty × price in whole rupiah (display only; the server is the source). */
export function amountOf(qty: string, price: string): number {
  const q = parseQty(qty)
  const p = Number(price)
  if (q === null || !Number.isFinite(p)) return 0
  return Math.round(q * p)
}

/** That vendor's last price, else the lowest of any vendor, else the RAB price. */
export function suggestedPrice(
  ref: Pick<OpenRequestLine, 'priceHistory' | 'rabUnitPrice'>,
  vendorId: string,
): string {
  const own = ref.priceHistory.find((p) => p.vendorId === vendorId)
  if (own) return own.lastPrice
  return ref.priceHistory.at(0)?.lastPrice ?? ref.rabUnitPrice ?? ''
}

/** A new row starts on the cheapest vendor that supplied it before. */
export function rowFromOpen(line: OpenRequestLine): PoLineRow {
  const { orderedQty: _o, remainingQty, ...ref } = line
  const vendorId = line.priceHistory.at(0)?.vendorId ?? ''
  return {
    ref,
    leftQty: remainingQty,
    vendorId,
    qty: remainingQty,
    unitPrice: suggestedPrice(line, vendorId),
    orderNote: '',
  }
}

function rowFlags(r: PoLineRow): LineFlag[] {
  const q = parseQty(r.qty)
  const flags: LineFlag[] = []
  if (r.ref.source === 'extra') flags.push('extra')
  if (!r.ref.inRab) flags.push('notInRab')
  if (q !== null && q > Number(r.leftQty) + 1e-9) flags.push('overRequest')
  if (
    r.ref.rabUnitPrice !== null &&
    Number(r.unitPrice) > Number(r.ref.rabUnitPrice)
  ) {
    flags.push('overBudget')
  }
  if (
    r.ref.rabQty !== null &&
    q !== null &&
    Number(r.ref.rabOrderedQty) + q > Number(r.ref.rabQty) + 1e-9
  ) {
    flags.push('overRabQty')
  }
  return flags
}

type Props = {
  rows: PoLineRow[]
  editable: boolean
  busy: boolean
  /** Per SPP line id, what still has to be fixed. */
  issues: Map<string, string>
  vendors: PurchasingOption[]
  /** Vendor column; off when the whole PO has one vendor in the header. */
  showVendor: boolean
  /** Qty already received, for approved POs. */
  arrivedQty?: (requestLineId: string) => string | null
  onChange: (requestLineId: string, patch: Partial<PoLineRow>) => void
  onRemove: (requestLineId: string) => void
}

/** PO lines as a compact table; a row opens to show budget, flags and prices. */
export default function PurchaseOrderLines({
  rows,
  editable,
  busy,
  issues,
  vendors,
  showVendor,
  arrivedQty,
  onChange,
  onRemove,
}: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const vendorName = (id: string) =>
    vendors.find((v) => v.id === id)?.label ?? ''

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const columns: ListTableColumn<PoLineRow>[] = [
    {
      header: '',
      widthClassName: 'w-8',
      cellClassName: 'px-1.5',
      cell: (r) =>
        open.has(r.ref.requestLineId) ? (
          <ChevronDown className="size-4 text-(--muted)" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-(--muted)" aria-hidden />
        ),
    },
    {
      header: 'Material',
      icon: Package,
      cell: (r) => {
        const flags = rowFlags(r)
        const issue = issues.get(r.ref.requestLineId)
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 font-mono text-xs text-(--muted)">
              {r.ref.materialCode}
            </span>
            <span className="min-w-0 truncate">{r.ref.materialName}</span>
            {issue ? (
              <span className="shrink-0 text-xs text-red-600">{issue}</span>
            ) : flags.length > 0 ? (
              <ListChip tone="warning" className="shrink-0">
                {flags.length === 1
                  ? FLAG_LABELS[flags[0]]
                  : `${flags.length} flags`}
              </ListChip>
            ) : null}
          </div>
        )
      },
    },
    ...(showVendor
      ? [
          {
            header: 'Vendor',
            icon: Store,
            widthClassName: 'w-52',
            cell: (r: PoLineRow) =>
              r.vendorId ? (
                <span className="block truncate">{vendorName(r.vendorId)}</span>
              ) : (
                <span className="text-red-600">Choose vendor</span>
              ),
          } satisfies ListTableColumn<PoLineRow>,
        ]
      : []),
    {
      header: 'Qty',
      icon: Hash,
      align: 'right',
      widthClassName: 'w-28',
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.qty || '—'} {r.ref.uomSymbol}
        </span>
      ),
    },
    {
      header: 'Unit price',
      align: 'right',
      widthClassName: 'w-36',
      cell: (r) => (r.unitPrice ? formatRupiah(r.unitPrice) : '—'),
    },
    {
      header: 'Amount',
      icon: Banknote,
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'font-medium',
      cell: (r) => formatRupiah(String(amountOf(r.qty, r.unitPrice))),
    },
    ...(editable
      ? [
          {
            header: '',
            widthClassName: 'w-10',
            cellClassName: 'px-1',
            cell: (r: PoLineRow) => (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${r.ref.materialName}`}
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(r.ref.requestLineId)
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ),
          } satisfies ListTableColumn<PoLineRow>,
        ]
      : []),
  ]

  return (
    <ListTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.ref.requestLineId}
      empty="No items yet. Pick them from the list below."
      minWidthClassName={showVendor ? 'min-w-[820px]' : 'min-w-[640px]'}
      onRowClick={(r) => toggle(r.ref.requestLineId)}
      renderExpanded={(r) =>
        open.has(r.ref.requestLineId) ? (
          <LineDetails
            row={r}
            editable={editable}
            busy={busy}
            vendors={vendors}
            arrived={arrivedQty?.(r.ref.requestLineId) ?? null}
            onChange={(patch) => onChange(r.ref.requestLineId, patch)}
          />
        ) : null
      }
    />
  )
}

type Check = { ok: boolean; text: string; detail?: string }

function fmtQty(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(n)
}

/** Plain-language budget verdicts for one line (qty and price vs the RAB). */
function budgetChecks(r: PoLineRow, q: number): Check[] {
  const uom = r.ref.uomSymbol
  if (!r.ref.inRab || r.ref.rabQty === null) {
    return [
      {
        ok: false,
        text: `Not on ${r.ref.rabLabel ?? 'the RAB'}`,
        detail: 'Say why in the note.',
      },
    ]
  }
  const rabQty = Number(r.ref.rabQty)
  const after = Number(r.ref.rabOrderedQty) + q
  const left = rabQty - after
  const checks: Check[] = [
    left >= -1e-9
      ? {
          ok: true,
          text: `Within RAB qty`,
          detail: `${fmtQty(left)} ${uom} of ${fmtQty(rabQty)} left after this PO`,
        }
      : {
          ok: false,
          text: `Over RAB qty by ${fmtQty(-left)} ${uom}`,
          detail: `RAB ${fmtQty(rabQty)} ${uom}, ordered ${fmtQty(after)} ${uom} with this PO`,
        },
  ]
  if (r.ref.rabUnitPrice !== null && Number(r.unitPrice) > 0) {
    const rab = Number(r.ref.rabUnitPrice)
    const price = Number(r.unitPrice)
    checks.push(
      price <= rab
        ? {
            ok: true,
            text: 'Within RAB price',
            detail: `RAB ${formatRupiah(r.ref.rabUnitPrice)}`,
          }
        : {
            ok: false,
            text: `Price ${Math.round(((price - rab) / rab) * 100)}% over RAB`,
            detail: `RAB ${formatRupiah(r.ref.rabUnitPrice)}`,
          },
    )
  }
  return checks
}

function CheckLine({ check }: { check: Check }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {check.ok ? (
        <CircleCheck
          className="mt-0.5 size-4 shrink-0 text-emerald-600"
          aria-hidden
        />
      ) : (
        <TriangleAlert
          className="mt-0.5 size-4 shrink-0 text-amber-600"
          aria-hidden
        />
      )}
      <span className="min-w-0">
        <span className={cn(!check.ok && 'text-amber-800 dark:text-amber-300')}>
          {check.text}
        </span>
        {check.detail ? (
          <span className={cn('block text-xs', hintClassName)}>
            {check.detail}
          </span>
        ) : null}
      </span>
    </li>
  )
}

/** One line opened: what to order on the left, budget and price checks on the right. */
function LineDetails({
  row: r,
  editable,
  busy,
  vendors,
  arrived,
  onChange,
}: {
  row: PoLineRow
  editable: boolean
  busy: boolean
  vendors: PurchasingOption[]
  arrived: string | null
  onChange: (patch: Partial<PoLineRow>) => void
}) {
  const [allPrices, setAllPrices] = useState(false)
  const flags = rowFlags(r)
  const q = parseQty(r.qty) ?? 0
  const uom = r.ref.uomSymbol
  const checks = budgetChecks(r, q)
  const history = r.ref.priceHistory
  const best = history.at(0) ?? null
  const shownPrices = allPrices ? history : history.slice(0, 1)
  const context = [r.ref.productionOrderNumber, r.ref.itemLabel]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="grid cursor-default gap-x-10 gap-y-5 px-4 py-4 pl-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
      onClick={(e) => e.stopPropagation()}
    >
      {editable ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className={cn('text-xs', hintClassName)}>Vendor</span>
            <Combobox
              value={r.vendorId}
              onValueChange={(vendorId) =>
                onChange({
                  vendorId,
                  unitPrice: suggestedPrice(r.ref, vendorId) || r.unitPrice,
                })
              }
              options={vendors.map((v) => ({ value: v.id, label: v.label }))}
              placeholder="Choose a vendor"
              emptyText="No active vendor. Add one in Vendor Master Data."
              aria-label={`Vendor of ${r.ref.materialName}`}
              disabled={busy}
              className={cn(
                'w-full sm:w-full',
                !r.vendorId && 'border-red-500',
              )}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className={cn('text-xs', hintClassName)}>Qty ({uom})</span>
              <input
                inputMode="decimal"
                value={r.qty}
                disabled={busy}
                onChange={(e) => onChange({ qty: e.target.value })}
                className={cn(
                  inputClassNameCompact,
                  'w-full text-right tabular-nums',
                  parseQty(r.qty) === null && 'border-red-500',
                )}
              />
              <span className={cn('block text-xs', hintClassName)}>
                SPP still needs {r.leftQty}
              </span>
            </label>
            <label className="space-y-1">
              <span className={cn('text-xs', hintClassName)}>Unit price</span>
              <RupiahInput
                value={r.unitPrice}
                onValueChange={(digits) => onChange({ unitPrice: digits })}
                disabled={busy}
                className={cn(
                  'h-8 text-right',
                  !(Number(r.unitPrice) > 0) && 'border-red-500',
                )}
              />
            </label>
          </div>
          <input
            value={r.orderNote}
            disabled={busy}
            placeholder={
              flags.length > 0 ? 'Why, e.g. price went up' : 'Note (optional)'
            }
            aria-label={`Note for ${r.ref.materialName}`}
            onChange={(e) => onChange({ orderNote: e.target.value })}
            className={cn(inputClassNameCompact, 'w-full')}
          />
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm">
          <li>
            <span className={hintClassName}>Requested </span>
            {r.ref.requestedQty} {uom}
          </li>
          {arrived !== null ? (
            <li>
              <span className={hintClassName}>Arrived </span>
              {arrived} {uom}
            </li>
          ) : null}
          {r.orderNote ? <li>“{r.orderNote}”</li> : null}
        </ul>
      )}

      <div className="space-y-4">
        <ul className="space-y-2">
          {checks.map((c) => (
            <CheckLine key={c.text} check={c} />
          ))}
          {flags.includes('overRequest') ? (
            <CheckLine
              check={{
                ok: false,
                text: 'More than the SPP asked for',
                detail: `SPP still needs ${r.leftQty} ${uom}`,
              }}
            />
          ) : null}
          {flags.includes('extra') ? (
            <CheckLine check={{ ok: false, text: FLAG_TITLES.extra }} />
          ) : null}
        </ul>

        {best ? (
          <div className="space-y-1.5">
            <p className={cn('text-xs', hintClassName)}>
              {allPrices ? 'Past prices' : 'Best past price'}
            </p>
            <ul className="space-y-1">
              {shownPrices.map((h) => {
                const inUse =
                  h.vendorId === r.vendorId && h.lastPrice === r.unitPrice
                return (
                  <li
                    key={h.vendorId}
                    className="flex items-center gap-2 text-sm"
                    title={`${h.lastOrderNumber}${h.orderCount > 1 ? ` · ${h.orderCount} POs` : ''}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {h.vendorName}
                    </span>
                    <span className="tabular-nums">
                      {formatRupiah(h.lastPrice)}
                    </span>
                    {editable ? (
                      inUse ? (
                        <span className="w-12 text-right text-xs text-emerald-700">
                          In use
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 w-12 px-2 text-xs"
                          disabled={busy}
                          onClick={() =>
                            onChange({
                              vendorId: h.vendorId,
                              unitPrice: h.lastPrice,
                            })
                          }
                        >
                          Use
                        </Button>
                      )
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {history.length > 1 ? (
              <button
                type="button"
                className="text-xs text-sky-700 underline-offset-4 hover:underline"
                onClick={() => setAllPrices((v) => !v)}
              >
                {allPrices
                  ? 'Show only the best'
                  : `Compare ${history.length} vendors`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className={cn('text-xs', hintClassName)}>
            First purchase of this material: no past prices.
          </p>
        )}

        {context || r.ref.note ? (
          <p className={cn('text-xs', hintClassName)}>
            {context ? `For ${context}` : ''}
            {r.ref.note
              ? `${context ? ' · ' : ''}SPP note “${r.ref.note}”`
              : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}
