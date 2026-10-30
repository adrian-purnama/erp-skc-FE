import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { apiFetch } from '#/lib/api'
import { formatRupiah } from '#/lib/purchasing'
import type {
  PurchasePayment,
  PurchasingUser,
  ReimbursableNota,
} from '#/lib/purchasing'
import { dialogInputClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  /** 'new', a draft reimbursement to edit, or null when closed. */
  editing: PurchasePayment | 'new' | null
  onOpenChange: (open: boolean) => void
  onSaved: (payment: PurchasePayment) => void
}

/** Bundle a staff member's posted notas into one reimbursement. */
export default function ReimbursementDialog({
  editing,
  onOpenChange,
  onSaved,
}: Props) {
  const [buyers, setBuyers] = useState<PurchasingUser[]>([])
  const [payeeUserId, setPayeeUserId] = useState<string | null>(null)
  const [notas, setNotas] = useState<ReimbursableNota[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const existing = editing && editing !== 'new' ? editing : null

  useEffect(() => {
    if (!editing) return
    setPayeeUserId(existing?.payeeUserId ?? null)
    setPicked(existing?.items.map((i) => i.realizationId) ?? [])
    setDueDate(existing?.dueDate ?? '')
    setNotes(existing?.notes ?? '')
    void (async () => {
      try {
        const response = await apiFetch<PurchasingUser[]>(
          '/purchasing/realizations/buyers',
        )
        if (response.success) setBuyers(response.data)
      } catch {
        toast.error('Unable to reach the server')
      }
    })()
    // Load once per open; `existing` is derived from `editing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (!editing || !payeeUserId) {
      setNotas(null)
      return
    }
    let cancelled = false
    setNotas(null)
    void (async () => {
      try {
        const qs = new URLSearchParams({ payeeUserId })
        if (existing) qs.set('exceptId', existing.id)
        const response = await apiFetch<ReimbursableNota[]>(
          `/purchasing/payments/reimbursable?${qs.toString()}`,
        )
        if (cancelled) return
        if (!response.success) {
          toast.error(response.message || 'Failed to load notas')
          setNotas([])
          return
        }
        setNotas(response.data)
        // Drop picks that belong to another person.
        setPicked((prev) =>
          prev.filter((id) =>
            response.data.some((n) => n.realizationId === id),
          ),
        )
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, payeeUserId, existing])

  async function save() {
    if (!payeeUserId) return
    setBusy(true)
    try {
      const response = await apiFetch<PurchasePayment>(
        existing
          ? `/purchasing/payments/${existing.id}/reimburse`
          : '/purchasing/payments/reimburse',
        {
          method: existing ? 'PUT' : 'POST',
          body: JSON.stringify({
            payeeUserId,
            realizationIds: picked,
            dueDate: dueDate || null,
            notes,
          }),
        },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to save reimbursement')
        return
      }
      toast.success('Reimbursement saved as draft')
      onSaved(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  const total = (notas ?? [])
    .filter((n) => picked.includes(n.realizationId))
    .reduce((sum, n) => sum + Number(n.total), 0)

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit ${existing.number}` : 'New reimbursement'}
          </DialogTitle>
          <DialogDescription>
            Pay a staff member back for notas they paid themselves. Each nota is
            approved by its own PO's approvers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Pay to</span>
            <Combobox
              value={payeeUserId ?? ''}
              onValueChange={(v) => setPayeeUserId(v || null)}
              options={buyers.map((u) => ({
                value: u.id,
                label: u.name === u.email ? u.name : `${u.name} · ${u.email}`,
              }))}
              placeholder="Select the staff member"
              searchPlaceholder="Search users…"
              disabled={busy}
              aria-label="Pay to"
              className="w-full"
            />
          </label>

          {payeeUserId ? (
            notas === null ? (
              <p
                className={cn('flex items-center gap-2 text-sm', hintClassName)}
              >
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Loading notas…
              </p>
            ) : notas.length === 0 ? (
              <p className={cn('text-sm', hintClassName)}>
                No posted notas of this person are waiting for reimbursement.
              </p>
            ) : (
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">Notas</legend>
                <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
                  {notas.map((n) => (
                    <li key={n.realizationId}>
                      <label className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={picked.includes(n.realizationId)}
                          disabled={busy}
                          onChange={(e) =>
                            setPicked(
                              e.target.checked
                                ? [...picked, n.realizationId]
                                : picked.filter((id) => id !== n.realizationId),
                            )
                          }
                        />
                        <span className="font-medium tabular-nums">
                          {n.number}
                        </span>
                        <span className={cn('text-xs', hintClassName)}>
                          {n.purchaseOrderNumber} · {n.purchaseDate}
                          {n.place ? ` · ${n.place}` : ''}
                        </span>
                        <span className="ml-auto tabular-nums">
                          {formatRupiah(n.total)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-right text-sm font-medium tabular-nums">
                  {picked.length} picked · {formatRupiah(String(total))}
                </p>
              </fieldset>
            )
          ) : null}

          <label className="block space-y-1">
            <span className="text-sm font-medium">Due date</span>
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(e) => setDueDate(e.target.value)}
              className={dialogInputClassName}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              rows={2}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              className={dialogInputClassName}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={busy || !payeeUserId || picked.length === 0}
              onClick={() => void save()}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
