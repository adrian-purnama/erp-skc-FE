import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ArrowLeft, Ban, LoaderCircle, PackageCheck } from 'lucide-react'
import { GoodsReceiptStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import { parseQty } from '#/lib/purchasing'
import type { GoodsReceipt, PurchasingUser, ReceiptPlan } from '#/lib/purchasing'
import {
  buttonOutlineClassName,
  dialogInputClassName,
  hintClassName,
  inputClassName,
  inputClassNameCompact,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  /** Existing receipt (read-only); omit to record a new one. */
  receiptId?: string
  /** New receipt: the approved PO the goods belong to. */
  orderId?: string
}

type LineState = { qty: string; note: string }

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function getData<T>(path: string): Promise<T | null> {
  try {
    const response = await apiFetch<T>(path)
    if (!response.success) {
      toast.error(response.message || 'Request failed')
      return null
    }
    return response.data
  } catch {
    toast.error('Unable to reach the server')
    return null
  }
}

/** Record what arrived for an approved PO, or view a recorded receipt. */
export default function GoodsReceiptEditor({ receiptId, orderId }: Props) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canVoid = can('purchasing.manage')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [doc, setDoc] = useState<GoodsReceipt | null>(null)
  const [plan, setPlan] = useState<ReceiptPlan | null>(null)
  const [users, setUsers] = useState<PurchasingUser[]>([])

  const [receivedDate, setReceivedDate] = useState(jakartaDateKey(new Date()))
  const [receiverId, setReceiverId] = useState('')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Record<string, LineState>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<'save' | 'void' | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      if (receiptId) {
        const r = await getData<GoodsReceipt>(`/purchasing/receipts/${receiptId}`)
        if (!cancelled) setDoc(r)
      } else if (orderId) {
        const [p, u] = await Promise.all([
          getData<ReceiptPlan>(`/purchasing/receipts/plan/${orderId}`),
          getData<PurchasingUser[]>('/purchasing/receipts/receivers'),
        ])
        if (cancelled) return
        setPlan(p)
        setUsers(u ?? [])
        const next: Record<string, LineState> = {}
        for (const l of p?.lines ?? []) {
          next[l.poLineId] = { qty: Number(l.remainingQty) > 0 ? l.remainingQty : '', note: '' }
        }
        setLines(next)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [receiptId, orderId])

  const userOptions = useMemo(
    () => users.map((u) => ({ value: u.id, label: u.name || u.email })),
    [users],
  )

  // ---- Derived ----
  const issues = new Map<string, string>()
  const payload: Array<{ poLineId: string; qty: string; note: string }> = []
  for (const l of plan?.lines ?? []) {
    const st = lines[l.poLineId]
    if (!st || !st.qty.trim()) continue
    const q = parseQty(st.qty)
    if (q === null) {
      issues.set(l.poLineId, 'Enter a qty above 0, or clear it')
      continue
    }
    if (q > Number(l.remainingQty) + 1e-9) {
      issues.set(l.poLineId, `Only ${l.remainingQty} ${l.uomSymbol} still expected`)
      continue
    }
    payload.push({ poLineId: l.poLineId, qty: st.qty.trim(), note: st.note })
  }
  const formErrors: string[] = []
  if (!receivedDate) formErrors.push('Set the date received')
  if (payload.length === 0 && issues.size === 0) formErrors.push('Enter at least one arrived qty')
  const canSave = formErrors.length === 0 && issues.size === 0

  async function runConfirm() {
    setBusy(true)
    try {
      if (confirm === 'save') {
        const response = await apiFetch<GoodsReceipt>('/purchasing/receipts', {
          method: 'POST',
          body: JSON.stringify({
            purchaseOrderId: orderId,
            receivedDate,
            receivedByUserId: receiverId || null,
            deliveryNoteNumber: deliveryNote,
            notes,
            lines: payload,
          }),
        })
        if (!response.success) {
          toast.error(response.message || 'Failed to save receipt')
          return
        }
        toast.success(`${response.data.number} recorded`)
        void navigate({
          to: '/dashboard/purchasing/receipts/$receiptId',
          params: { receiptId: response.data.id },
          replace: true,
        })
        return
      }
      if (confirm === 'void' && doc) {
        const response = await apiFetch<GoodsReceipt>(`/purchasing/receipts/${doc.id}/void`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        })
        if (!response.success) {
          toast.error(response.message || 'Failed to void receipt')
          return
        }
        toast.success('Receipt voided')
        setDoc(response.data)
        setConfirm(null)
      }
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  // ---- Render ----
  const backLink = (
    <Link
      to="/dashboard/purchasing/receipts"
      className={cn(buttonOutlineClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Penerimaan Barang
    </Link>
  )

  if (loading) {
    return (
      <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading…
      </p>
    )
  }
  if ((receiptId && !doc) || (!receiptId && !plan)) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>
          {receiptId ? 'This receipt could not be loaded.' : 'Open an approved PO to receive its goods.'}
        </p>
      </div>
    )
  }

  const poId = doc?.purchaseOrderId ?? plan?.purchaseOrderId ?? ''
  const poNumber = doc?.poNumber ?? plan?.poNumber ?? ''
  const context = doc
    ? `${doc.vendorName} · ${doc.requestNumber} · ${doc.projectNumber} · ${doc.projectName}`
    : `${plan!.vendorName} · ${plan!.requestNumber} · ${plan!.projectNumber} · ${plan!.projectName}${plan!.expectedDate ? ` · expected ${plan!.expectedDate}` : ''}`

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {doc ? doc.number : 'Receive goods'}
          </h1>
          {doc ? <GoodsReceiptStatusChip status={doc.status} /> : null}
        </div>
        <p className="text-sm">
          For{' '}
          <Link
            to="/dashboard/purchasing/orders/$orderId"
            params={{ orderId: poId }}
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            {poNumber}
          </Link>
          <span className={hintClassName}> · {context}</span>
        </p>
        {doc?.status === 'voided' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Voided {formatWhen(doc.voidedAt)} by {doc.voidedBy?.name ?? 'Unknown'}: {doc.voidReason}
          </p>
        ) : null}
      </div>

      {plan ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Date received</span>
              <input
                type="date"
                value={receivedDate}
                max={jakartaDateKey(new Date())}
                disabled={busy}
                onChange={(e) => setReceivedDate(e.target.value)}
                className={cn(inputClassName, 'w-full', showErrors && !receivedDate && 'border-red-500')}
              />
            </label>
            <div className="space-y-1">
              <span className="text-sm font-medium">
                Received by<span className={cn('font-normal', hintClassName)}> (optional)</span>
              </span>
              <Combobox
                value={receiverId}
                onValueChange={setReceiverId}
                options={userOptions}
                placeholder="Choose a person"
                aria-label="Received by"
                disabled={busy}
              />
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Surat jalan no.<span className={cn('font-normal', hintClassName)}> (optional)</span>
              </span>
              <input
                value={deliveryNote}
                disabled={busy}
                onChange={(e) => setDeliveryNote(e.target.value)}
                className={cn(inputClassName, 'w-full')}
              />
            </label>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className={sectionTitleClassName}>What arrived</h2>
              <p className={cn('text-sm', hintClassName)}>
                Filled with everything still expected. Change it to what actually arrived; clear a
                qty if that item did not come this time.
              </p>
            </div>
            <div className="overflow-x-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Ordered</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Arrived before</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Arrived now</th>
                    <th className="w-64 px-3 py-2 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map((l) => {
                    const st = lines[l.poLineId] ?? { qty: '', note: '' }
                    const issue = showErrors ? issues.get(l.poLineId) : undefined
                    const done = Number(l.remainingQty) <= 0
                    const update = (patch: Partial<LineState>) =>
                      setLines({ ...lines, [l.poLineId]: { ...st, ...patch } })
                    return (
                      <tr
                        key={l.poLineId}
                        className={cn('border-b border-(--line) align-top last:border-0', done && 'opacity-60')}
                      >
                        <td className="px-3 py-2">
                          <span className="text-xs text-(--muted) tabular-nums">{l.materialCode}</span>{' '}
                          {l.materialName}
                          {issue ? <p className="mt-1 text-xs text-red-600">{issue}</p> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {l.orderedQty} {l.uomSymbol}
                        </td>
                        <td className="px-3 py-2 text-right text-(--muted) tabular-nums">
                          {Number(l.receivedQty) > 0 ? `${l.receivedQty} ${l.uomSymbol}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {done ? (
                            <p className={cn('text-right text-xs', hintClassName)}>All arrived</p>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                inputMode="decimal"
                                value={st.qty}
                                disabled={busy}
                                placeholder="0"
                                aria-label={`Arrived qty of ${l.materialName}`}
                                onChange={(e) => update({ qty: e.target.value })}
                                className={cn(
                                  inputClassNameCompact,
                                  'w-20 text-right tabular-nums',
                                  issue && 'border-red-500',
                                )}
                              />
                              <span className="w-8 text-xs text-(--muted)">{l.uomSymbol}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!done ? (
                            <input
                              value={st.note}
                              disabled={busy}
                              placeholder="e.g. 1 sheet dented (optional)"
                              aria-label={`Condition of ${l.materialName}`}
                              onChange={(e) => update({ note: e.target.value })}
                              className={cn(inputClassNameCompact, 'w-full')}
                            />
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <label className="block max-w-2xl space-y-1">
            <span className={sectionTitleClassName}>Notes</span>
            <textarea
              rows={3}
              value={notes}
              disabled={busy}
              placeholder="Delivery remarks, where it is stored… (optional)"
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClassName, 'w-full')}
            />
          </label>

          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
            <div className="text-sm">
              <span className="font-medium tabular-nums">
                {payload.length} {payload.length === 1 ? 'item' : 'items'} arrived
              </span>
              {showErrors && (formErrors.length > 0 || issues.size > 0) ? (
                <p className="text-xs text-red-600">
                  {[
                    ...formErrors,
                    ...(issues.size > 0
                      ? [`${issues.size} ${issues.size === 1 ? 'row needs' : 'rows need'} attention`]
                      : []),
                  ].join(' · ')}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                setShowErrors(true)
                if (canSave) setConfirm('save')
                else toast.error('Fix the highlighted fields first')
              }}
            >
              <PackageCheck className="size-3.5" aria-hidden />
              Save receipt
            </Button>
          </div>
        </>
      ) : doc ? (
        <>
          <section className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className={cn('text-xs', hintClassName)}>Date received</p>
              <p className="tabular-nums">{doc.receivedDate}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Received by</p>
              <p>{doc.receivedByName || '—'}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Surat jalan no.</p>
              <p>{doc.deliveryNoteNumber || '—'}</p>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>What arrived</h2>
            <div className="overflow-x-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Ordered</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Arrived</th>
                    <th className="px-3 py-2 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l) => (
                    <tr key={l.id} className="border-b border-(--line) align-top last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-xs text-(--muted) tabular-nums">{l.materialCode}</span>{' '}
                        {l.materialName}
                      </td>
                      <td className="px-3 py-2 text-right text-(--muted) tabular-nums">
                        {l.orderedQty} {l.uomSymbol}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {l.qty} {l.uomSymbol}
                      </td>
                      <td className={cn('px-3 py-2', hintClassName)}>{l.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {doc.notes ? (
            <section className="space-y-1">
              <h2 className={sectionTitleClassName}>Notes</h2>
              <p className="text-sm whitespace-pre-line">{doc.notes}</p>
            </section>
          ) : null}
          <p className={cn('text-xs', hintClassName)}>
            Recorded by {doc.createdBy?.name ?? 'Unknown'} · {formatWhen(doc.createdAt)}
          </p>
          {doc.status === 'posted' && canVoid ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-700"
              disabled={busy}
              onClick={() => {
                setReason('')
                setConfirm('void')
              }}
            >
              <Ban className="size-3.5" aria-hidden />
              Void receipt
            </Button>
          ) : null}
        </>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'save' ? 'Save this receipt?' : `Void ${doc?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'save'
                ? `${payload.length} ${payload.length === 1 ? 'item' : 'items'} arrived on ${receivedDate}. A saved receipt cannot be edited, only voided.`
                : 'The goods no longer count as arrived and can be received again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === 'void' ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Reason</span>
              <input
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
                className={dialogInputClassName}
              />
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === 'save' ? 'default' : 'destructive'}
              disabled={busy || (confirm === 'void' && !reason.trim())}
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {confirm === 'save' ? 'Save' : 'Void'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
