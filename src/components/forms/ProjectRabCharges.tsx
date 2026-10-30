import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import ChargesEditor, {
  ChargesSummary,
  chargeStatesFrom,
  priceCharges,
} from '#/components/forms/purchasing/ChargesEditor'
import type { ChargeState } from '#/components/forms/purchasing/ChargesEditor'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import type { ProjectRab } from '#/lib/project'
import { formatRupiah } from '#/lib/purchasing'
import { hintClassName, sectionTitleClassName } from '#/lib/ui-classes'

const TITLE = 'Additional costs'

/**
 * Extra costs on the whole project RAB: each row is a percent of the line
 * subtotal or a fixed rupiah amount. Editable while the RAB is a draft or a
 * change is open, like line prices.
 */
export default function ProjectRabCharges({
  projectId,
  rab,
  editable,
  onSaved,
}: {
  projectId: string
  rab: ProjectRab
  editable: boolean
  onSaved: (rab: ProjectRab) => void
}) {
  const [rows, setRows] = useState<ChargeState[]>(() =>
    chargeStatesFrom(rab.charges),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)

  // Reset only when the saved rows change, not when a line price reprices a percent row.
  const savedKey = JSON.stringify(
    rab.charges.map((c) => [c.id, c.category, c.label, c.kind, c.rate, c.kind === 'fixed' ? c.amount : '']),
  )
  useEffect(() => {
    setRows(chargeStatesFrom(rab.charges))
    setShowErrors(false)
  }, [savedKey])

  const subtotal = Number(rab.subtotal ?? 0)
  const priced = useMemo(() => priceCharges(rows, subtotal), [rows, subtotal])
  const saved = useMemo(
    () => JSON.stringify(priceCharges(chargeStatesFrom(rab.charges), subtotal).payload),
    [rab.charges, subtotal],
  )
  const dirty = JSON.stringify(priced.payload) !== saved

  async function save() {
    if (priced.issues.size > 0) {
      setShowErrors(true)
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(`/project/${projectId}/rab/charges`, {
        method: 'PUT',
        body: JSON.stringify({ charges: priced.payload }),
      })
      if (!res.success) {
        toast.error(res.message || 'Failed to save additional costs')
        return
      }
      onSaved(res.data)
      toast.success('Additional costs saved')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  if (!editable) {
    if (rab.charges.length === 0) return null
    return (
      <section className="space-y-2">
        <h2 className={sectionTitleClassName}>{TITLE}</h2>
        <ChargesSummary
          charges={rab.charges}
          subtotal={rab.subtotal ?? '0'}
          subtotalLabel="RAB lines"
          totalLabel="Grand total"
        />
      </section>
    )
  }

  return (
    <ChargesEditor
      rows={rows}
      onChange={setRows}
      subtotal={subtotal}
      disabled={busy}
      showErrors={showErrors}
      title={TITLE}
      hint="Costs on top of the whole RAB: a percent of the line subtotal, or a fixed amount. They count in the quotation cost."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-right text-sm">
            <span className={hintClassName}>Lines </span>
            <span className="tabular-nums">{formatRupiah(String(subtotal))}</span>
            <span className={hintClassName}> + additional </span>
            <span className="tabular-nums">{formatRupiah(String(priced.total))}</span>
            <span className={hintClassName}> = </span>
            <span className="font-semibold tabular-nums">
              {formatRupiah(String(subtotal + priced.total))}
            </span>
          </p>
          <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
            Save
          </Button>
        </div>
      }
    />
  )
}
