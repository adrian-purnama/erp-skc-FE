import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Camera,
  Check,
  Circle,
  CircleCheck,
  CircleX,
  FileDown,
  LoaderCircle,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import ProofFile from '#/components/forms/shared/ProofFile'
import { ListChip } from '#/components/forms/shared/ListTable'
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
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import { formatYmdLong } from '#/lib/quotation'
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
  /** Which reason box is open: rejecting or cancelling. */
  const [asking, setAsking] = useState<
    { kind: 'reject' } | { kind: 'cancel' } | null
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
        : await post('/cancel', 'Payment cancelled', body)
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
  // A rejected payment is edited and sent again.
  const editable =
    p?.viewerIsOwner && (p.status === 'draft' || p.status === 'rejected')
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 gap-1.5 text-xs"
                  onClick={() =>
                    void apiDownload(
                      `/purchasing/payments/${p.id}/pdf`,
                      `${p.number.replace(/\//g, '_')}.pdf`,
                    ).catch((e: unknown) =>
                      toast.error(
                        e instanceof Error ? e.message : 'Download failed',
                      ),
                    )
                  }
                >
                  <FileDown className="size-3.5" aria-hidden />
                  Bukti PDF
                </Button>
              </div>
              <DialogDescription>{paymentLabel(p)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              <p className="text-2xl font-semibold tabular-nums">
                {formatRupiah(p.amount)}
              </p>
              <p className={cn('text-sm', hintClassName)}>
                {p.stage === 'full'
                  ? 'Full payment'
                  : p.basis === 'percent' && p.rate
                    ? `${p.rate}% partial payment`
                    : 'Partial payment'}{' '}
                to <span className="text-(--ink)">{p.payeeName}</span>
                {p.dueDate ? ` · due ${formatYmdLong(p.dueDate)}` : ''}
              </p>
            </div>

            <PaymentSteps payment={p} />

            <dl className="divide-y divide-(--line) rounded-md border border-(--line) text-sm">
              <FactRow label="For">
                <Link
                  to="/dashboard/purchasing/orders/$orderId"
                  params={{ orderId: p.purchaseOrderId }}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                >
                  {p.purchaseOrderNumber}
                </Link>
                {p.vendorName ? (
                  <span className={hintClassName}> · {p.vendorName}</span>
                ) : null}
              </FactRow>
              {p.realizations.length > 0 ? (
                <FactRow label="Receipts">
                  {p.realizations.map((r) => r.number).join(', ')}
                </FactRow>
              ) : null}
              {p.invoices.length > 0 ? (
                <FactRow label="Invoices">
                  {p.invoices.map((i, idx) => (
                    <span key={i.id}>
                      {idx > 0 ? ', ' : ''}
                      <Link
                        to="/dashboard/purchasing/invoices/$invoiceId"
                        params={{ invoiceId: i.id }}
                        target="_blank"
                        rel="noreferrer"
                        className="tabular-nums underline-offset-4 hover:underline"
                      >
                        {i.number}
                      </Link>
                      {i.vendorInvoiceNumber
                        ? ` (${i.vendorInvoiceNumber})`
                        : ''}
                    </span>
                  ))}
                </FactRow>
              ) : null}
              <FactRow label="Requested by">{p.createdBy?.name ?? '—'}</FactRow>
              {p.notes ? (
                <FactRow label="Note">
                  <span className="whitespace-pre-line">{p.notes}</span>
                </FactRow>
              ) : null}
            </dl>

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
                {p.viewerCanApprove ? (
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

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2">
      <dt className={cn('text-xs leading-5', hintClassName)}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

type StepState = 'done' | 'current' | 'todo' | 'failed'

/** This payment's own path: request → level 1 → level 2 → paid. */
function PaymentSteps({ payment: p }: { payment: PurchasePayment }) {
  const cancelled = p.status === 'cancelled'
  const steps: Array<{ label: string; who: string; state: StepState }> = [
    {
      label: 'Requested',
      who: p.createdBy?.name ?? '—',
      state: p.status === 'draft' ? 'current' : 'done',
    },
    {
      label: 'Level 1',
      who: (p.approved1By ?? p.approver1)?.name ?? '—',
      state: p.approved1By
        ? 'done'
        : p.rejectedBy && p.approvalLevel !== 2
          ? 'failed'
          : p.status === 'pending_approval' && p.approvalLevel === 1
            ? 'current'
            : 'todo',
    },
    {
      label: 'Level 2',
      who: (p.approvedBy ?? p.approver2)?.name ?? '—',
      state: p.approvedBy
        ? 'done'
        : p.rejectedBy && p.approvalLevel === 2
          ? 'failed'
          : p.status === 'pending_approval' && p.approvalLevel === 2
            ? 'current'
            : 'todo',
    },
    {
      label: 'Paid',
      who:
        p.status === 'paid'
          ? `${p.paidDate ? formatYmdLong(p.paidDate) : ''}`
          : 'Finance',
      state:
        p.status === 'paid'
          ? 'done'
          : p.status === 'approved'
            ? 'current'
            : 'todo',
    },
  ]
  return (
    <ol
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-md border border-(--line) bg-(--line) sm:grid-cols-4',
        cancelled && 'opacity-60',
      )}
    >
      {steps.map((st) => (
        <li
          key={st.label}
          className={cn(
            'flex min-w-0 items-start gap-2 bg-(--background) px-3 py-2',
            st.state === 'current' && 'bg-(--surface)',
          )}
        >
          {st.state === 'done' ? (
            <CircleCheck
              className="mt-0.5 size-4 shrink-0 text-emerald-600"
              aria-hidden
            />
          ) : st.state === 'failed' ? (
            <CircleX
              className="mt-0.5 size-4 shrink-0 text-red-600"
              aria-hidden
            />
          ) : (
            <Circle
              className={cn(
                'mt-0.5 size-4 shrink-0',
                st.state === 'current' ? 'text-sky-600' : 'text-(--line)',
              )}
              aria-hidden
            />
          )}
          <div className="min-w-0">
            <p className="text-xs font-medium">{st.label}</p>
            <p className={cn('truncate text-xs', hintClassName)}>{st.who}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
