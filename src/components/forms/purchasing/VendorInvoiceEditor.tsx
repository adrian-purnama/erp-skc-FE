import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Camera,
  CheckCheck,
  FileDown,
  LoaderCircle,
  Trash2,
} from 'lucide-react'
import ChargesEditor, {
  chargeStatesFrom,
  priceCharges,
  type ChargeState,
} from '#/components/forms/purchasing/ChargesEditor'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import ListTable, { type ListTableColumn } from '#/components/forms/shared/ListTable'
import ProofFile from '#/components/forms/shared/ProofFile'
import PurchaseFlowHeader from '#/components/forms/shared/PurchaseFlowHeader'
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
import { RupiahInput } from '#/components/ui/rupiah-input'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  PAYMENT_STATUS_LABELS,
  VENDOR_INVOICE_STATUS_LABELS,
  formatRupiah,
  formatRupiahDiff,
  parseQty,
} from '#/lib/purchasing'
import type {
  InvoiceableReceipt,
  VendorInvoice,
  VendorInvoiceLine,
  VendorInvoicePlan,
} from '#/lib/purchasing'
import {
  buttonOutlineClassName,
  dialogInputClassName,
  hintClassName,
  inputClassName,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  /** Existing invoice; omit for a new one. */
  invoiceId?: string
  /** New invoice: its PO, and optionally the GR it starts from. */
  orderId?: string
  receiptId?: string
}

type PriceState = { unitPrice: string; note: string }
type EditLine = InvoiceableReceipt['lines'][number] & { receiptNumber: string }

function amountOf(qty: string, price: string): number {
  const q = parseQty(qty)
  const p = Number(price)
  if (q === null || !Number.isFinite(p)) return 0
  return Math.round(q * p)
}

function diffClass(n: number): string {
  if (n > 0) return 'text-red-700 dark:text-red-300'
  if (n < 0) return 'text-emerald-700 dark:text-emerald-300'
  return 'text-(--muted)'
}

/**
 * A vendor invoice: which GRs of one PO it bills, the invoiced price per line
 * and the charges. Posting it prices those GRs everywhere (cost, payments).
 */
