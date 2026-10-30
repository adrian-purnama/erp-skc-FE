import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import ListTable from '#/components/forms/shared/ListTable'
import type { ListTableColumn } from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { RupiahInput } from '#/components/ui/rupiah-input'
import {
  PURCHASE_CHARGE_CATEGORIES,
  PURCHASE_CHARGE_CATEGORY_LABELS,
  formatRupiah,
  percentChargeAmount,
  type PurchaseChargeCategory,
  type RealizationCharge,
  type RealizationChargeKind,
} from '#/lib/purchasing'
import {
  hintClassName,
  inputClassNameCompact,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** One editable charge row; `rate` for percent, `amount` (digits) for fixed. */
export type ChargeState = {
  key: string
  category: PurchaseChargeCategory
  label: string
  kind: RealizationChargeKind
  rate: string
  amount: string
}

/** What the server takes for a charge. */
export type ChargePayload = {
  category: PurchaseChargeCategory
  label: string
  kind: RealizationChargeKind
  rate: string | null
  amount: string
}

let chargeSeq = 0
function newChargeKey(): string {
  chargeSeq += 1
  return `c${chargeSeq}`
}

/** New rows for each category's add button. */
const PRESETS: Record<PurchaseChargeCategory, Omit<ChargeState, 'key'>> = {
  tax: { category: 'tax', label: 'PPN 11%', kind: 'percent', rate: '11', amount: '' },
  delivery: { category: 'delivery', label: 'Ongkir', kind: 'fixed', rate: '', amount: '' },
  other: { category: 'other', label: '', kind: 'fixed', rate: '', amount: '' },
}

export function chargeStatesFrom(charges: RealizationCharge[]): ChargeState[] {
  return charges.map((c) => ({
    key: c.id || newChargeKey(),
    category: c.category,
    label: c.label,
    kind: c.kind,
    rate: c.rate ?? '',
    amount: c.kind === 'fixed' ? c.amount : '',
  }))
}

/**
 * Price rows against the goods subtotal like the server does. Rows still
 * being filled in get an issue and are left out of the total.
 */
export function priceCharges(
  rows: ChargeState[],
  subtotal: number,
): {
  payload: ChargePayload[]
  issues: Map<string, string>
  total: number
  amounts: string[]
} {
  const issues = new Map<string, string>()
  let total = 0
  const amounts: string[] = []
  const payload = rows.map((c) => {
    const amount =
      c.kind === 'percent'
        ? percentChargeAmount(String(subtotal), c.rate)
        : c.amount
    amounts.push(amount || '0')
    if (!c.label.trim()) issues.set(c.key, 'Name the charge')
    else if (
      c.kind === 'percent' &&
      !(Number(c.rate) > 0 && Number(c.rate) <= 100)
    ) {
      issues.set(c.key, 'Rate between 0 and 100')
    } else if (c.kind === 'fixed' && !(Number(c.amount) > 0)) {
      issues.set(c.key, 'Enter the amount')
    } else total += Number(amount)
    return {
      category: c.category,
      label: c.label.trim(),
      kind: c.kind,
      rate: c.kind === 'percent' ? c.rate.trim() : null,
      amount: amount || '0',
    }
  })
  return { payload, issues, total, amounts }
}

type Props = {
  rows: ChargeState[]
  onChange: (rows: ChargeState[]) => void
  /** Goods subtotal percent rows are taken from. */
  subtotal: number
  disabled?: boolean
  showErrors?: boolean
  title?: string
  hint?: ReactNode
  /** Under the table, e.g. a totals card or a save button. */
  footer?: ReactNode
}

/**
 * Tax / delivery / other costs on top of the goods, one row per charge.
 * Shared by realizations (actual), PO estimates and RAB budgets so the
 * three line up by category.
 */
export default function ChargesEditor({
  rows,
  onChange,
  subtotal,
  disabled = false,
  showErrors = false,
  title = 'Extra charges',
  hint,
  footer,
}: Props) {
  const { issues } = priceCharges(rows, subtotal)

  function update(key: string, patch: Partial<ChargeState>) {
    onChange(rows.map((x) => (x.key === key ? { ...x, ...patch } : x)))
  }

  const columns: ListTableColumn<ChargeState>[] = [
    {
      header: 'Category',
      widthClassName: 'w-52',
      cell: (c) => (
        <div
          className="inline-flex rounded-md border border-(--line) p-0.5"
          role="radiogroup"
          aria-label="Charge category"
        >
          {PURCHASE_CHARGE_CATEGORIES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={c.category === k}
              disabled={disabled}
              onClick={() => update(c.key, { category: k })}
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                c.category === k ? 'bg-accent font-medium' : 'text-(--muted)',
              )}
            >
              {PURCHASE_CHARGE_CATEGORY_LABELS[k]}
            </button>
          ))}
        </div>
      ),
    },
    {
      header: 'Charge',
      cell: (c) => {
        const issue = showErrors ? issues.get(c.key) : undefined
        return (
          <div className="py-0.5">
            <input
              value={c.label}
              disabled={disabled}
              placeholder="e.g. Ongkir"
              aria-label="Charge name"
              onChange={(e) => update(c.key, { label: e.target.value })}
              className={cn(
                inputClassNameCompact,
                'w-full max-w-xs',
                issue && !c.label.trim() && 'border-red-500',
              )}
            />
            {issue ? <p className="mt-1 text-xs text-red-600">{issue}</p> : null}
          </div>
        )
      },
    },
    {
      header: 'Type',
      widthClassName: 'w-24',
      cell: (c) => (
        <div
          className="inline-flex rounded-md border border-(--line) p-0.5"
          role="radiogroup"
          aria-label="Charge type"
        >
          {(['percent', 'fixed'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={c.kind === k}
              disabled={disabled}
              onClick={() => update(c.key, { kind: k })}
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                c.kind === k ? 'bg-accent font-medium' : 'text-(--muted)',
              )}
            >
              {k === 'percent' ? '%' : 'Rp'}
            </button>
          ))}
        </div>
      ),
    },
    {
      header: 'Rate / amount',
      align: 'right',
      widthClassName: 'w-48',
      cell: (c) => {
        const bad = showErrors && issues.has(c.key) && c.label.trim() !== ''
        return c.kind === 'percent' ? (
          <div className="flex items-center justify-end gap-1.5">
            <input
              inputMode="decimal"
              value={c.rate}
              disabled={disabled}
              aria-label={`Rate of ${c.label || 'charge'}`}
              onChange={(e) => update(c.key, { rate: e.target.value })}
              className={cn(
                inputClassNameCompact,
                'w-20 text-right tabular-nums',
                bad && 'border-red-500',
              )}
            />
            <span className="text-xs text-(--muted)">% of goods</span>
          </div>
        ) : (
          <RupiahInput
            value={c.amount}
            onValueChange={(digits) => update(c.key, { amount: digits })}
            disabled={disabled}
            aria-label={`Amount of ${c.label || 'charge'}`}
            className={cn('h-8 text-right', bad && 'border-red-500')}
          />
        )
      },
    },
    {
      header: 'Amount',
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'font-medium',
      cell: (c) => {
        const amount =
          c.kind === 'percent'
            ? percentChargeAmount(String(subtotal), c.rate)
            : c.amount
        return Number(amount) > 0 ? formatRupiah(amount) : '—'
      },
    },
    {
      header: '',
      widthClassName: 'w-10',
      cellClassName: 'px-1',
      cell: (c) => (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={`Remove ${c.label || 'charge'}`}
          onClick={() => onChange(rows.filter((x) => x.key !== c.key))}
        >
          <X aria-hidden />
        </Button>
      ),
    },
  ]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={sectionTitleClassName}>{title}</h2>
          {hint ? <p className={cn('text-sm', hintClassName)}>{hint}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {PURCHASE_CHARGE_CATEGORIES.map((category) => (
            <Button
              key={category}
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange([...rows, { key: newChargeKey(), ...PRESETS[category] }])
              }
            >
              <Plus className="size-3.5" aria-hidden />
              {category === 'tax'
                ? 'Tax (PPN 11%)'
                : PURCHASE_CHARGE_CATEGORY_LABELS[category]}
            </Button>
          ))}
        </div>
      </div>
      {rows.length > 0 ? (
        <ListTable<ChargeState>
          rows={rows}
          rowKey={(c) => c.key}
          empty="No charges."
          minWidthClassName="min-w-[640px]"
          columns={columns}
        />
      ) : null}
      {footer}
    </section>
  )
}

