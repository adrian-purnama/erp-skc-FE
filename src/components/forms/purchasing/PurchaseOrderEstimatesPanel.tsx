import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import ChargesEditor, {
  ChargesSummary,
  chargeStatesFrom,
  priceCharges,
  type ChargeState,
} from '#/components/forms/purchasing/ChargesEditor'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import { formatRupiah, type PurchaseOrder } from '#/lib/purchasing'
import { hintClassName, sectionTitleClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  order: PurchaseOrder | null
  /** Draft PO, and the viewer may change it. */
  editable: boolean
  onChanged: (next: PurchaseOrder) => void
}

/**
 * Estimated tax / delivery / other costs on top of the goods, as rows like the
 * realization's charges. Optional: no rows = not estimated. The realization
 * records the actual amounts in the same categories.
 */
export default function PurchaseOrderEstimatesPanel({
  order,
  editable,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<ChargeState[]>([])
  const [saving, setSaving] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  // Reset only when the saved estimates change, not on unrelated PO updates.
  const savedKey = order ? JSON.stringify(order.estimatedCharges) : ''
  useEffect(() => {
    if (order) setRows(chargeStatesFrom(order.estimatedCharges))
    setShowErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, savedKey])

  if (!order) return null
  const goods = Number(order.total)

  if (!editable) {
    if (order.estimatedCharges.length === 0) return null
    return (
      <section className="space-y-2">
        <h2 className={sectionTitleClassName}>Additional cost estimate</h2>
        <ChargesSummary
          charges={order.estimatedCharges}
          subtotal={order.total}
          totalLabel="Estimated total"
        />
      </section>
    )
  }

  const priced = priceCharges(rows, goods)
  const dirty =
    JSON.stringify(priced.payload) !==
    JSON.stringify(priceCharges(chargeStatesFrom(order.estimatedCharges), goods).payload)

  async function save() {
    if (!order) return
    setShowErrors(true)
    if (priced.issues.size > 0) {
      toast.error('Fix the highlighted charges first')
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch<PurchaseOrder>(
        `/purchasing/orders/${order.id}/estimates`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ charges: priced.payload }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to save estimates')
        return
      }
      toast.success('Estimates saved')
      onChanged(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ChargesEditor
      rows={rows}
      onChange={setRows}
      subtotal={goods}
      disabled={saving}
      showErrors={showErrors}
      title="Additional cost estimate"
      hint="Optional. Estimate tax, delivery and other costs on top of the goods; add nothing if unknown. The realization records the actual amounts."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span>
            <span className={hintClassName}>Goods </span>
            <span className="tabular-nums">{formatRupiah(String(goods))}</span>
            <span className={hintClassName}> + estimates </span>
            <span className="tabular-nums">
              {formatRupiah(String(priced.total))}
            </span>
            <span className={hintClassName}> = </span>
            <span className="font-semibold tabular-nums">
              {formatRupiah(String(goods + priced.total))}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            className={cn('h-8')}
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Save estimates
          </Button>
        </div>
      }
    />
  )
}
