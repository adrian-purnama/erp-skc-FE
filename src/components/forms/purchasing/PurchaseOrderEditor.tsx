import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Check,
  FileText,
  Plus,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  LineFlagBadge,
  PurchaseOrderStatusChip,
  RealizationStatusChip,
} from '#/components/forms/purchasing/PurchaseRequestBadges'
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
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import { RupiahInput } from '#/components/ui/rupiah-input'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import {
  REALIZATION_DOC_LABELS,
  REALIZATION_PROGRESS_LABELS,
  formatRupiah,
  formatRupiahDiff,
  parseQty,
} from '#/lib/purchasing'
import type {
  OpenRequestLine,
  PurchaseOrder,
  PurchaseRequestSummary,
  PurchasingOption,
} from '#/lib/purchasing'
import {
  buttonClassName,
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
  /** Existing PO; omit for a new one. */
  orderId?: string
  /** New PO: the SPP it orders from (asked for first when missing). */
  requestId?: string
  /** `approval`: opened from the approval queue (approve / reject only). */
  mode?: 'manage' | 'approval'
}

/** One PO line being edited; `ref` describes its SPP line. */
type Row = {
  ref: Omit<OpenRequestLine, 'orderedQty' | 'remainingQty'>
  /** What the SPP line still needed when the row was added. */
  leftQty: string
  qty: string
  unitPrice: string
  orderNote: string
}

type Confirm = 'delete' | 'reject' | 'cancel' | 'approve' | 'submit'

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

/** qty × price in whole rupiah (display only; the server is the source). */
function amountOf(qty: string, price: string): number {
  const q = parseQty(qty)
  const p = Number(price)
  if (q === null || !Number.isFinite(p)) return 0
  return Math.round(q * p)
}

/** Waiting approval prints the approval request; approved prints the vendor PO. */
function pdfPrefix(status: PurchaseOrder['status']): string {
  if (status === 'approved') return 'PO'
  if (status === 'pending_approval') return 'Pengajuan_PO'
  return 'PO_DRAFT'
}

