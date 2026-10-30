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
import { apiFetch } from '#/lib/api'
import {
  PAYMENT_STAGE_LABELS,
  formatRupiah,
} from '#/lib/purchasing'
import type {
  PayablePurchaseOrder,
  PurchaseOrder,
  PurchaseOrderPayments,
  PurchasePayment,
  PurchasePaymentStage,
} from '#/lib/purchasing'
import { dialogInputClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type StageForm = {
  stage: PurchasePaymentStage
  basis: 'percent' | 'fixed'
  rate: string
  amount: string
  dueDate: string
  notes: string
  realizationIds: string[]
}

type VendorReceipt = {
  id: string
  number: string
  purchaseDate: string
  total: string
}

type Props = {
  /** 'new', a draft/rejected vendor payment to edit, or null when closed. */
  editing: PurchasePayment | 'new' | null
  onOpenChange: (open: boolean) => void
  onSaved: (payment: PurchasePayment) => void
}

function formFrom(p: PurchasePayment | null): StageForm {
  return {
    stage: p?.stage ?? 'dp',
    basis: p?.basis ?? 'percent',
    rate: p?.rate ?? '',
    amount: p && p.basis === 'fixed' ? p.amount : '',
    dueDate: p?.dueDate ?? '',
    notes: p?.notes ?? '',
    realizationIds: p?.realizations.map((r) => r.id) ?? [],
  }
}

/** Create or edit a vendor DP / termin / pelunasan stage from Finance → Payments. */
export default function VendorPaymentDialog({
  editing,
  onOpenChange,
  onSaved,
}: Props) {
  const existing = editing && editing !== 'new' ? editing : null
  const [payablePos, setPayablePos] = useState<PayablePurchaseOrder[]>([])
  const [orderId, setOrderId] = useState<string | null>(null)
  const [summary, setSummary] = useState<PurchaseOrderPayments | null>(null)
  const [vendorName, setVendorName] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [receipts, setReceipts] = useState<VendorReceipt[]>([])
  const [form, setForm] = useState<StageForm>(formFrom(null))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    setForm(formFrom(existing))
    setOrderId(existing?.purchaseOrderId ?? null)
    setVendorName(existing?.vendorName ?? '')
    setOrderNumber(existing?.purchaseOrderNumber ?? '')
    setSummary(null)
    setReceipts(existing?.realizations ?? [])
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
      if (!existing) {
        setSummary(null)
        setReceipts([])
      }
      return
    }
    const fromList = payablePos.find((p) => p.id === orderId)
    if (fromList) {
      setVendorName(fromList.vendorName)
      setOrderNumber(fromList.number)
      setSummary({
        purchaseOrderId: fromList.id,
        payable: fromList.payable,
        final: fromList.final,
        scheduledTotal: '0',
        paidTotal: '0',
        remaining: fromList.remaining,
        staffRealizedTotal: '0',
        payments: [],
      })
    }
    let cancelled = false
    void (async () => {
      try {
        const [payRes, orderRes] = await Promise.all([
          apiFetch<PurchaseOrderPayments>(
            `/purchasing/orders/${orderId}/payments`,
          ),
          apiFetch<PurchaseOrder>(`/purchasing/orders/${orderId}`),
        ])
        if (cancelled) return
        if (payRes.success) setSummary(payRes.data)
        else if (!fromList) {
          toast.error(payRes.message || 'Failed to load PO payments')
        }
        if (orderRes.success) {
          setVendorName(orderRes.data.vendorName)
          setOrderNumber(orderRes.data.number)
          setReceipts(
            orderRes.data.realizations
              .filter((r) => r.method === 'vendor' && r.status === 'posted')
              .map((r) => ({
                id: r.id,
                number: r.number,
                purchaseDate: r.purchaseDate,
                total: r.total,
              })),
          )
        }
      } catch {
        if (!cancelled && !fromList) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editing, orderId, existing, payablePos])

  async function save() {
    if (!orderId) {
      toast.error('Pick a purchase order')
      return
    }
    setBusy(true)
    try {
      const pelunasan = form.stage === 'pelunasan'
      const body = JSON.stringify({
        purchaseOrderId: orderId,
        stage: form.stage,
        basis: pelunasan ? null : form.basis,
        rate: form.basis === 'percent' ? form.rate : null,
        amount: form.basis === 'fixed' ? form.amount : '0',
        dueDate: form.dueDate || null,
        notes: form.notes,
        realizationIds: form.realizationIds,
      })
      const response = await apiFetch<PurchasePayment>(
        existing
          ? `/purchasing/payments/${existing.id}/vendor`
          : '/purchasing/payments/vendor',
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

  const payable = Number(summary?.payable ?? 0)
  const remaining = summary?.remaining ?? '0'
  const isFinal = summary?.final ?? false
  const preview =
    form.stage === 'pelunasan'
      ? null
      : form.basis === 'percent'
        ? Math.round((payable * Number(form.rate || 0)) / 100)
        : Number(form.amount || 0)

  const stageOptions = Object.entries(PAYMENT_STAGE_LABELS).map(
    ([value, label]) => ({
      value,
      label:
        value === 'pelunasan' && !isFinal && form.stage !== 'pelunasan'
          ? `${label} (when fully received)`
          : label,
    }),
  )

  const poOptions = payablePos.map((p) => ({
    value: p.id,
    label: `${p.number} · ${p.vendorName}`,
  }))
  if (
    existing?.purchaseOrderId &&
    !poOptions.some((o) => o.value === existing.purchaseOrderId)
  ) {
    poOptions.unshift({
      value: existing.purchaseOrderId,
      label: `${existing.purchaseOrderNumber ?? 'PO'} · ${existing.vendorName ?? 'Vendor'}`,
    })
  }

  const description =
    orderId && summary
      ? `${orderNumber} · ${vendorName}`
      : 'Pick a PO, then DP, termin, or pelunasan when fully received.'

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(next) => !next && !busy && onOpenChange(false)}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] overflow-x-hidden sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>
            {existing ? `Edit ${existing.number}` : 'New vendor payment'}
          </DialogTitle>
          <DialogDescription className="truncate" title={description}>
            {description}
          </DialogDescription>
          {orderId && summary ? (
            <p className={cn('text-xs tabular-nums', hintClassName)}>
              Payable {formatRupiah(summary.payable)}
              {summary.final ? '' : ' (estimate)'} ·{' '}
              {formatRupiah(remaining)} left
            </p>
          ) : null}
        </DialogHeader>
        <div className="min-w-0 space-y-3 overflow-x-hidden">
          <label className="block min-w-0 space-y-1">
            <span className="text-sm font-medium">Purchase order</span>
            <Combobox
              value={orderId ?? ''}
              onValueChange={(v) => {
                if (existing) return
                setOrderId(v || null)
                setForm(formFrom(null))
              }}
              options={poOptions}
              disabled={busy || Boolean(existing)}
              placeholder="Select a payable PO…"
              aria-label="Purchase order"
              className="w-full min-w-0"
            />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="text-sm font-medium">Stage</span>
            <Combobox
              value={form.stage}
              onValueChange={(v) => {
                if (!v) return
                const stage = v as PurchasePaymentStage
                if (stage === 'pelunasan' && !isFinal && form.stage !== 'pelunasan') {
                  toast.error('Pelunasan is available once the PO is fully received')
                  return
                }
                setForm({ ...form, stage })
              }}
              options={stageOptions}
              disabled={busy || !orderId}
              aria-label="Stage"
              className="w-full min-w-0"
            />
          </label>
          {form.stage === 'pelunasan' ? (
            <p className={cn('text-sm', hintClassName)}>
              {isFinal
                ? `Settles what is left: ${formatRupiah(remaining)}.`
                : 'Possible once everything on the PO is received.'}
            </p>
          ) : (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="block min-w-0 space-y-1">
                <span className="text-sm font-medium">Basis</span>
                <Combobox
                  value={form.basis}
                  onValueChange={(v) =>
                    v && setForm({ ...form, basis: v as 'percent' | 'fixed' })
                  }
                  options={[
                    { value: 'percent', label: 'Percent of payable' },
                    { value: 'fixed', label: 'Fixed amount' },
                  ]}
                  disabled={busy || !orderId}
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
                    disabled={busy || !orderId}
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
                    disabled={busy || !orderId}
                    onValueChange={(amount) => setForm({ ...form, amount })}
                  />
                </label>
              )}
            </div>
          )}
          {preview !== null && summary ? (
            <p className={cn('truncate text-xs tabular-nums', hintClassName)}>
              = {formatRupiah(String(preview))} · {formatRupiah(remaining)} left
            </p>
          ) : null}
          <label className="block min-w-0 space-y-1">
            <span className="text-sm font-medium">Due date</span>
            <input
              type="date"
              value={form.dueDate}
              disabled={busy || !orderId}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className={dialogInputClassName}
            />
          </label>
          {receipts.length > 0 ? (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">
                For receipts (optional)
              </legend>
              {receipts.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.realizationIds.includes(r.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        realizationIds: e.target.checked
                          ? [...form.realizationIds, r.id]
                          : form.realizationIds.filter((id) => id !== r.id),
                      })
                    }
                  />
                  <span className="tabular-nums">{r.number}</span>
                  <span className={cn('text-xs', hintClassName)}>
                    {r.purchaseDate} · {formatRupiah(r.total)}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="block min-w-0 space-y-1">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              rows={2}
              value={form.notes}
              disabled={busy || !orderId}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={dialogInputClassName}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={busy || !orderId}
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