/** Read-only rows, grouped by category (for locked / approved documents). */
export function ChargesSummary({
  charges,
  subtotal,
  subtotalLabel = 'Goods',
  totalLabel = 'Total',
}: {
  charges: RealizationCharge[]
  subtotal: string
  subtotalLabel?: string
  totalLabel?: string
}) {
  const total = charges.reduce((s, c) => s + Number(c.amount), Number(subtotal))
  const row = (label: ReactNode, value: ReactNode, className?: string) => (
    <div className={cn('flex items-baseline justify-between gap-6 px-4 py-1.5', className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
  return (
    <div className="ml-auto w-full max-w-md rounded-lg border border-(--line) py-1.5 text-sm">
      {row(subtotalLabel, formatRupiah(subtotal))}
      {PURCHASE_CHARGE_CATEGORIES.map((category) => {
        const inCategory = charges.filter((c) => c.category === category)
        if (inCategory.length === 0) return null
        return (
          <div key={category}>
            {row(
              <span className="font-medium">
                {PURCHASE_CHARGE_CATEGORY_LABELS[category]}
              </span>,
              <span className="font-medium">
                {formatRupiah(
                  String(inCategory.reduce((s, c) => s + Number(c.amount), 0)),
                )}
              </span>,
              'mt-1',
            )}
            {inCategory.map((c) => (
              <div key={c.id}>
                {row(
                  <span className="pl-3">
                    {c.label}
                    {c.kind === 'percent' ? (
                      <span className={cn('text-xs', hintClassName)}>
                        {' '}
                        ({c.rate}%)
                      </span>
                    ) : null}
                  </span>,
                  <span className={hintClassName}>{formatRupiah(c.amount)}</span>,
                  'py-0.5 text-xs',
                )}
              </div>
            ))}
          </div>
        )
      })}
      {row(
        <span className="font-semibold">{totalLabel}</span>,
        <span className="font-semibold">{formatRupiah(String(total))}</span>,
        'mt-1 border-t border-(--line) pt-2',
      )}
    </div>
  )
}