export default function VendorInvoiceEditor({ invoiceId, orderId, receiptId }: Props) {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canRealize = can('purchasing.realize')
  const [doc, setDoc] = useState<VendorInvoice | null>(null)
  const [plan, setPlan] = useState<VendorInvoicePlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [prices, setPrices] = useState<Record<string, PriceState>>({})
  const [charges, setCharges] = useState<ChargeState[]>([])
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(jakartaDateKey(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<'post' | 'void' | 'delete' | null>(null)
  const [reason, setReason] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const apply = useCallback((next: VendorInvoice) => {
    setDoc(next)
    setPicked(next.receipts.map((r) => r.id))
    setPrices(
      Object.fromEntries(
        next.lines.map((l) => [l.realizationLineId, { unitPrice: l.unitPrice, note: l.note }]),
      ),
    )
    setCharges(chargeStatesFrom(next.charges))
    setVendorInvoiceNumber(next.vendorInvoiceNumber)
    setInvoiceDate(next.invoiceDate)
    setDueDate(next.dueDate ?? '')
    setNotes(next.notes)
  }, [])

  const loadPlan = useCallback(async (poId: string, exceptId?: string) => {
    const qs = new URLSearchParams({ purchaseOrderId: poId })
    if (exceptId) qs.set('exceptId', exceptId)
    const response = await apiFetch<VendorInvoicePlan>(`/purchasing/invoices/plan?${qs.toString()}`)
    if (!response.success) {
      toast.error(response.message || 'Failed to load the PO receipts')
      return null
    }
    setPlan(response.data)
    return response.data
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        if (invoiceId) {
          const response = await apiFetch<VendorInvoice>(`/purchasing/invoices/${invoiceId}`)
          if (cancelled) return
          if (!response.success) {
            toast.error(response.message || 'Failed to load the invoice')
            return
          }
          apply(response.data)
          if (canRealize && response.data.status !== 'voided') {
            await loadPlan(response.data.purchaseOrderId, response.data.id)
          }
        } else if (orderId) {
          const next = await loadPlan(orderId)
          if (cancelled || !next) return
          const start = receiptId && next.receipts.some((r) => r.id === receiptId)
          setPicked(start ? [receiptId] : next.receipts.map((r) => r.id))
          setPrices(
            Object.fromEntries(
              next.receipts.flatMap((r) =>
                r.lines.map((l) => [l.realizationLineId, { unitPrice: l.poPrice, note: '' }]),
              ),
            ),
          )
          setCharges(chargeStatesFrom(next.estimatedCharges))
        }
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [invoiceId, orderId, receiptId, apply, loadPlan, canRealize])

  const isNew = !invoiceId
  const editable =
    canRealize &&
    plan !== null &&
    (isNew || doc?.status === 'draft' || (doc?.status === 'posted' && !doc.lockedBy))

  // ---- Derived ----
  const editLines: EditLine[] = (plan?.receipts ?? [])
    .filter((r) => picked.includes(r.id))
    .flatMap((r) => r.lines.map((l) => ({ ...l, receiptNumber: r.number })))
  const priceOf = (l: EditLine) =>
    prices[l.realizationLineId] ?? { unitPrice: l.poPrice, note: '' }
  const issues = new Map<string, string>()
  let subtotal = 0
  let poValue = 0
  for (const l of editLines) {
    const p = priceOf(l)
    if (!(Number(p.unitPrice) > 0)) issues.set(l.realizationLineId, 'Enter the invoiced price')
    subtotal += amountOf(l.qty, p.unitPrice)
    poValue += amountOf(l.qty, l.poPrice)
  }
  const { payload: chargePayload, issues: chargeIssues, total: chargesTotal } = priceCharges(
    charges,
    subtotal,
  )
  const grandTotal = subtotal + chargesTotal
  const formErrors: string[] = []
  if (picked.length === 0) formErrors.push('Pick at least one goods receipt')
  if (!invoiceDate) formErrors.push('Set the invoice date')
  if (chargeIssues.size > 0) formErrors.push('Fix the charges')
  const canSave = formErrors.length === 0 && issues.size === 0

  async function send<T>(path: string, init: RequestInit): Promise<T | null> {
    try {
      const response = await apiFetch<T>(path, init)
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

  async function save(): Promise<VendorInvoice | null> {
    setShowErrors(true)
    if (!canSave || !plan) {
      toast.error('Fix the highlighted fields first')
      return null
    }
    const realizationIds = plan.receipts.filter((r) => picked.includes(r.id)).map((r) => r.id)
    const body = JSON.stringify({
      purchaseOrderId: plan.purchaseOrderId,
      vendorInvoiceNumber,
      invoiceDate,
      dueDate: dueDate || null,
      notes,
      realizationIds,
      lines: editLines.map((l) => ({
        realizationLineId: l.realizationLineId,
        unitPrice: priceOf(l).unitPrice,
        note: priceOf(l).note,
      })),
      charges: chargePayload,
    })
    const saved = await send<VendorInvoice>(
      doc ? `/purchasing/invoices/${doc.id}` : '/purchasing/invoices',
      { method: doc ? 'PUT' : 'POST', body },
    )
    if (!saved) return null
    if (!doc) {
      void navigate({
        to: '/dashboard/purchasing/invoices/$invoiceId',
        params: { invoiceId: saved.id },
        replace: true,
      })
    } else {
      apply(saved)
    }
    return saved
  }

  async function onSave() {
    setBusy(true)
    try {
      const saved = await save()
      if (saved) toast.success(doc?.status === 'posted' ? 'Invoice saved; receipts re-priced' : 'Invoice saved')
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirm || !doc) return
    setBusy(true)
    try {
      if (confirm === 'post') {
        const saved = await save()
        if (!saved) return
        const posted = await send<VendorInvoice>(`/purchasing/invoices/${saved.id}/post`, { method: 'POST' })
        if (posted) {
          apply(posted)
          toast.success('Invoice posted; its receipts are now priced by it')
          setConfirm(null)
        }
      } else if (confirm === 'void') {
        const voided = await send<VendorInvoice>(`/purchasing/invoices/${doc.id}/void`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        })
        if (voided) {
          apply(voided)
          toast.success('Invoice voided; its receipts are back at the PO price')
          setConfirm(null)
        }
      } else {
        try {
          const response = await apiFetch<null>(`/purchasing/invoices/${doc.id}`, { method: 'DELETE' })
          if (!response.success) {
            toast.error(response.message || 'Failed to delete the draft')
            return
          }
          toast.success('Draft deleted')
          void navigate({ to: '/dashboard/purchasing/invoices' })
        } catch {
          toast.error('Unable to reach the server')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function onFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setUploading(true)
    try {
      const target = doc ?? (await save())
      if (!target) return
      const form = new FormData()
      for (const f of files) form.append('files', f)
      const response = await apiUpload<VendorInvoice>(`/purchasing/invoices/${target.id}/files`, form)
      if (!response.success) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(files.length === 1 ? 'File added' : `${files.length} files added`)
      if (doc) apply(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function removeFile(fileId: string) {
    if (!doc) return
    setBusy(true)
    try {
      const next = await send<VendorInvoice>(`/purchasing/invoices/${doc.id}/files/${fileId}`, {
        method: 'DELETE',
      })
      if (next) apply(next)
    } finally {
      setBusy(false)
    }
  }

  // ---- Columns ----
  const editColumns: ListTableColumn<EditLine>[] = [
    {
      header: 'Material',
      cell: (l) => {
        const issue = showErrors ? issues.get(l.realizationLineId) : undefined
        const diff = amountOf(l.qty, priceOf(l).unitPrice) - amountOf(l.qty, l.poPrice)
        return (
          <div className="min-w-0 py-0.5">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs text-(--muted)">{l.materialCode}</span>
              <span className="truncate">{l.materialName}</span>
            </div>
            <p className={cn('text-xs tabular-nums', hintClassName)}>
              {l.receiptNumber} · PO price {formatRupiah(l.poPrice)}
            </p>
            {diff !== 0 || priceOf(l).note ? (
              <input
                value={priceOf(l).note}
                disabled={busy}
                placeholder="Why the price differs (optional)"
                aria-label={`Note for ${l.materialName}`}
                onChange={(e) =>
                  setPrices((prev) => ({
                    ...prev,
                    [l.realizationLineId]: { ...priceOf(l), note: e.target.value },
                  }))
                }
                className={cn(inputClassName, 'mt-1 h-8 w-full max-w-md')}
              />
            ) : null}
            {issue ? <p className="mt-1 text-xs text-red-600">{issue}</p> : null}
          </div>
        )
      },
    },
    {
      header: 'Qty',
      align: 'right',
      widthClassName: 'w-28',
      cell: (l) => (
        <span className="whitespace-nowrap">
          {l.qty} {l.uomSymbol}
        </span>
      ),
    },
    {
      header: 'Invoiced price',
      align: 'right',
      widthClassName: 'w-44',
      cell: (l) => (
        <RupiahInput
          value={priceOf(l).unitPrice}
          onValueChange={(digits) =>
            setPrices((prev) => ({
              ...prev,
              [l.realizationLineId]: { ...priceOf(l), unitPrice: digits },
            }))
          }
          disabled={busy}
          aria-label={`Invoiced price of ${l.materialName}`}
          className="h-8 text-right"
        />
      ),
    },
    {
      header: 'Amount',
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'font-medium',
      cell: (l) => formatRupiah(String(amountOf(l.qty, priceOf(l).unitPrice))),
    },
    {
      header: 'vs PO',
      align: 'right',
      widthClassName: 'w-32',
      cell: (l) => {
        const diff = amountOf(l.qty, priceOf(l).unitPrice) - amountOf(l.qty, l.poPrice)
        return <span className={cn('text-xs', diffClass(diff))}>{formatRupiahDiff(String(diff))}</span>
      },
    },
  ]

  const viewColumns: ListTableColumn<VendorInvoiceLine>[] = [
    {
      header: 'Material',
      cell: (l) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-xs text-(--muted)">{l.materialCode}</span>
            <span className="truncate">{l.materialName}</span>
          </div>
          <p className={cn('text-xs tabular-nums', hintClassName)}>
            {l.realizationNumber}
            {l.note ? ` · “${l.note}”` : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Qty',
      align: 'right',
      widthClassName: 'w-28',
      cell: (l) => (
        <span className="whitespace-nowrap">
          {l.qty} {l.uomSymbol}
        </span>
      ),
    },
    {
      header: 'PO price',
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'text-(--muted)',
      cell: (l) => formatRupiah(l.poPrice),
    },
    {
      header: 'Invoiced price',
      align: 'right',
      widthClassName: 'w-36',
      cell: (l) => formatRupiah(l.unitPrice),
    },
    {
      header: 'Amount',
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'font-medium',
      cell: (l) => formatRupiah(l.amount),
    },
    {
      header: 'vs PO',
      align: 'right',
      widthClassName: 'w-32',
      cell: (l) => (
        <span className={cn('text-xs', diffClass(Number(l.difference)))}>
          {formatRupiahDiff(l.difference)}
        </span>
      ),
    },
  ]

  // ---- Render ----
  const backLink = (
    <Link
      to="/dashboard/purchasing/invoices"
      className={cn(buttonOutlineClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Vendor invoices
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
  if ((invoiceId && !doc) || (isNew && !plan)) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>
          {isNew
            ? 'Open a PO with posted goods receipts to enter its vendor invoice.'
            : 'This vendor invoice could not be loaded.'}
        </p>
      </div>
    )
  }

  const poId = doc?.purchaseOrderId ?? plan?.purchaseOrderId ?? ''
  const poNumber = doc?.poNumber ?? plan?.poNumber ?? ''
  const vendorName = doc?.vendorName ?? plan?.vendorName ?? ''
  const files = doc?.files ?? []
  const sameNumberTotal =
    doc && doc.sameNumber.length > 0
      ? doc.sameNumber.reduce((s, x) => s + Number(x.total), Number(doc.total))
      : 0

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {doc ? doc.number : 'New vendor invoice'}
          </h1>
          {doc ? <RealizationStatusChip status={doc.status} /> : null}
          <div className="ml-auto flex items-center gap-2">
            {doc ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() =>
                  void apiDownload(
                    `/purchasing/invoices/${doc.id}/pdf`,
                    `${doc.number.replace(/\//g, '_')}.pdf`,
                  ).catch((e: unknown) =>
                    toast.error(e instanceof Error ? e.message : 'Download failed'),
                  )
                }
              >
                <FileDown className="size-3.5" aria-hidden />
                Tanda terima PDF
              </Button>
            ) : null}
          </div>
        </div>
        {doc ? <PurchaseFlowHeader key={`${doc.id}:${doc.status}`} kind="invoice" id={doc.id} /> : null}
        <p className="text-sm">
          For{' '}
          <Link
            to="/dashboard/purchasing/orders/$orderId"
            params={{ orderId: poId }}
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            {poNumber}
          </Link>
          <span className={hintClassName}> · {vendorName}</span>
        </p>
        {doc?.lockedBy ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Payment {doc.lockedBy.number} is approved for these receipts, so this invoice can no
            longer change. Cancel that payment first to correct it.
          </p>
        ) : null}
        {doc && doc.payments.length > 0 ? (
          <p className="text-sm">
            Paid by{' '}
            {doc.payments.map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ', ' : ''}
                <Link
                  to="/dashboard/finance/payments"
                  search={{ payment: p.id }}
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                >
                  {p.number}
                </Link>
                <span className={hintClassName}>
                  {' '}
                  ({formatRupiah(p.amount)}, {PAYMENT_STATUS_LABELS[p.status].toLowerCase()})
                </span>
              </span>
            ))}
          </p>
        ) : null}
        {doc?.status === 'voided' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Voided by {doc.voidedBy?.name ?? 'Unknown'}: {doc.voidReason}
          </p>
        ) : null}
        {doc && doc.sameNumber.length > 0 ? (
          <div className="rounded-md border border-(--line) px-3 py-2 text-sm">
            <p>
              Vendor invoice no. <span className="font-medium">{doc.vendorInvoiceNumber}</span> is
              also on:
            </p>
            <ul className={cn('mt-1 space-y-0.5 text-xs tabular-nums', hintClassName)}>
              {doc.sameNumber.map((x) => (
                <li key={x.id}>
                  <Link
                    to="/dashboard/purchasing/invoices/$invoiceId"
                    params={{ invoiceId: x.id }}
                    className="underline-offset-4 hover:underline"
                  >
                    {x.number}
                  </Link>{' '}
                  · {x.poNumber} · {formatRupiah(x.total)} · {VENDOR_INVOICE_STATUS_LABELS[x.status]}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Together {formatRupiah(String(sameNumberTotal))}: check it matches the paper bill.
            </p>
          </div>
        ) : null}
      </div>

      {editable && plan ? (
        <>
          <section className="grid max-w-3xl gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Vendor invoice no.</span>
              <input
                value={vendorInvoiceNumber}
                disabled={busy}
                placeholder="As printed on the bill"
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                className={cn(inputClassName, 'w-full')}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Invoice date</span>
              <input
                type="date"
                value={invoiceDate}
                disabled={busy}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className={cn(inputClassName, 'w-full', showErrors && !invoiceDate && 'border-red-500')}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Due date <span className={cn('font-normal', hintClassName)}>(optional)</span>
              </span>
              <input
                type="date"
                value={dueDate}
                disabled={busy}
                onChange={(e) => setDueDate(e.target.value)}
                className={cn(inputClassName, 'w-full')}
              />
            </label>
          </section>

          <section className="space-y-2">
            <h2 className={sectionTitleClassName}>Goods receipts on this bill</h2>
            {plan.receipts.length === 0 ? (
              <p className={cn('text-sm', hintClassName)}>
                This PO has no posted goods receipt without an invoice.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {plan.receipts.map((r) => (
                  <label
                    key={r.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                      picked.includes(r.id) ? 'border-(--ink) bg-(--surface)' : 'border-(--line)',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked.includes(r.id)}
                      disabled={busy}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                        )
                      }
                    />
                    <span className="tabular-nums">{r.number}</span>
                    <span className={cn('text-xs', hintClassName)}>
                      {r.purchaseDate}
                      {r.deliveryNoteNumber ? ` · SJ ${r.deliveryNoteNumber}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className={sectionTitleClassName}>Invoiced prices</h2>
              <p className={cn('text-sm', hintClassName)}>
                Prefilled with the PO price. Change any line the vendor billed differently.
              </p>
            </div>
            <ListTable<EditLine>
              rows={editLines}
              rowKey={(l) => l.realizationLineId}
              empty="Pick a goods receipt above."
              minWidthClassName="min-w-[820px]"
              columns={editColumns}
            />
          </section>

          <ChargesEditor
            rows={charges}
            onChange={setCharges}
            subtotal={subtotal}
            disabled={busy}
            showErrors={showErrors}
            hint="PPN, ongkir and other costs on this bill. Prefilled from the PO estimate; change them to what the vendor charged."
            footer={
              <p className="text-sm tabular-nums">
                Goods {formatRupiah(String(subtotal))}
                <span className={cn('ml-1 text-xs', diffClass(subtotal - poValue))}>
                  ({formatRupiahDiff(String(subtotal - poValue))} vs PO)
                </span>
                {' + charges '}
                {formatRupiah(String(chargesTotal))} ={' '}
                <span className="font-semibold">{formatRupiah(String(grandTotal))}</span>
              </p>
            }
          />

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className={sectionTitleClassName}>Files</h2>
                <p className={cn('text-sm', hintClassName)}>
                  Photo or PDF of the vendor's invoice (optional). Photos print on the tanda terima.
                </p>
              </div>
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
                disabled={busy || uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Camera className="size-3.5" aria-hidden />
                )}
                Add files
              </Button>
            </div>
            {files.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {files.map((f) => (
                  <ProofFile
                    key={f.id}
                    path={`/purchasing/invoices/${doc!.id}/files/${f.id}`}
                    photo={f}
                    disabled={busy}
                    onRemove={() => void removeFile(f.id)}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <label className="block max-w-2xl space-y-1">
            <span className={sectionTitleClassName}>Notes</span>
            <textarea
              rows={2}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClassName, 'w-full')}
            />
          </label>

          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
            <div className="text-sm">
              <span className={hintClassName}>Invoice total </span>
              <span className="font-semibold tabular-nums">{formatRupiah(String(grandTotal))}</span>
              {showErrors && (formErrors.length > 0 || issues.size > 0) ? (
                <p className="text-xs text-red-600">
                  {[
                    ...formErrors,
                    ...(issues.size > 0 ? [`${issues.size} ${issues.size === 1 ? 'line needs' : 'lines need'} a price`] : []),
                  ].join(' · ')}
                </p>
              ) : doc?.status === 'posted' ? (
                <p className={cn('text-xs', hintClassName)}>
                  Posted: saving re-prices its receipts and what the vendor is owed.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {doc?.status === 'draft' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-700"
                  disabled={busy}
                  onClick={() => setConfirm('delete')}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete draft
                </Button>
              ) : null}
              {doc?.status === 'posted' ? (
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
                  Void
                </Button>
              ) : null}
              <Button
                type="button"
                variant={doc?.status === 'posted' ? 'default' : 'outline'}
                size="sm"
                disabled={busy || uploading}
                onClick={() => void onSave()}
              >
                {doc?.status === 'posted' ? 'Save changes' : 'Save draft'}
              </Button>
              {doc?.status !== 'posted' ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || uploading || !doc}
                  title={doc ? undefined : 'Save the draft first'}
                  onClick={() => {
                    setShowErrors(true)
                    if (canSave) setConfirm('post')
                    else toast.error('Fix the highlighted fields first')
                  }}
                >
                  <CheckCheck className="size-3.5" aria-hidden />
                  Post invoice
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : doc ? (
        <>
          <section className="grid max-w-3xl gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className={cn('text-xs', hintClassName)}>Vendor invoice no.</p>
              <p>{doc.vendorInvoiceNumber || '—'}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Invoice date</p>
              <p className="tabular-nums">{doc.invoiceDate}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Due date</p>
              <p className="tabular-nums">{doc.dueDate ?? '—'}</p>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>Invoiced prices</h2>
            <ListTable<VendorInvoiceLine>
              rows={doc.lines}
              rowKey={(l) => l.id}
              empty="No lines."
              minWidthClassName="min-w-[760px]"
              columns={viewColumns}
            />
            <div className="ml-auto max-w-sm space-y-1 text-sm tabular-nums">
              <p className="flex justify-between">
                <span className={hintClassName}>Goods</span>
                <span>{formatRupiah(doc.subtotal)}</span>
              </p>
              {doc.charges.map((c) => (
                <p key={c.id} className="flex justify-between">
                  <span className={hintClassName}>
                    {c.label}
                    {c.kind === 'percent' ? ` (${c.rate}%)` : ''}
                  </span>
                  <span>{formatRupiah(c.amount)}</span>
                </p>
              ))}
              <p className="flex justify-between border-t border-(--line) pt-1 font-semibold">
                <span>Total</span>
                <span>{formatRupiah(doc.total)}</span>
              </p>
            </div>
          </section>
          {files.length > 0 ? (
            <section className="space-y-3">
              <h2 className={sectionTitleClassName}>Files</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {files.map((f) => (
                  <ProofFile key={f.id} path={`/purchasing/invoices/${doc.id}/files/${f.id}`} photo={f} />
                ))}
              </div>
            </section>
          ) : null}
          {doc.notes ? <p className="text-sm whitespace-pre-line">{doc.notes}</p> : null}
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
              {confirm === 'post'
                ? `Post ${doc?.number}?`
                : confirm === 'void'
                  ? `Void ${doc?.number}?`
                  : `Delete draft ${doc?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'post'
                ? `${formatRupiah(String(grandTotal))} for ${picked.length} ${picked.length === 1 ? 'receipt' : 'receipts'}. Their cost and what the vendor is owed follow this invoice from now on.`
                : confirm === 'void'
                  ? 'Its receipts go back to the PO price and can be invoiced again.'
                  : 'The draft and its files are removed; its receipts can be invoiced again.'}
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
              variant={confirm === 'post' ? 'default' : 'destructive'}
              disabled={busy || (confirm === 'void' && !reason.trim())}
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {confirm === 'post' ? 'Post' : confirm === 'void' ? 'Void' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
