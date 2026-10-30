import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Camera,
  Check,
  LoaderCircle,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import ProofFile from '#/components/forms/shared/ProofFile'
import { ListChip } from '#/components/forms/shared/ListTable'
import PurchaseFlowHeader from '#/components/forms/shared/PurchaseFlowHeader'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { useAuth } from '#/context/authContext'
import { apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatRupiah,
  paymentLabel,
  paymentStatusTone,
} from '#/lib/purchasing'
import type {
  PaymentApproval,
  PurchasePayment,
  PurchasePaymentMethod,
} from '#/lib/purchasing'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  paymentId: string | null
  onOpenChange: (open: boolean) => void
  /** After any change, so lists reload. */
  onChanged?: () => void
  /** Owner edits a draft / rejected payment in its own editor. */
  onEdit?: (payment: PurchasePayment) => void
}

/** "L1 Budi ✓ · L2 waiting Sari" for one approval. */
export function approvalLine(a: PaymentApproval): string {
  const l1 = a.approved1By
    ? `L1 ${a.approved1By.name} ✓`
    : `L1 ${a.approver1?.name ?? '—'}`
  const l2 = a.approvedBy
    ? `L2 ${a.approvedBy.name} ✓`
    : `L2 ${a.approver2?.name ?? '—'}`
  if (a.rejectedBy) return `Rejected by ${a.rejectedBy.name}: ${a.rejectReason}`
  return `${l1} · ${l2}`
}

