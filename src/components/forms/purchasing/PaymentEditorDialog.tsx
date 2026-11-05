import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { RupiahInput } from '#/components/ui/rupiah-input'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { PAYMENT_KIND_LABELS, formatRupiah } from '#/lib/purchasing'
import type {
  PayablePurchaseOrder,
  PaymentPayee,
  PurchaseOrderPayments,
  PurchasePayment,
  PurchasePaymentStage,
} from '#/lib/purchasing'
import { dialogInputClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type PaymentForm = {
  stage: PurchasePaymentStage
  basis: 'percent' | 'fixed'
  rate: string
  amount: string
  dueDate: string
  notes: string
  /** Vendor: invoice ids; reimburse: NR ids. */
  linkIds: string[]
}

type Props = {
  /** 'new', a draft/rejected payment to edit, or null when closed. */
  editing: PurchasePayment | 'new' | null
  onOpenChange: (open: boolean) => void
  onSaved: (payment: PurchasePayment) => void
}

/** 'vendor', or the staff member's user id. */
function payeeKeyOf(p: { kind: string; payeeUserId: string | null }): string {
  return p.kind === 'vendor' ? 'vendor' : (p.payeeUserId ?? '')
}

function formFrom(p: PurchasePayment | null): PaymentForm {
  return {
    stage: p?.stage ?? 'partial',
    basis: p?.basis ?? 'percent',
    rate: p?.rate ?? '',
    amount: p && p.basis === 'fixed' ? p.amount : '',
    dueDate: p?.dueDate ?? '',
    notes: p?.notes ?? '',
    linkIds:
      p?.kind === 'vendor'
        ? p.invoices.map((i) => i.id)
        : (p?.realizations.map((r) => r.id) ?? []),
  }
}

/**
 * One payment on one PO: pick the PO, who to pay (its vendor, or a staff
 * member paid back for their NR), partial or full, and optionally the GR / NR
 * it pays for.
 */
export default function PaymentEditorDialog({
  editing,
  onOpenChange,
  onSaved,
}: Props) {
  const { can } = useAuth()
  const canVendor = can('purchasing.manage')
  const canReimburse = can('purchasing.realize')
  const existing = editing && editing !== 'new' ? editing : null
  const [payablePos, setPayablePos] = useState<PayablePurchaseOrder[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [summary, setSummary] = useState<PurchaseOrderPayments | null>(null)
  const [payeeKey, setPayeeKey] = useState<string | null>(null)
  const [form, setForm] = useState<PaymentForm>(formFrom(null))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    setForm(formFrom(existing))
    setOrderId(existing?.purchaseOrderId ?? null)
    setPayeeKey(existing ? payeeKeyOf(existing) : null)
    setSummary(null)
    void (async () => {
      try {
        const response = await apiFetch<PayablePurchaseOrder[]>(
          '/purchasing/orders/payable',
        )
        if (response.success) setPayablePos(response.data)
      } catch {
        toast.error('Unable to reach the server')
      }
    })()
    // Load once per open; `existing` is derived from `editing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (!editing || !orderId) {
      setSummary(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<PurchaseOrderPayments>(
          `/purchasing/orders/${orderId}/payments`,
        )
        if (cancelled) return
        if (response.success) setSummary(response.data)
        else toast.error(response.message || 'Failed to load PO payments')
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, orderId])

  const payee: PaymentPayee | null =
    summary?.payees.find((p) => payeeKeyOf(p) === payeeKey) ?? null
  const allowed = (p: PaymentPayee) =>
    p.kind === 'vendor' ? canVendor : canReimburse
  /** What is left for a payee, counting this draft's own amount back in. */
  const leftFor = (p: PaymentPayee) =>
    Number(p.remaining) +
    (existing?.status === 'draft' && payeeKeyOf(existing) === payeeKeyOf(p)
      ? Number(existing.amount)
      : 0)

  async function save() {
    if (!orderId || !payee) {
      toast.error(orderId ? 'Pick who to pay' : 'Pick a purchase order')
      return
    }
    setBusy(true)
    try {
      const full = form.stage === 'full'
      const body = JSON.stringify({
        purchaseOrderId: orderId,
        payeeUserId: payee.payeeUserId,
        stage: form.stage,
        basis: full ? null : form.basis,
        rate: !full && form.basis === 'percent' ? form.rate : null,
        amount: !full && form.basis === 'fixed' ? form.amount : '0',
        dueDate: form.dueDate || null,
        notes: form.notes,
        realizationIds: payee.kind === 'reimburse' ? form.linkIds : [],
        invoiceIds: payee.kind === 'vendor' ? form.linkIds : [],
      })
      const response = await apiFetch<PurchasePayment>(
        existing
          ? `/purchasing/payments/${existing.id}/${payee.kind}`
          : `/purchasing/payments/${payee.kind}`,
        { method: existing ? 'PUT' : 'POST', body },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to save payment')
        return
      }
      toast.success(existing ? 'Payment saved' : 'Payment saved as draft')
      onSaved(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  const left = payee ? leftFor(payee) : 0
  const preview =
    !payee || form.stage === 'full'
      ? null
      : form.basis === 'percent'
        ? Math.round((Number(payee.owed) * Number(form.rate || 0)) / 100)
        : Number(form.amount || 0)

  const poOptions = payablePos.map((p) => ({
    value: p.id,
    label: `${p.number} · ${p.vendorName} · ${formatRupiah(p.remaining)} left`,
  }))
  if (existing && !poOptions.some((o) => o.value === existing.purchaseOrderId)) {
    poOptions.unshift({
      value: existing.purchaseOrderId,
      label: `${existing.purchaseOrderNumber} · ${existing.vendorName ?? 'Vendor'}`,
    })
  }

  const description = summary
    ? `${summary.purchaseOrderNumber} · ${summary.vendorName} · ${formatRupiah(summary.remaining)} left of ${formatRupiah(summary.owedTotal)}`
    : 'Pick a PO, who to pay, then partial or full.'
  const linkOptions = !payee
    ? []
    : payee.kind === 'vendor'
      ? payee.invoices.map((i) => ({
          id: i.id,
          label: i.number,
          hint: `${i.vendorInvoiceNumber || 'no vendor no.'} · ${i.invoiceDate} · ${formatRupiah(i.total)}`,
        }))
      : payee.realizations.map((r) => ({
          id: r.id,
          label: r.number,
          hint: `${r.purchaseDate} · ${formatRupiah(r.total)}`,
        }))

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(next) => !next && !busy && onOpenChange(false)}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>
            {existing ? `Edit ${existing.number}` : 'New payment'}
          </DialogTitle>
          <DialogDescription className="truncate" title={description}>
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3 overflow-x-hidden">
          <label className="block min-w-0 space-y-1">
            <span className="text-sm font-medium">1. Purchase order</span>
            <Combobox
              value={orderId ?? ''}
              onValueChange={(v) => {
                if (existing) return
                setOrderId(v || null)
                setPayeeKey(null)
                setForm(formFrom(null))
              }}
              options={poOptions}
              disabled={busy || Boolean(existing)}
              placeholder="Select a PO with something left to pay…"
              aria-label="Purchase order"
              className="w-full min-w-0"
            />
          </label>

          {summary ? (
            <fieldset className="min-w-0 space-y-1">
              <legend className="text-sm font-medium">2. Pay to</legend>
              {summary.payees.map((p) => {
                const key = payeeKeyOf(p)
                const pLeft = leftFor(p)
                const disabled =
                  busy ||
                  Boolean(existing) ||
                  !allowed(p) ||
                  (pLeft <= 0 && key !== payeeKey)
                return (
                  <label
                    key={key}
                    className={cn(
                      'flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-sm',
                      key === payeeKey
                        ? 'border-(--ink) bg-(--surface)'
                        : 'border-(--line)',
                      disabled && key !== payeeKey && 'opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="payee"
                      className="mt-1"
                      checked={key === payeeKey}
                      disabled={disabled}
                      onChange={() => {
                        setPayeeKey(key)
                        setForm({ ...form, linkIds: [] })
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatRupiah(String(pLeft))} left
                        </span>
                      </span>
                      <span
                        className={cn(
                          'block truncate text-xs tabular-nums',
                          hintClassName,
                        )}
                      >
                        {PAYMENT_KIND_LABELS[p.kind]} · owed{' '}
                        {formatRupiah(p.owed)}
                        {p.final ? '' : ' (PO estimate)'} · paid{' '}
                        {formatRupiah(p.paidTotal)}
                        {allowed(p) ? '' : ' · no permission'}
                      </span>
                    </span>
                  </label>
                )
              })}
              {summary.payees.length === 1 ? (
                <p className={cn('text-xs', hintClassName)}>
                  Staff appear here once they have a posted Nota Realisasi on
                  this PO.
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {payee ? (
            <>
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-medium">3. Amount</span>
                <Combobox
                  value={form.stage}
                  onValueChange={(v) =>
                    v && setForm({ ...form, stage: v as PurchasePaymentStage })
                  }
                  options={[
                    { value: 'partial', label: 'Partial' },
                    {
                      value: 'full',
                      label: `Full (${formatRupiah(String(left))})`,
                    },
                  ]}
                  disabled={busy}
                  aria-label="Partial or full"
                  className="w-full min-w-0"
                />
              </label>
              {form.stage === 'full' ? (
                <p className={cn('text-sm', hintClassName)}>
                  Pays everything left to {payee.name}:{' '}
                  {formatRupiah(String(left))}.
                  {payee.final
                    ? ''
                    : ' Based on the PO estimate: if the GR comes in higher, the difference can be paid later.'}
                </p>
              ) : (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <label className="block min-w-0 space-y-1">
                    <span className="text-sm font-medium">Basis</span>
                    <Combobox
                      value={form.basis}
                      onValueChange={(v) =>
                        v &&
                        setForm({ ...form, basis: v as 'percent' | 'fixed' })
                      }
                      options={[
                        { value: 'percent', label: 'Percent of owed' },
                        { value: 'fixed', label: 'Fixed amount' },
                      ]}
                      disabled={busy}
                      aria-label="Basis"
                      className="w-full min-w-0"
                    />
                  </label>
                  {form.basis === 'percent' ? (
                    <label className="block min-w-0 space-y-1">
                      <span className="text-sm font-medium">Percent</span>
                      <input
                        inputMode="decimal"
                        value={form.rate}
                        placeholder="30"
                        disabled={busy}
                        onChange={(e) =>
                          setForm({ ...form, rate: e.target.value })
                        }
                        className={dialogInputClassName}
                      />
                    </label>
                  ) : (
                    <label className="block min-w-0 space-y-1">
                      <span className="text-sm font-medium">Amount</span>
                      <RupiahInput
                        value={form.amount}
                        disabled={busy}
                        onValueChange={(amount) => setForm({ ...form, amount })}
                      />
                    </label>
                  )}
                </div>
              )}
              {preview !== null ? (
                <p className={cn('truncate text-xs tabular-nums', hintClassName)}>
                  = {formatRupiah(String(preview))} · {formatRupiah(String(left))}{' '}
                  left
                </p>
              ) : null}

              {linkOptions.length > 0 ? (
                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium">
                    {payee.kind === 'vendor'
                      ? 'For vendor invoice (optional)'
                      : 'For NR (optional)'}
                  </legend>
                  {linkOptions.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.linkIds.includes(o.id)}
                        disabled={busy}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            linkIds: e.target.checked
                              ? [...form.linkIds, o.id]
                              : form.linkIds.filter((id) => id !== o.id),
                          })
                        }
                      />
                      <span className="tabular-nums">{o.label}</span>
                      <span className={cn('truncate text-xs', hintClassName)}>
                        {o.hint}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : payee.kind === 'vendor' ? (
                <p className={cn('text-xs', hintClassName)}>
                  No posted vendor invoice on this PO yet (fine for a DP).
                </p>
              ) : null}

              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-medium">Due date</span>
                <input
                  type="date"
                  value={form.dueDate}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  className={dialogInputClassName}
                />
              </label>
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  disabled={busy}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={dialogInputClassName}
                />
              </label>
            </>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={busy || !payee}
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
