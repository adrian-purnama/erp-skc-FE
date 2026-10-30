import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  Hash,
  Package,
  Store,
  X,
} from 'lucide-react'
import {
  FLAG_LABELS,
  FLAG_TITLES,
  LineFlagBadge,
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-[11px] font-medium tracking-wide text-(--muted) uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Fact({
  label,
  value,
  warn = false,
}: {
  label: string
  value: ReactNode
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={hintClassName}>{label}</span>
      <span
        className={cn(
          'text-right tabular-nums',
          warn && 'text-amber-700 dark:text-amber-300',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** Order fields, budget check and price history of one line. */
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
  const flags = rowFlags(r)
  const q = parseQty(r.qty) ?? 0
  const afterPo = Number(r.ref.rabOrderedQty) + q
  const uom = r.ref.uomSymbol

  return (
    <div
      className="grid cursor-default gap-x-8 gap-y-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]"
      onClick={(e) => e.stopPropagation()}
    >
      <Section title="Order">
        {editable ? (
          <div className="space-y-2">
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
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className={cn('text-xs', hintClassName)}>
                  Qty ({uom}) · {r.leftQty} left
                </span>
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
                flags.length > 0
                  ? 'Why (optional), e.g. price went up'
                  : 'Note (optional)'
              }
              aria-label={`Note for ${r.ref.materialName}`}
              onChange={(e) => onChange({ orderNote: e.target.value })}
              className={cn(inputClassNameCompact, 'w-full')}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Fact
              label="Requested on SPP"
              value={`${r.ref.requestedQty} ${uom}`}
            />
            {arrived !== null ? (
              <Fact label="Arrived" value={`${arrived} ${uom}`} />
            ) : null}
            {r.orderNote ? (
              <p className="pt-1 text-sm">“{r.orderNote}”</p>
            ) : null}
          </div>
        )}
        {r.ref.note || r.ref.itemLabel || r.ref.productionOrderNumber ? (
          <p className={cn('text-xs', hintClassName)}>
            {[r.ref.productionOrderNumber, r.ref.itemLabel]
              .filter(Boolean)
              .join(' · ')}
            {r.ref.note ? ` · SPP note “${r.ref.note}”` : ''}
          </p>
        ) : null}
      </Section>

      <Section title="Budget (RAB)">
        {r.ref.rabQty === null ? (
          <p className={cn('text-sm', hintClassName)}>
            Not budgeted on {r.ref.rabLabel ?? 'the RAB'}.
          </p>
        ) : (
          <div className="space-y-1">
            {r.ref.rabLabel ? <Fact label="RAB" value={r.ref.rabLabel} /> : null}
            <Fact label="RAB qty" value={`${r.ref.rabQty} ${uom}`} />
            <Fact
              label="On other POs"
              value={`${r.ref.rabOrderedQty} ${uom}`}
            />
            <Fact
              label="After this PO"
              value={`${afterPo} ${uom}`}
              warn={afterPo > Number(r.ref.rabQty) + 1e-9}
            />
            <Fact
              label="RAB price"
              value={
                r.ref.rabUnitPrice ? formatRupiah(r.ref.rabUnitPrice) : '—'
              }
              warn={flags.includes('overBudget')}
            />
          </div>
        )}
        {flags.length > 0 ? (
          <ul className="space-y-1 pt-1">
            {flags.map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs">
                <LineFlagBadge flag={f} />
                <span className={hintClassName}>{FLAG_TITLES[f]}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Price history">
        {r.ref.priceHistory.length === 0 ? (
          <p className={cn('text-sm', hintClassName)}>
            No approved PO for this material yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-(--line) bg-(--background)">
            <table className="w-full text-sm">
              <thead className="bg-(--surface) text-left text-xs text-(--muted)">
                <tr>
                  <th className="px-2 py-1 font-medium">Vendor</th>
                  <th className="px-2 py-1 text-right font-medium">Last</th>
                  <th className="px-2 py-1 text-right font-medium">Lowest</th>
                  {editable ? <th className="w-14" aria-label="Use" /> : null}
                </tr>
              </thead>
              <tbody>
                {r.ref.priceHistory.map((h, i) => {
                  const current =
                    h.vendorId === r.vendorId && h.lastPrice === r.unitPrice
                  return (
                    <tr
                      key={h.vendorId}
                      className={cn(
                        'border-t border-(--line)',
                        h.vendorId === r.vendorId && 'bg-(--surface)',
                      )}
                      title={`${h.lastOrderNumber}${h.orderCount > 1 ? ` · ${h.orderCount} POs` : ''}`}
                    >
                      <td className="max-w-0 truncate px-2 py-1">
                        {h.vendorName}
                        {i === 0 ? (
                          <span className="ml-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                            cheapest
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">
                        {formatRupiah(h.lastPrice)}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1 text-right whitespace-nowrap tabular-nums',
                          hintClassName,
                        )}
                      >
                        {formatRupiah(h.minPrice)}
                      </td>
                      {editable ? (
                        <td className="px-1 py-0.5 text-right">
                          <Button
                            type="button"
                            variant={current ? 'ghost' : 'outline'}
                            size="sm"
                            className="h-6 px-2 text-xs"
                            disabled={busy || current}
                            onClick={() =>
                              onChange({
                                vendorId: h.vendorId,
                                unitPrice: h.lastPrice,
                              })
                            }
                          >
                            {current ? 'In use' : 'Use'}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