/** One payment: what it pays, its approvals, and the actions the viewer may take. */
export default function PaymentDialog({
  paymentId,
  onOpenChange,
  onChanged,
  onEdit,
}: Props) {
  const { can } = useAuth()
  const [payment, setPayment] = useState<PurchasePayment | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reason, setReason] = useState('')
  /** Which reason box is open: the whole payment, one nota, or cancelling. */
  const [asking, setAsking] = useState<
    | { kind: 'reject' }
    | { kind: 'rejectItem'; itemId: string }
    | { kind: 'cancel' }
    | null
  >(null)
  const [paidDate, setPaidDate] = useState('')
  const [method, setMethod] = useState<PurchasePaymentMethod>('transfer')
  const [reference, setReference] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!paymentId) {
      setPayment(null)
      return
    }
    let cancelled = false
    setAsking(null)
    setPaidDate(jakartaDateKey(new Date()))
    setMethod('transfer')
    setReference('')
    void (async () => {
      try {
        const response = await apiFetch<PurchasePayment>(
          `/purchasing/payments/${paymentId}`,
        )
        if (cancelled) return
        if (!response.success) {
          toast.error(response.message || 'Failed to load payment')
          return
        }
        setPayment(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [paymentId])

  async function act(
    path: string,
    init: RequestInit,
    success: string,
  ): Promise<boolean> {
    if (!payment) return false
    setBusy(true)
    try {
      const response = await apiFetch<PurchasePayment | null>(
        `/purchasing/payments/${payment.id}${path}`,
        init,
      )
      if (!response.success) {
        toast.error(response.message || 'Request failed')
        return false
      }
      toast.success(success)
      if (response.data) setPayment(response.data)
      onChanged?.()
      return true
    } catch {
      toast.error('Unable to reach the server')
      return false
    } finally {
      setBusy(false)
    }
  }

  const post = (path: string, success: string, body?: unknown) =>
    act(
      path,
      { method: 'POST', body: body ? JSON.stringify(body) : undefined },
      success,
    )

  async function submitReason() {
    if (!asking) return
    const body = { reason }
    const ok =
      asking.kind === 'reject'
        ? await post('/reject', 'Payment rejected', body)
        : asking.kind === 'cancel'
          ? await post('/cancel', 'Payment cancelled', body)
          : await post(`/items/${asking.itemId}/reject`, 'Nota rejected', body)
    if (ok) {
      setAsking(null)
      setReason('')
    }
  }

  async function remove() {
    const ok = await act('', { method: 'DELETE' }, 'Payment deleted')
    if (ok) onOpenChange(false)
  }

  async function onFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (!payment || files.length === 0) return
    setUploading(true)
    try {
      const data = new FormData()
      for (const f of files) data.append('files', f)
      const response = await apiUpload<PurchasePayment>(
        `/purchasing/payments/${payment.id}/proofs`,
        data,
      )
      if (!response.success) {
        toast.error(response.message || 'Upload failed')
        return
      }
      setPayment(response.data)
      onChanged?.()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const p = payment
  const canPay = can('purchasing.pay') && p?.status === 'approved'
  // A rejected vendor stage is edited and sent again; a reimbursement is rebuilt instead.
  const editable =
    p?.viewerIsOwner &&
    (p.status === 'draft' || (p.status === 'rejected' && p.kind === 'vendor'))
  const cancellable =
    p?.viewerIsOwner &&
    (p.status === 'pending_approval' ||
      p.status === 'approved' ||
      p.status === 'rejected')

  return (
    <Dialog
      open={paymentId !== null}
      onOpenChange={(next) => {
        if (!busy && !uploading) onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {!p ? (
          <div className={cn('flex items-center gap-2 text-sm', hintClassName)}>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading payment…
          </div>
        ) : (
          <div className="space-y-5">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="tabular-nums">{p.number}</DialogTitle>
                <ListChip tone={paymentStatusTone(p.status)}>
                  {PAYMENT_STATUS_LABELS[p.status]}
                </ListChip>
              </div>
              <DialogDescription>
                {paymentLabel(p)} ·{' '}
                {p.kind === 'vendor'
                  ? `${p.vendorName ?? '—'} · ${p.purchaseOrderNumber ?? '—'}`
                  : `to ${p.payeeName}`}
              </DialogDescription>
            </DialogHeader>

            <PurchaseFlowHeader key={`${p.id}:${p.status}`} kind="payment" id={p.id} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className={cn('text-xs', hintClassName)}>Amount</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatRupiah(p.amount)}
                </p>
              </div>
              <div>
                <p className={cn('text-xs', hintClassName)}>Due</p>
                <p className="text-sm tabular-nums">{p.dueDate ?? '—'}</p>
              </div>
              <div>
                <p className={cn('text-xs', hintClassName)}>Requested by</p>
                <p className="text-sm">{p.createdBy?.name ?? '—'}</p>
              </div>
            </div>

            {p.kind === 'vendor' && p.purchaseOrderId ? (
              <p className="text-sm">
                <Link
                  to="/dashboard/purchasing/orders/$orderId"
                  params={{ orderId: p.purchaseOrderId }}
                  className="underline-offset-4 hover:underline"
                >
                  Open {p.purchaseOrderNumber}
                </Link>
                {p.realizations.length > 0 ? (
                  <span className={hintClassName}>
                    {' '}
                    · for {p.realizations.map((r) => r.number).join(', ')}
                  </span>
                ) : null}
              </p>
            ) : null}

            {p.notes ? (
              <p className="text-sm whitespace-pre-line">{p.notes}</p>
            ) : null}

            {p.kind === 'vendor' && p.status !== 'draft' ? (
              <p className={cn('text-xs', hintClassName)}>{approvalLine(p)}</p>
            ) : null}

            {p.kind === 'reimburse' ? (
              <section className="space-y-2">
                <h3 className={sectionTitleClassName}>Notas</h3>
                <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
                  {p.items.map((i) => (
                    <li key={i.id} className="space-y-1 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          to="/dashboard/purchasing/realizations/$realizationId"
                          params={{ realizationId: i.realizationId }}
                          className="font-medium tabular-nums underline-offset-4 hover:underline"
                        >
                          {i.realizationNumber}
                        </Link>
                        <span className={cn('text-xs', hintClassName)}>
                          {i.purchaseOrderNumber} · {i.purchaseDate}
                          {i.place ? ` · ${i.place}` : ''}
                        </span>
                        <span className="ml-auto tabular-nums">
                          {formatRupiah(i.amount)}
                        </span>
                        {p.status !== 'draft' ? (
                          <ListChip
                            tone={
                              i.status === 'approved'
                                ? 'success'
                                : i.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {i.status === 'pending'
                              ? `Level ${i.approvalLevel ?? '—'}`
                              : i.status === 'approved'
                                ? 'Approved'
                                : 'Rejected'}
                          </ListChip>
                        ) : null}
                      </div>
                      {p.status !== 'draft' ? (
                        <p className={cn('text-xs', hintClassName)}>
                          {approvalLine(i)}
                        </p>
                      ) : null}
                      {i.viewerCanApprove ? (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={busy}
                            onClick={() =>
                              void post(
                                `/items/${i.id}/approve`,
                                'Nota approved',
                              )
                            }
                          >
                            <Check className="size-3.5" aria-hidden />
                            Approve level {i.approvalLevel}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              setReason('')
                              setAsking({ kind: 'rejectItem', itemId: i.id })
                            }}
                          >
                            <X className="size-3.5" aria-hidden />
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {p.status === 'pending_approval' ? (
                  <p className={cn('text-xs', hintClassName)}>
                    Each nota is approved by its own PO's approvers. Finance
                    pays once every nota is decided; rejected ones drop out.
                  </p>
                ) : null}
              </section>
            ) : null}

            {p.status === 'cancelled' ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                Cancelled by {p.cancelledBy?.name ?? '—'}: {p.cancelReason}
              </p>
            ) : null}

            {p.status === 'paid' ? (
              <p className="text-sm">
                Paid {p.paidDate} by {p.paidBy?.name ?? '—'} ·{' '}
                {p.method ? PAYMENT_METHOD_LABELS[p.method] : ''}
                {p.reference ? ` · ref ${p.reference}` : ''}
              </p>
            ) : null}

            {canPay || p.proofs.length > 0 ? (
              <section className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className={sectionTitleClassName}>Proof of payment</h3>
                    {canPay ? (
                      <p className={cn('text-xs', hintClassName)}>
                        Transfer slip or receipt. At least one is needed to mark
                        it paid.
                      </p>
                    ) : null}
                  </div>
                  {canPay ? (
                    <>
                      <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => void onFiles(e.target.files)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy || uploading}
                        onClick={() => fileInput.current?.click()}
                      >
                        {uploading ? (
                          <LoaderCircle
                            className="size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Camera className="size-3.5" aria-hidden />
                        )}
                        Add files
                      </Button>
                    </>
                  ) : null}
                </div>
                {p.proofs.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>No files.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {p.proofs.map((f) => (
                      <ProofFile
                        key={f.id}
                        path={`/purchasing/payments/${p.id}/proofs/${f.id}`}
                        photo={f}
                        disabled={busy}
                        onRemove={
                          canPay
                            ? () =>
                                void act(
                                  `/proofs/${f.id}`,
                                  { method: 'DELETE' },
                                  'File removed',
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
                {canPay ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">Paid on</span>
                      <input
                        type="date"
                        value={paidDate}
                        max={jakartaDateKey(new Date())}
                        disabled={busy}
                        onChange={(e) => setPaidDate(e.target.value)}
                        className={dialogInputClassName}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">Method</span>
                      <Combobox
                        value={method}
                        onValueChange={(v) =>
                          v && setMethod(v as PurchasePaymentMethod)
                        }
                        options={Object.entries(PAYMENT_METHOD_LABELS).map(
                          ([value, label]) => ({ value, label }),
                        )}
                        disabled={busy}
                        aria-label="Payment method"
                        className="w-full"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">Reference</span>
                      <input
                        value={reference}
                        placeholder="Transfer no., bank"
                        disabled={busy}
                        onChange={(e) => setReference(e.target.value)}
                        className={dialogInputClassName}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            ) : null}

            {asking ? (
              <div className="space-y-2 rounded-md border border-(--line) p-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {asking.kind === 'cancel'
                      ? 'Why cancel this payment?'
                      : 'Why reject?'}
                  </span>
                  <input
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                    className={dialogInputClassName}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8"
                    disabled={busy || !reason.trim()}
                    onClick={() => void submitReason()}
                  >
                    {asking.kind === 'cancel' ? 'Cancel payment' : 'Reject'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    disabled={busy}
                    onClick={() => setAsking(null)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {canPay ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={
                      busy || uploading || p.proofs.length === 0 || !paidDate
                    }
                    onClick={() =>
                      void post('/pay', 'Marked as paid', {
                        paidDate,
                        method,
                        reference,
                      })
                    }
                  >
                    <Check className="size-3.5" aria-hidden />
                    Mark paid
                  </Button>
                ) : null}
                {p.kind === 'vendor' && p.viewerCanApprove ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy}
                      onClick={() => void post('/approve', 'Payment approved')}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Approve level {p.approvalLevel}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy}
                      onClick={() => {
                        setReason('')
                        setAsking({ kind: 'reject' })
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                      Reject
                    </Button>
                  </>
                ) : null}
                {p.viewerIsOwner && p.status === 'draft' ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() => void post('/submit', 'Sent for approval')}
                  >
                    <Send className="size-3.5" aria-hidden />
                    Send for approval
                  </Button>
                ) : null}
                {editable && onEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() => onEdit(p)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit
                  </Button>
                ) : null}
                {p.viewerIsOwner && p.status === 'draft' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-red-700"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete draft
                  </Button>
                ) : null}
                {cancellable ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-red-700"
                    disabled={busy}
                    onClick={() => {
                      setReason('')
                      setAsking({ kind: 'cancel' })
                    }}
                  >
                    Cancel payment
                  </Button>
                ) : null}
              </div>
            )}
            {p.kind === 'vendor' &&
            p.status === 'rejected' &&
            p.viewerIsOwner ? (
              <p className={cn('text-xs', hintClassName)}>
                Edit it to send it again, or cancel it.
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