function rowFromOpen(line: OpenRequestLine): Row {
  const { orderedQty: _o, remainingQty, ...ref } = line
  return {
    ref,
    leftQty: remainingQty,
    qty: remainingQty,
    unitPrice: line.rabUnitPrice ?? '',
    orderNote: '',
  }
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

/** Create, edit, approve or view one purchase order. */
export default function PurchaseOrderEditor({
  orderId,
  requestId,
  mode = 'manage',
}: Props) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canManage = can('purchasing.manage')
  const canApprove = can('purchasing.approve') && mode === 'approval'

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [vendors, setVendors] = useState<PurchasingOption[]>([])
  const [terms, setTerms] = useState<PurchasingOption[]>([])
  const [openLines, setOpenLines] = useState<OpenRequestLine[] | null>(null)
  const [request, setRequest] = useState<PurchaseRequestSummary | null>(null)
  const [requestChoices, setRequestChoices] = useState<
    PurchaseRequestSummary[] | null
  >(null)

  const [vendorId, setVendorId] = useState('')
  const [termId, setTermId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickQuery, setPickQuery] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reason, setReason] = useState('')

  const isNew = !orderId
  // Only the creator manages a PO, and never from the approval queue.
  const owns = mode === 'manage' && canManage && (isNew || order?.canChange === true)
  const editable = owns && (isNew || order?.status === 'draft')
  const reqId = order?.requestId ?? requestId ?? ''

  const applyOrder = useCallback((doc: PurchaseOrder) => {
    setOrder(doc)
    setVendorId(doc.vendorId)
    setTermId(doc.termOfPaymentId ?? '')
    setExpectedDate(doc.expectedDate ?? '')
    setNotes(doc.notes)
    setRows(
      doc.lines.map((l) => {
        const {
          id: _id,
          qty,
          unitPrice,
          amount: _a,
          orderedElsewhereQty,
          overRequest: _r,
          overBudget: _b,
          orderNote,
          ...ref
        } = l
        const left = Math.max(0, Number(l.requestedQty) - Number(orderedElsewhereQty))
        return { ref, leftQty: String(left), qty, unitPrice, orderNote }
      }),
    )
  }, [])

  const loadOpenLines = useCallback(
    async (forRequestId: string, exceptOrderId?: string) => {
    const params = new URLSearchParams({ requestId: forRequestId })
    if (exceptOrderId) params.set('exceptOrderId', exceptOrderId)
    const list = await getData<OpenRequestLine[]>(
      `/purchasing/orders/open-lines?${params.toString()}`,
    )
    setOpenLines(list ?? [])
    return list ?? []
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      let doc: PurchaseOrder | null = null
      if (!orderId && !requestId) {
        // Step 1: choose the SPP this PO orders from.
        const list = await getData<PurchaseRequestSummary[]>(
          '/purchasing/requests?status=submitted',
        )
        if (cancelled) return
        setRequestChoices((list ?? []).filter((r) => r.orderStatus !== 'ordered'))
        setLoading(false)
        return
      }
      if (orderId) {
        doc = await getData<PurchaseOrder>(`/purchasing/orders/${orderId}`)
        if (cancelled) return
        if (doc) applyOrder(doc)
      }
      const forRequest = doc?.requestId ?? requestId ?? ''
      const summary = forRequest
        ? await getData<PurchaseRequestSummary>(`/purchasing/requests/${forRequest}`)
        : null
      if (cancelled) return
      setRequest(summary)
      const willEdit =
        mode === 'manage' &&
        canManage &&
        (!orderId || (doc?.canChange === true && doc.status === 'draft'))
      if (willEdit && forRequest) {
        const [v, t] = await Promise.all([
          getData<PurchasingOption[]>('/purchasing/vendors'),
          getData<PurchasingOption[]>('/purchasing/terms'),
          loadOpenLines(forRequest, orderId),
        ])
        if (cancelled) return
        setVendors(v ?? [])
        setTerms(t ?? [])
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, requestId, canManage, applyOrder, loadOpenLines])

  // ---- Derived ----
  const onPo = useMemo(
    () => new Set(rows.map((r) => r.ref.requestLineId)),
    [rows],
  )
  const available = useMemo(() => {
    const q = pickQuery.trim().toLowerCase()
    return (openLines ?? []).filter(
      (l) =>
        !onPo.has(l.requestLineId) &&
        (!q ||
          [
            l.materialCode,
            l.materialName,
            l.note,
          ].some((v) => v.toLowerCase().includes(q))),
    )
  }, [openLines, onPo, pickQuery])

  const issues = new Map<string, string>()
  for (const r of rows) {
    if (parseQty(r.qty) === null) issues.set(r.ref.requestLineId, 'Enter a qty above 0')
    else if (!(Number(r.unitPrice) > 0)) issues.set(r.ref.requestLineId, 'Enter a unit price')
  }
  const total = rows.reduce((sum, r) => sum + amountOf(r.qty, r.unitPrice), 0)
  const rabTotal = rows.reduce(
    (sum, r) => sum + (r.ref.rabUnitPrice ? amountOf(r.qty, r.ref.rabUnitPrice) : 0),
    0,
  )
  const formErrors: string[] = []
  if (!vendorId) formErrors.push('Choose a vendor')
  if (rows.length === 0) formErrors.push('Add at least one item')
  const canSave = formErrors.length === 0 && issues.size === 0

  function addPicked() {
    const add = (openLines ?? []).filter((l) => picked.has(l.requestLineId))
    setRows((list) => [...list, ...add.map(rowFromOpen)])
    setPicked(new Set())
  }

  function updateRow(lineId: string, patch: Partial<Row>) {
    setRows((list) =>
      list.map((r) => (r.ref.requestLineId === lineId ? { ...r, ...patch } : r)),
    )
  }

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

  /** Save the draft; returns the saved PO or null. */
  async function saveDraft(): Promise<PurchaseOrder | null> {
    setShowErrors(true)
    if (!canSave) {
      toast.error('Fix the highlighted fields first')
      return null
    }
    const body = JSON.stringify({
      requestId: reqId,
      vendorId,
      termOfPaymentId: termId || null,
      expectedDate: expectedDate || null,
      notes,
      lines: rows.map((r) => ({
        requestLineId: r.ref.requestLineId,
        qty: r.qty.trim(),
        unitPrice: r.unitPrice,
        note: r.orderNote,
      })),
    })
    return isNew
      ? send<PurchaseOrder>('/purchasing/orders', { method: 'POST', body })
      : send<PurchaseOrder>(`/purchasing/orders/${orderId}`, { method: 'PUT', body })
  }

  function afterSave(doc: PurchaseOrder) {
    if (isNew) {
      void navigate({
        to: '/dashboard/purchasing/orders/$orderId',
        params: { orderId: doc.id },
        replace: true,
      })
    } else {
      applyOrder(doc)
    }
  }

  async function onSaveDraft() {
    setBusy(true)
    try {
      const saved = await saveDraft()
      if (saved) {
        toast.success(`${saved.number} saved`)
        afterSave(saved)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm === 'submit') {
        const saved = await saveDraft()
        if (!saved) return
        const next = await send<PurchaseOrder>(
          `/purchasing/orders/${saved.id}/submit`,
          { method: 'POST' },
        )
        if (next) toast.success(`${next.number} sent for approval`)
        else toast('Saved as draft; sending failed')
        setConfirm(null)
        afterSave(next ?? saved)
        return
      }
      if (!order) return
      const base = `/purchasing/orders/${order.id}`
      if (confirm === 'delete') {
        try {
          const response = await apiFetch<null>(base, { method: 'DELETE' })
          if (!response.success) {
            toast.error(response.message || 'Delete failed')
            return
          }
        } catch {
          toast.error('Unable to reach the server')
          return
        }
        toast.success('Draft deleted')
        void navigate({ to: '/dashboard/purchasing/orders' })
        return
      }
      const path =
        confirm === 'approve'
          ? `${base}/approve`
          : confirm === 'reject'
            ? `${base}/reject`
            : `${base}/cancel`
      const next = await send<PurchaseOrder>(path, {
        method: 'POST',
        body: confirm === 'approve' ? undefined : JSON.stringify({ reason }),
      })
      if (next) {
        toast.success(
          confirm === 'approve'
            ? 'PO approved'
            : confirm === 'reject'
              ? 'PO rejected'
              : 'PO cancelled',
        )
        applyOrder(next)
        setConfirm(null)
        if (mode === 'approval' && (confirm === 'approve' || confirm === 'reject')) {
          void navigate({ to: '/dashboard/purchasing/approvals' })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function revise() {
    if (!order) return
    setBusy(true)
    try {
      const next = await send<PurchaseOrder>(
        `/purchasing/orders/${order.id}/revise`,
        { method: 'POST' },
      )
      if (!next) return
      toast.success('Back to draft')
      applyOrder(next)
      const [v, t] = await Promise.all([
        getData<PurchasingOption[]>('/purchasing/vendors'),
        getData<PurchasingOption[]>('/purchasing/terms'),
        loadOpenLines(order.requestId, order.id),
      ])
      setVendors(v ?? [])
      setTerms(t ?? [])
    } finally {
      setBusy(false)
    }
  }

  async function downloadPdf() {
    if (!order) return
    try {
      await apiDownload(
        `/purchasing/orders/${order.id}/pdf`,
        `${pdfPrefix(order.status)}_${order.number.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  // ---- Render ----
  const backLink =
    mode === 'approval' ? (
      <Link
        to="/dashboard/purchasing/approvals"
        className={cn(
          buttonOutlineClassName,
          'inline-flex h-8 items-center gap-1.5 no-underline',
        )}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Waiting for approval
      </Link>
    ) : (
    <Link
      to="/dashboard/purchasing/orders"
      className={cn(
        buttonOutlineClassName,
        'inline-flex h-8 items-center gap-1.5 no-underline',
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      My purchase orders
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
  if (orderId && !order) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>This purchase order could not be loaded.</p>
      </div>
    )
  }

  // Step 1 of a new PO: which SPP does it order from?
  if (requestChoices) {
    return (
      <div className="space-y-6">
        {backLink}
        <div>
          <h1 className={pageTitleClassName}>New purchase order</h1>
          <p className={cn('mt-2', hintClassName)}>
            A PO orders from one material request. Make one PO per vendor.
          </p>
        </div>
        {requestChoices.length === 0 ? (
          <p className={cn('text-sm', hintClassName)}>
            No submitted request is waiting to be ordered.
          </p>
        ) : (
          <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
            {requestChoices.map((r) => (
              <li key={r.id}>
                <Link
                  to="/dashboard/purchasing/orders/new"
                  search={{ requestId: r.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm no-underline hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">{r.number}</p>
                    <p className={cn('truncate text-xs', hintClassName)}>
                      {r.projectNumber} · {r.projectName}
                      {r.productionOrderNumber ? ` · ${r.productionOrderNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={hintClassName}>
                      {r.lineCount} {r.lineCount === 1 ? 'item' : 'items'} · needed by{' '}
                      {r.neededDate}
                    </span>
                    {r.orderStatus === 'partial' ? (
                      <span className="text-sky-700 dark:text-sky-300">Partly ordered</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const vendorLabel =
    vendors.find((v) => v.id === vendorId)?.label ?? order?.vendorName ?? ''
  const status = order?.status
  const statusLine =
    status === 'pending_approval'
      ? `Sent for approval ${formatWhen(order!.submittedAt)} by ${order!.submittedBy?.name ?? 'Unknown'}.`
      : status === 'approved'
        ? `Approved ${formatWhen(order!.approvedAt)} by ${order!.approvedBy?.name ?? 'Unknown'}.`
        : editable
          ? 'Pick the items this vendor supplies. The rest stay open for another PO.'
          : null

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {order ? order.number : 'New purchase order'}
          </h1>
          {order ? <PurchaseOrderStatusChip status={order.status} /> : null}
        </div>
        {request ? (
          <p className="text-sm">
            For{' '}
            <Link
              to="/dashboard/purchasing/requests/$requestId"
              params={{ requestId: request.id }}
              className="font-medium tabular-nums underline-offset-4 hover:underline"
            >
              {request.number}
            </Link>
            <span className={hintClassName}>
              {' '}
              · {request.projectNumber} · {request.projectName}
              {request.productionOrderNumber
                ? ` · ${request.productionOrderNumber}`
                : ''}{' '}
              · needed by {request.neededDate} · by{' '}
              {request.requestedBy?.name ?? 'Unknown'}
            </span>
          </p>
        ) : null}
        {statusLine ? <p className={hintClassName}>{statusLine}</p> : null}
        {status === 'rejected' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Rejected {formatWhen(order!.rejectedAt)} by{' '}
            {order!.rejectedBy?.name ?? 'Unknown'}: {order!.rejectReason}
          </p>
        ) : null}
        {status === 'cancelled' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Cancelled {formatWhen(order!.cancelledAt)} by{' '}
            {order!.cancelledBy?.name ?? 'Unknown'}: {order!.cancelReason}
          </p>
        ) : null}
      </div>

      {/* Header fields */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <span className="text-sm font-medium">Vendor</span>
          {editable ? (
            <Combobox
              value={vendorId}
              onValueChange={setVendorId}
              options={vendors.map((v) => ({ value: v.id, label: v.label }))}
              placeholder="Choose a vendor"
              emptyText="No active vendor. Add one in Vendor Master Data."
              aria-label="Vendor"
              disabled={busy}
              className={cn(showErrors && !vendorId && 'border-red-500')}
            />
          ) : (
            <p className="text-sm">{vendorLabel}</p>
          )}
        </div>
        <div className="space-y-1">
          <span className="text-sm font-medium">Term of payment</span>
          {editable ? (
            <Combobox
              value={termId}
              onValueChange={setTermId}
              options={terms.map((t) => ({ value: t.id, label: t.label }))}
              placeholder="Optional"
              aria-label="Term of payment"
              disabled={busy}
            />
          ) : (
            <p className="text-sm">{order?.termOfPayment || '—'}</p>
          )}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Delivery date</span>
          {editable ? (
            <input
              type="date"
              value={expectedDate}
              disabled={busy}
              onChange={(e) => setExpectedDate(e.target.value)}
              className={cn(inputClassName, 'w-full')}
            />
          ) : (
            <p className="text-sm tabular-nums">{expectedDate || '—'}</p>
          )}
        </label>
      </section>

      {/* Lines */}
      <section className="space-y-3">
        <h2 className={sectionTitleClassName}>Items</h2>
        {rows.length === 0 ? (
          <div
            className={cn(
              'rounded-md border border-dashed border-(--line) px-4 py-6 text-center text-sm',
              hintClassName,
              showErrors && 'border-red-500',
            )}
          >
            No items yet. Pick them from the list below.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-(--muted)">
                <tr className="border-b border-(--line)">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="w-36 px-3 py-2 text-right font-medium">Qty</th>
                  <th className="w-48 px-3 py-2 text-right font-medium">
                    Unit price
                  </th>
                  <th className="w-36 px-3 py-2 text-right font-medium">Amount</th>
                  {editable ? <th className="w-10 px-2 py-2" aria-label="Remove" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = r.ref.requestLineId
                  const issue = showErrors ? issues.get(id) : undefined
                  const q = parseQty(r.qty)
                  const overRequest = q !== null && q > Number(r.leftQty) + 1e-9
                  const overBudget =
                    r.ref.rabUnitPrice !== null &&
                    Number(r.unitPrice) > Number(r.ref.rabUnitPrice)
                  return (
                    <tr
                      key={id}
                      className="border-b border-(--line) align-top last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-(--muted) tabular-nums">
                            {r.ref.materialCode}
                          </span>
                          <span>{r.ref.materialName}</span>
                          {r.ref.source === 'extra' ? <LineFlagBadge flag="extra" /> : null}
                          {!r.ref.inRab ? <LineFlagBadge flag="notInRab" /> : null}
                          {overRequest ? <LineFlagBadge flag="overRequest" /> : null}
                          {overBudget ? <LineFlagBadge flag="overBudget" /> : null}
                        </div>
                        <p className={cn('mt-0.5 text-xs tabular-nums', hintClassName)}>
                          {r.ref.note ? `“${r.ref.note}”` : ''}
                        </p>
                        {editable && (overRequest || r.orderNote) ? (
                          <input
                            value={r.orderNote}
                            disabled={busy}
                            placeholder="Note, e.g. rounded up to full sheets"
                            aria-label={`Note for ${r.ref.materialName}`}
                            onChange={(e) => updateRow(id, { orderNote: e.target.value })}
                            className={cn(inputClassNameCompact, 'mt-1.5 w-full max-w-md')}
                          />
                        ) : !editable && r.orderNote ? (
                          <p className="mt-0.5 text-xs">{r.orderNote}</p>
                        ) : null}
                        {issue ? <p className="mt-1 text-xs text-red-600">{issue}</p> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editable ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              inputMode="decimal"
                              value={r.qty}
                              disabled={busy}
                              aria-label={`Qty of ${r.ref.materialName}`}
                              onChange={(e) => updateRow(id, { qty: e.target.value })}
                              className={cn(
                                inputClassNameCompact,
                                'w-20 text-right tabular-nums',
                                issue && q === null && 'border-red-500',
                              )}
                            />
                            <span className="w-8 text-left text-xs text-(--muted)">
                              {r.ref.uomSymbol}
                            </span>
                          </div>
                        ) : (
                          <span className="font-medium tabular-nums">
                            {r.qty} {r.ref.uomSymbol}
                          </span>
                        )}
                        <p className={cn('mt-0.5 text-xs tabular-nums', hintClassName)}>
                          {editable
                            ? `still needed ${r.leftQty}`
                            : status === 'approved'
                              ? (() => {
                                  const po = order?.lines.find(
                                    (x) => x.requestLineId === r.ref.requestLineId,
                                  )
                                  return `arrived ${po?.realizedQty ?? '0'}`
                                })()
                              : `requested ${r.ref.requestedQty}`}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editable ? (
                          <RupiahInput
                            value={r.unitPrice}
                            onValueChange={(digits) => updateRow(id, { unitPrice: digits })}
                            disabled={busy}
                            aria-label={`Unit price of ${r.ref.materialName}`}
                            className={cn(
                              'h-8 text-right',
                              issue === 'Enter a unit price' && 'border-red-500',
                            )}
                          />
                        ) : (
                          <span className="tabular-nums">{formatRupiah(r.unitPrice)}</span>
                        )}
                        <p
                          className={cn(
                            'mt-0.5 text-xs tabular-nums',
                            overBudget ? 'text-amber-700 dark:text-amber-300' : hintClassName,
                          )}
                        >
                          {r.ref.rabUnitPrice
                            ? `RAB ${formatRupiah(r.ref.rabUnitPrice)}`
                            : 'No RAB price'}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatRupiah(String(amountOf(r.qty, r.unitPrice)))}
                      </td>
                      {editable ? (
                        <td className="px-2 py-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove item"
                            disabled={busy}
                            onClick={() =>
                              setRows((list) =>
                                list.filter((x) => x.ref.requestLineId !== id),
                              )
                            }
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-(--line)">
                  <td colSpan={3} className="px-3 py-2 text-right font-medium">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatRupiah(String(total))}
                  </td>
                  {editable ? <td /> : null}
                </tr>
                {rabTotal > 0 ? (
                  <tr>
                    <td colSpan={3} className={cn('px-3 pb-2 text-right text-xs', hintClassName)}>
                      Same items at RAB price
                    </td>
                    <td
                      className={cn(
                        'px-3 pb-2 text-right text-xs tabular-nums',
                        total > rabTotal ? 'text-amber-700 dark:text-amber-300' : hintClassName,
                      )}
                    >
                      {formatRupiah(String(rabTotal))}
                    </td>
                    {editable ? <td /> : null}
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Realization (approved POs) */}
      {order && status === 'approved' ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className={sectionTitleClassName}>Penerimaan / Nota Realisasi</h2>
              <p className={cn('text-sm', hintClassName)}>
                {REALIZATION_PROGRESS_LABELS[order.realizationStatus]}
                {order.realizedTotal !== '0'
                  ? ` · ${formatRupiah(order.realizedTotal)} posted of ${formatRupiah(order.total)}`
                  : ''}
              </p>
            </div>
            {can('purchasing.realize') && order.realizationStatus !== 'full' ? (
              <Link
                to="/dashboard/purchasing/realizations/new"
                search={{ orderId: order.id }}
                className={cn(
                  buttonClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <PackageCheck className="size-3.5" aria-hidden />
                Record arrival / purchase
              </Link>
            ) : null}
          </div>
          {order.realizations.length === 0 ? (
            <p className={cn('text-sm', hintClassName)}>Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
              {order.realizations.map((n) => (
                <li key={n.id}>
                  <Link
                    to="/dashboard/purchasing/realizations/$realizationId"
                    params={{ realizationId: n.id }}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm no-underline hover:bg-accent"
                  >
                    <span className="font-medium tabular-nums">{n.number}</span>
                    <span className={cn('text-xs', hintClassName)}>
                      {REALIZATION_DOC_LABELS[n.method]}
                    </span>
                    <span className={cn('text-xs tabular-nums', hintClassName)}>
                      {n.purchaseDate}
                    </span>
                    <span className="ml-auto tabular-nums">{formatRupiah(n.total)}</span>
                    <span
                      className={cn(
                        'w-28 text-right text-xs tabular-nums',
                        Number(n.difference) > 0
                          ? 'text-red-700 dark:text-red-300'
                          : Number(n.difference) < 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : hintClassName,
                      )}
                    >
                      {formatRupiahDiff(n.difference)}
                    </span>
                    <RealizationStatusChip status={n.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Picker */}
      {editable ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className={sectionTitleClassName}>Still to order</h2>
              <p className={cn('text-sm', hintClassName)}>
                Items of {request?.number ?? 'this request'} not on any PO yet.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-(--muted)"
                  aria-hidden
                />
                <input
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  placeholder="Filter material…"
                  aria-label="Filter open requests"
                  className={cn(inputClassName, 'w-64 pl-7')}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busy || picked.size === 0}
                onClick={addPicked}
              >
                Add {picked.size > 0 ? picked.size : ''} to PO
              </Button>
            </div>
          </div>
          {openLines === null ? (
            <p className={cn('text-sm', hintClassName)}>Loading…</p>
          ) : available.length === 0 ? (
            <p className={cn('text-sm', hintClassName)}>
              {pickQuery.trim()
                ? 'No open lines match the filter.'
                : 'Every item of this request is on a PO.'}
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-(--surface) text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        aria-label="Select all"
                        checked={
                          available.every((l) => picked.has(l.requestLineId))
                            ? true
                            : available.some((l) => picked.has(l.requestLineId))
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(v) =>
                          setPicked(
                            v === true
                              ? new Set([...picked, ...available.map((l) => l.requestLineId)])
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">To order</th>
                  </tr>
                </thead>
                <tbody>
                  {available.map((l) => {
                    const checked = picked.has(l.requestLineId)
                    const toggle = () => {
                      const next = new Set(picked)
                      if (checked) next.delete(l.requestLineId)
                      else next.add(l.requestLineId)
                      setPicked(next)
                    }
                    return (
                      <tr
                        key={l.requestLineId}
                        onClick={toggle}
                        className={cn(
                          'cursor-pointer border-b border-(--line) align-top last:border-0 hover:bg-accent',
                          checked && 'bg-accent',
                        )}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={toggle}
                            aria-label={`Select ${l.materialName} from ${l.requestNumber}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-(--muted) tabular-nums">
                              {l.materialCode}
                            </span>
                            <span>{l.materialName}</span>
                            {l.source === 'extra' ? <LineFlagBadge flag="extra" /> : null}
                            {l.overPlan ? <LineFlagBadge flag="overPlan" /> : null}
                            {!l.inRab ? <LineFlagBadge flag="notInRab" /> : null}
                          </div>
                          {l.note ? (
                            <p className={cn('mt-0.5 text-xs', hintClassName)}>“{l.note}”</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {l.remainingQty} {l.uomSymbol}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Notes */}
      {editable ? (
        <label className="block max-w-2xl space-y-1">
          <span className={sectionTitleClassName}>Notes</span>
          <textarea
            rows={3}
            value={notes}
            disabled={busy}
            placeholder="Printed on the PO, one per line (optional)"
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClassName, 'w-full')}
          />
        </label>
      ) : notes ? (
        <section className="space-y-1">
          <h2 className={sectionTitleClassName}>Notes</h2>
          <p className="text-sm whitespace-pre-line">{notes}</p>
        </section>
      ) : null}

      {/* Action bar */}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{formatRupiah(String(total))}</span>
          <span className={hintClassName}>
            {' '}
            · {rows.length} {rows.length === 1 ? 'item' : 'items'}
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
        <div className="flex flex-wrap gap-2">
          {order && !editable && owns && request?.orderStatus !== 'ordered' &&
          request?.status === 'submitted' ? (
            <Link
              to="/dashboard/purchasing/orders/new"
              search={{ requestId: order.requestId }}
              className={cn(
                buttonOutlineClassName,
                'inline-flex h-8 items-center gap-1.5 no-underline',
              )}
            >
              <Plus className="size-3.5" aria-hidden />
              PO for remaining items
            </Link>
          ) : null}
          {order ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void downloadPdf()}
            >
              <FileText className="size-3.5" aria-hidden />
              {status === 'approved'
                ? 'PO PDF'
                : status === 'pending_approval'
                  ? 'Approval PDF'
                  : 'Draft PDF'}
            </Button>
          ) : null}

          {editable ? (
            <>
              {status === 'draft' ? (
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void onSaveDraft()}
              >
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setShowErrors(true)
                  if (canSave) setConfirm('submit')
                  else toast.error('Fix the highlighted fields first')
                }}
              >
                <Send className="size-3.5" aria-hidden />
                Send for approval
              </Button>
            </>
          ) : null}

          {status === 'rejected' && owns ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void revise()}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Revise
            </Button>
          ) : null}

          {(status === 'pending_approval' ||
            status === 'approved' ||
            status === 'rejected') &&
          owns ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-700"
              disabled={busy}
              onClick={() => {
                setReason('')
                setConfirm('cancel')
              }}
            >
              <Ban className="size-3.5" aria-hidden />
              Cancel PO
            </Button>
          ) : null}

          {status === 'pending_approval' && canApprove ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-700"
                disabled={busy}
                onClick={() => {
                  setReason('')
                  setConfirm('reject')
                }}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm('approve')}
              >
                <Check className="size-3.5" aria-hidden />
                Approve
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'submit'
                ? 'Send for approval?'
                : confirm === 'approve'
                  ? `Approve ${order?.number}?`
                  : confirm === 'reject'
                    ? `Reject ${order?.number}?`
                    : confirm === 'cancel'
                      ? `Cancel ${order?.number}?`
                      : `Delete draft ${order?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'submit'
                ? `${vendorLabel} · ${formatRupiah(String(total))}. It can no longer be edited unless it is rejected.`
                : confirm === 'approve'
                  ? `${order?.vendorName} · ${formatRupiah(order?.total)}. The PO can then be sent to the vendor.`
                  : confirm === 'reject'
                    ? 'Purchasing can revise and send it again.'
                    : confirm === 'cancel'
                      ? 'Its items go back to the open requests.'
                      : 'Its items go back to the open requests.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === 'reject' || confirm === 'cancel' ? (
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
              variant={
                confirm === 'approve' || confirm === 'submit' ? 'default' : 'destructive'
              }
              disabled={
                busy || ((confirm === 'reject' || confirm === 'cancel') && !reason.trim())
              }
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {confirm === 'submit'
                ? 'Send'
                : confirm === 'approve'
                  ? 'Approve'
                  : confirm === 'reject'
                    ? 'Reject'
                    : confirm === 'cancel'
                      ? 'Cancel PO'
                      : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
