import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
} from 'lucide-react'
import {
  LineFlagBadge,
  PurchaseOrderStatusChip,
  RabLink,
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
import PurchaseFlowHeader from '#/components/forms/shared/PurchaseFlowHeader'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { RabCompareButton } from '#/components/forms/purchasing/RabCompareDialog'
import PurchaseOrderQuotationPanel from '#/components/forms/purchasing/PurchaseOrderQuotationPanel'
import PurchaseOrderEstimatesPanel from '#/components/forms/purchasing/PurchaseOrderEstimatesPanel'
import PurchaseOrderLines, {
  amountOf,
  rowFromOpen,
} from '#/components/forms/purchasing/PurchaseOrderLines'
import type { PoLineRow } from '#/components/forms/purchasing/PurchaseOrderLines'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import {
  REALIZATION_DOC_LABELS,
  REALIZATION_PROGRESS_LABELS,
  formatRupiah,
  parseQty,
} from '#/lib/purchasing'
import type {
  OpenRequestLine,
  PurchaseOrder,
  PurchaseOrderSummary,
  PurchaseRequestSummary,
  PurchasingOption,
} from '#/lib/purchasing'
import {
  buttonClassName,
  buttonOutlineClassName,
  dialogInputClassName,
  hintClassName,
  inputClassName,
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

type Row = PoLineRow

/** Saving splits the lines into one PO per vendor. */
type SavedOrders = { order: PurchaseOrder; others: PurchaseOrderSummary[] }

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

/** Waiting approval prints the approval request; approved prints the vendor PO. */
function pdfPrefix(status: PurchaseOrder['status']): string {
  if (status === 'approved') return 'PO'
  if (status === 'pending_approval') return 'Pengajuan_PO'
  return 'PO_DRAFT'
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
  const { can, user } = useAuth()
  const navigate = useNavigate()
  const canManage = can('purchasing.manage')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [vendors, setVendors] = useState<PurchasingOption[]>([])
  const [terms, setTerms] = useState<PurchasingOption[]>([])
  const [approvers1, setApprovers1] = useState<PurchasingOption[]>([])
  const [approvers2, setApprovers2] = useState<PurchasingOption[]>([])
  const [approver1Id, setApprover1Id] = useState('')
  const [approver2Id, setApprover2Id] = useState('')
  const [openLines, setOpenLines] = useState<OpenRequestLine[] | null>(null)
  const [request, setRequest] = useState<PurchaseRequestSummary | null>(null)
  const [requestChoices, setRequestChoices] = useState<
    PurchaseRequestSummary[] | null
  >(null)

  /** Term of payment per vendor of the lines. */
  const [termsByVendor, setTermsByVendor] = useState<Record<string, string>>({})
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  const owns =
    mode === 'manage' && canManage && (isNew || order?.canChange === true)
  const editable = owns && (isNew || order?.status === 'draft')
  const canApprove = mode === 'approval' && order?.canApprove === true
  const reqId = order?.requestId ?? requestId ?? ''

  useEffect(() => {
    // Draft/new: open details so delivery date and approvers are set.
    if (editable) setDetailsOpen(true)
  }, [editable])

  const applyOrder = useCallback((doc: PurchaseOrder) => {
    setOrder(doc)
    setTermsByVendor({ [doc.vendorId]: doc.termOfPaymentId ?? '' })
    setExpectedDate(doc.expectedDate ?? '')
    setNotes(doc.notes)
    setApprover1Id(doc.approver1?.id ?? '')
    setApprover2Id(doc.approver2?.id ?? '')
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
          overRabQty: _q,
          orderNote,
          ...ref
        } = l
        const left = Math.max(
          0,
          Number(l.requestedQty) - Number(orderedElsewhereQty),
        )
        return {
          ref,
          leftQty: String(left),
          vendorId: doc.vendorId,
          qty,
          unitPrice,
          orderNote,
        }
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

  /** Vendor, term and approver pickers plus the open SPP lines. */
  const loadPickers = useCallback(
    async (forRequestId: string, exceptOrderId?: string) => {
      const [v, t, a1, a2] = await Promise.all([
        getData<PurchasingOption[]>('/purchasing/vendors'),
        getData<PurchasingOption[]>('/purchasing/terms'),
        getData<PurchasingOption[]>('/purchasing/orders/approvers?level=1'),
        getData<PurchasingOption[]>('/purchasing/orders/approvers?level=2'),
        loadOpenLines(forRequestId, exceptOrderId),
      ])
      setVendors(v ?? [])
      setTerms(t ?? [])
      setApprovers1(a1 ?? [])
      setApprovers2(a2 ?? [])
    },
    [loadOpenLines],
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
        setRequestChoices(
          (list ?? []).filter((r) => r.orderStatus !== 'ordered'),
        )
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
        ? await getData<PurchaseRequestSummary>(
            `/purchasing/requests/${forRequest}`,
          )
        : null
      if (cancelled) return
      setRequest(summary)
      const willEdit =
        mode === 'manage' &&
        canManage &&
        (!orderId || (doc?.canChange === true && doc.status === 'draft'))
      if (willEdit && forRequest) {
        await loadPickers(forRequest, orderId)
        if (cancelled) return
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, requestId, canManage, applyOrder, loadPickers])

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
          [l.materialCode, l.materialName, l.note].some((v) =>
            v.toLowerCase().includes(q),
          )),
    )
  }, [openLines, onPo, pickQuery])

  const issues = new Map<string, string>()
  for (const r of rows) {
    if (!r.vendorId) issues.set(r.ref.requestLineId, 'Choose a vendor')
    else if (parseQty(r.qty) === null)
      issues.set(r.ref.requestLineId, 'Enter a qty above 0')
    else if (!(Number(r.unitPrice) > 0))
      issues.set(r.ref.requestLineId, 'Enter a unit price')
  }
  const total = rows.reduce((sum, r) => sum + amountOf(r.qty, r.unitPrice), 0)
  // Estimates are priced on the saved goods total: show them while lines match it.
  const withEstimates =
    order !== null &&
    order.estimatedTotal !== order.total &&
    String(total) === order.total
  const rabTotal = rows.reduce(
    (sum, r) =>
      sum + (r.ref.rabUnitPrice ? amountOf(r.qty, r.ref.rabUnitPrice) : 0),
    0,
  )
  const formErrors: string[] = []
  if (!approver1Id || !approver2Id) formErrors.push('Choose both approvers')
  else if (approver1Id === approver2Id) {
    formErrors.push('Level 1 and level 2 approver must be different people')
  }
  if (rows.length === 0) formErrors.push('Add at least one item')
  const canSave = formErrors.length === 0 && issues.size === 0
  const vendorGroups = [
    ...rows
      .reduce((map, r) => {
        if (!r.vendorId) return map
        const g = map.get(r.vendorId) ?? {
          vendorId: r.vendorId,
          count: 0,
          total: 0,
        }
        g.count += 1
        g.total += amountOf(r.qty, r.unitPrice)
        return map.set(r.vendorId, g)
      }, new Map<string, { vendorId: string; count: number; total: number }>())
      .values(),
  ]
  const vendorName = (id: string) =>
    vendors.find((v) => v.id === id)?.label ??
    (id === order?.vendorId ? order.vendorName : '')

  function addPicked() {
    const add = (openLines ?? []).filter((l) => picked.has(l.requestLineId))
    setRows((list) => [...list, ...add.map(rowFromOpen)])
    setPicked(new Set())
  }

  function updateRow(lineId: string, patch: Partial<Row>) {
    setRows((list) =>
      list.map((r) =>
        r.ref.requestLineId === lineId ? { ...r, ...patch } : r,
      ),
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

  /** Save as drafts (one PO per vendor), optionally sending them for approval. */
  async function saveOrders(submit: boolean): Promise<SavedOrders | null> {
    setShowErrors(true)
    if (!canSave) {
      toast.error('Fix the highlighted fields first')
      return null
    }
    const body = JSON.stringify({
      requestId: reqId,
      expectedDate: expectedDate || null,
      notes,
      approver1Id,
      approver2Id,
      terms: vendorGroups.map((g) => ({
        vendorId: g.vendorId,
        termOfPaymentId: termsByVendor[g.vendorId] || null,
      })),
      lines: rows.map((r) => ({
        requestLineId: r.ref.requestLineId,
        vendorId: r.vendorId,
        qty: r.qty.trim(),
        unitPrice: r.unitPrice,
        note: r.orderNote,
      })),
      submit,
    })
    return isNew
      ? send<SavedOrders>('/purchasing/orders', { method: 'POST', body })
      : send<SavedOrders>(`/purchasing/orders/${orderId}`, {
          method: 'PUT',
          body,
        })
  }

  function afterSave(saved: SavedOrders, verb: string) {
    const numbers = [saved.order.number, ...saved.others.map((o) => o.number)]
    toast.success(`${numbers.join(', ')} ${verb}`)
    if (isNew) {
      void navigate({
        to: '/dashboard/purchasing/orders/$orderId',
        params: { orderId: saved.order.id },
        replace: true,
      })
    } else {
      applyOrder(saved.order)
      // Lines moved to another vendor's PO are no longer open here.
      void loadOpenLines(saved.order.requestId, saved.order.id)
    }
  }

  async function onSaveDraft() {
    setBusy(true)
    try {
      const saved = await saveOrders(false)
      if (saved) afterSave(saved, 'saved')
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm === 'submit') {
        const saved = await saveOrders(true)
        if (!saved) return
        setConfirm(null)
        afterSave(saved, 'sent for approval')
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
        if (
          mode === 'approval' &&
          (confirm === 'approve' || confirm === 'reject')
        ) {
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
      await loadPickers(order.requestId, order.id)
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
        search={{ tab: orderId ? undefined : 'waiting' }}
        className={cn(
          buttonOutlineClassName,
          'inline-flex h-8 items-center gap-1.5 no-underline',
        )}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {orderId ? 'My purchase orders' : 'Waiting to order'}
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
        <p className={hintClassName}>
          This purchase order could not be loaded.
        </p>
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
            Pick a vendor per item; saving makes one PO per vendor.
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
                      {r.productionOrderNumber
                        ? ` · ${r.productionOrderNumber}`
                        : r.purchaseRabNumber
                          ? ` · ${r.purchaseRabNumber}`
                          : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={hintClassName}>
                      {r.lineCount} {r.lineCount === 1 ? 'item' : 'items'} ·
                      needed by {r.neededDate}
                    </span>
                    {r.orderStatus === 'partial' ? (
                      <span className="text-sky-700 dark:text-sky-300">
                        Partly ordered
                      </span>
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

  const status = order?.status
  const waitingOn =
    order?.approvalLevel === 1
      ? order.approver1
      : order?.approvalLevel === 2
        ? order.approver2
        : null
  const statusLine =
    status === 'pending_approval'
      ? `Waiting for level ${order!.approvalLevel ?? '?'} · ${waitingOn?.name ?? 'Unknown'}`
      : status === 'approved'
        ? `Approved ${formatWhen(order!.approvedAt)}`
        : null
  const detailsNeedAttention = showErrors && formErrors.length > 0
  // Which RAB this PO is checked against: the SPP's Purchasing RAB or its project RAB.
  const budgetRef = rows[0]?.ref ?? order?.lines[0] ?? null
  const budgetLabel = order?.rabLabel ?? budgetRef?.rabLabel ?? null
  const budgetRabId =
    order?.purchaseRabId ?? budgetRef?.purchaseRabId ?? request?.purchaseRabId ?? null

  return (
    <div className="space-y-6 pb-24">
      <div className="space-y-2">
        {backLink}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {order ? order.number : 'New purchase order'}
          </h1>
          {order ? <PurchaseOrderStatusChip status={order.status} /> : null}
          {order && !editable ? (
            <span className="text-sm font-medium">{order.vendorName}</span>
          ) : null}
          {statusLine ? (
            <span className={cn('text-sm', hintClassName)}>{statusLine}</span>
          ) : null}
          {order ? (
            <RabCompareButton orderId={order.id} className="ml-auto" />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-8', !order && 'ml-auto')}
            onClick={() => setDetailsOpen(true)}
          >
            Details
          </Button>
        </div>
        {order ? (
          <PurchaseFlowHeader
            key={`${order.id}:${order.status}:${order.approvalLevel}:${order.realizationStatus}`}
            kind="order"
            id={order.id}
          />
        ) : null}
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
            {order!.closedPartial
              ? '. Partly received: what arrived stays, the rest is not continued.'
              : ''}
          </p>
        ) : null}
      </div>

      <Sheet
        open={detailsOpen || detailsNeedAttention}
        onOpenChange={(open) => {
          if (!open && detailsNeedAttention) return
          setDetailsOpen(open)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>PO details</SheetTitle>
            <SheetDescription>
              Material request, budget, delivery date, and approvers.
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
            {budgetLabel || budgetRef ? (
              <Field label="Budget">
                <RabLink
                  purchaseRabId={budgetRabId}
                  projectId={budgetRef?.projectId ?? null}
                  label={
                    budgetLabel ??
                    (budgetRef?.projectId ? 'Project RAB' : 'No RAB')
                  }
                />
                <span className={cn('block text-xs', hintClassName)}>
                  {budgetRef?.projectId
                    ? `${budgetRef.projectNumber} · ${budgetRef.projectName}`
                    : 'No project'}
                </span>
              </Field>
            ) : null}
            {request ? (
              <Field label="Material request">
                <Link
                  to="/dashboard/purchasing/requests/$requestId"
                  params={{ requestId: request.id }}
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                >
                  {request.number}
                </Link>
                <span className={cn('block text-xs', hintClassName)}>
                  {request.projectNumber} · {request.projectName}
                  {request.productionOrderNumber
                    ? ` · ${request.productionOrderNumber}`
                    : request.purchaseRabNumber
                      ? ` · ${request.purchaseRabNumber}`
                      : ''}
                  <br />
                  Needed by {request.neededDate} ·{' '}
                  {request.requestedBy?.name ?? 'Unknown'}
                </span>
              </Field>
            ) : null}
            {order && !editable ? (
              <Field label="Term of payment">
                {order.termOfPayment || '—'}
              </Field>
            ) : null}
            <Field label="Delivery date">
              {editable ? (
                <input
                  type="date"
                  value={expectedDate}
                  disabled={busy}
                  aria-label="Delivery date"
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className={cn(inputClassName, 'w-full')}
                />
              ) : (
                <span className="tabular-nums">{expectedDate || '—'}</span>
              )}
            </Field>
            {([1, 2] as const).map((level) => {
              const value = level === 1 ? approver1Id : approver2Id
              const setValue = level === 1 ? setApprover1Id : setApprover2Id
              const all = level === 1 ? approvers1 : approvers2
              // You cannot approve a PO you made, so you are left out of the list.
              const options = all.filter((o) => o.detail !== user?.email)
              const onlyYou = all.length > 0 && options.length === 0
              const chosen = level === 1 ? order?.approver1 : order?.approver2
              const signedAt =
                level === 1 ? order?.approved1At : order?.approvedAt
              return (
                <Field key={level} label={`Approver level ${level}`}>
                  {editable ? (
                    <Combobox
                      value={value}
                      onValueChange={setValue}
                      options={options.map((o) => ({
                        value: o.id,
                        label: o.label,
                      }))}
                      placeholder="Choose an approver"
                      emptyText={
                        onlyYou
                          ? `Only you can approve level ${level}, and the person who makes a PO cannot approve it. Give another user this approval role.`
                          : `No one has the level ${level} approval permission.`
                      }
                      aria-label={`Approver level ${level}`}
                      disabled={busy}
                      className={cn(
                        'w-full sm:w-full',
                        showErrors && !value && 'border-red-500',
                      )}
                    />
                  ) : (
                    <>
                      {chosen?.name ?? '—'}
                      <span className={cn('block text-xs', hintClassName)}>
                        {signedAt
                          ? `Approved ${formatWhen(signedAt)}`
                          : status === 'pending_approval' &&
                              order?.approvalLevel === level
                            ? 'Waiting'
                            : status === 'pending_approval'
                              ? 'After level 1'
                              : ''}
                      </span>
                    </>
                  )}
                </Field>
              )
            })}
            {order?.submittedAt ? (
              <Field label="Sent for approval">
                {formatWhen(order.submittedAt)}
                <span className={cn('block text-xs', hintClassName)}>
                  {order.submittedBy?.name ?? 'Unknown'}
                </span>
              </Field>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Lines */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={sectionTitleClassName}>Items</h2>
          {rows.length > 0 ? (
            <span className={cn('text-xs', hintClassName)}>
              Click a row for budget, flags and prices
            </span>
          ) : null}
        </div>
        <PurchaseOrderLines
          rows={rows}
          editable={editable}
          busy={busy}
          issues={showErrors ? issues : new Map()}
          vendors={vendors}
          showVendor={editable}
          arrivedQty={
            status === 'approved'
              ? (id) =>
                  order?.lines.find((x) => x.requestLineId === id)
                    ?.realizedQty ?? '0'
              : undefined
          }
          onChange={updateRow}
          onRemove={(id) =>
            setRows((list) => list.filter((x) => x.ref.requestLineId !== id))
          }
        />
        {rows.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 px-3 text-sm">
            {rabTotal > 0 ? (
              <span
                className={cn(
                  'tabular-nums',
                  total > rabTotal
                    ? 'text-amber-700 dark:text-amber-300'
                    : hintClassName,
                )}
              >
                At RAB price {formatRupiah(String(rabTotal))}
                {budgetLabel ? ` (${budgetLabel})` : ''}
              </span>
            ) : null}
            <span className="font-semibold tabular-nums">
              {withEstimates ? 'Goods total' : 'Total'}{' '}
              {formatRupiah(String(total))}
            </span>
            {withEstimates && order ? (
              <span className="font-semibold tabular-nums">
                Est. with additional costs{' '}
                {formatRupiah(order.estimatedTotal)}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* One PO per vendor */}
      {editable && vendorGroups.length > 0 ? (
        <section className="space-y-2">
          <div>
            <h2 className={sectionTitleClassName}>
              {vendorGroups.length === 1
                ? 'Vendor'
                : `${vendorGroups.length} vendors`}
            </h2>
            {vendorGroups.length > 1 ? (
              <p className={cn('text-sm', hintClassName)}>
                Saving makes one PO per vendor; each is approved on its own.
              </p>
            ) : null}
          </div>
          <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
            {vendorGroups.map((g) => (
              <li
                key={g.vendorId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {vendorName(g.vendorId)}
                </span>
                <span className={cn('text-xs', hintClassName)}>
                  {g.count} {g.count === 1 ? 'item' : 'items'}
                </span>
                <span className="w-32 text-right tabular-nums">
                  {formatRupiah(String(g.total))}
                </span>
                <Combobox
                  value={termsByVendor[g.vendorId] ?? ''}
                  onValueChange={(v) =>
                    setTermsByVendor((prev) => ({ ...prev, [g.vendorId]: v }))
                  }
                  options={terms.map((t) => ({ value: t.id, label: t.label }))}
                  placeholder="Term of payment (optional)"
                  aria-label={`Term of payment for ${vendorName(g.vendorId)}`}
                  disabled={busy}
                  className="w-full sm:w-64"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Realization (approved POs) — compact when empty */}
      {order && status === 'approved' ? (
        order.realizations.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm', hintClassName)}>
              {REALIZATION_PROGRESS_LABELS[order.realizationStatus]} · nothing
              recorded yet
            </p>
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
                Record arrival
              </Link>
            ) : null}
          </div>
        ) : (
          <details className="rounded-md border border-(--line) open:pb-3" open>
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Penerimaan · {order.realizations.length}{' '}
                  {order.realizations.length === 1 ? 'nota' : 'notas'}
                </span>
                <span className={cn('text-xs font-normal', hintClassName)}>
                  {REALIZATION_PROGRESS_LABELS[order.realizationStatus]}
                </span>
              </span>
            </summary>
            <div className="space-y-2 px-3">
              {can('purchasing.realize') && order.realizationStatus !== 'full' ? (
                <Link
                  to="/dashboard/purchasing/realizations/new"
                  search={{ orderId: order.id }}
                  className={cn(
                    buttonOutlineClassName,
                    'inline-flex h-8 items-center gap-1.5 no-underline',
                  )}
                >
                  <PackageCheck className="size-3.5" aria-hidden />
                  Record arrival
                </Link>
              ) : null}
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
                      <span className="ml-auto tabular-nums">
                        {formatRupiah(n.total)}
                      </span>
                      <RealizationStatusChip status={n.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )
      ) : null}

      {/* Picker — muted one-liner when nothing left */}
      {editable ? (
        openLines !== null &&
        available.length === 0 &&
        !pickQuery.trim() ? (
          <p className={cn('text-sm', hintClassName)}>
            Every item of this request is on a PO.
          </p>
        ) : (
        <details
          className="space-y-3 rounded-md border border-(--line) open:pb-3"
          open={Boolean(available.length)}
        >
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Still to order
            <span className={cn('ml-2 text-xs font-normal', hintClassName)}>
              Items of {request?.number ?? 'this request'} not on a PO yet
            </span>
          </summary>
          <div className="space-y-3 px-3">
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
            {openLines === null ? (
              <p className={cn('text-sm', hintClassName)}>Loading…</p>
            ) : available.length === 0 ? (
              <p className={cn('text-sm', hintClassName)}>
                No open lines match the filter.
              </p>
            ) : (
              <div className="max-h-112 overflow-auto rounded-md border border-(--line)">
                <table className="w-full min-w-140 text-sm">
                  <thead className="sticky top-0 bg-(--surface) text-left text-xs text-(--muted)">
                    <tr className="border-b border-(--line)">
                      <th className="w-10 px-3 py-2">
                        <Checkbox
                          aria-label="Select all"
                          checked={
                            available.every((l) => picked.has(l.requestLineId))
                              ? true
                              : available.some((l) =>
                                    picked.has(l.requestLineId),
                                  )
                                ? 'indeterminate'
                                : false
                          }
                          onCheckedChange={(v) =>
                            setPicked(
                              v === true
                                ? new Set([
                                    ...picked,
                                    ...available.map((l) => l.requestLineId),
                                  ])
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">
                        To order
                      </th>
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
                          <td
                            className="px-3 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                              {l.source === 'extra' ? (
                                <LineFlagBadge flag="extra" />
                              ) : null}
                              {l.overPlan ? (
                                <LineFlagBadge flag="overPlan" />
                              ) : null}
                              {!l.inRab ? (
                                <LineFlagBadge flag="notInRab" />
                              ) : null}
                            </div>
                            {l.note ? (
                              <p className={cn('mt-0.5 text-xs', hintClassName)}>
                                “{l.note}”
                              </p>
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
          </div>
        </details>
        )
      ) : null}

      <details className="rounded-md border border-(--line) open:pb-3">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          More · estimates, quotation, notes
        </summary>
        <div className="space-y-6 px-3">
          <PurchaseOrderEstimatesPanel
            order={order}
            editable={editable && !busy}
            onChanged={setOrder}
          />
          {order || editable ? (
            <PurchaseOrderQuotationPanel
              order={order}
              editable={editable && !busy}
              onChanged={setOrder}
            />
          ) : null}
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
        </div>
      </details>

      {/* Action bar */}
      <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">
            {formatRupiah(String(total))}
          </span>
          <span className={hintClassName}>
            {' '}
            · {rows.length} {rows.length === 1 ? 'item' : 'items'}
          </span>
          {showErrors && (formErrors.length > 0 || issues.size > 0) ? (
            <p className="text-xs text-red-600">
              {[
                ...formErrors,
                ...(issues.size > 0
                  ? [
                      `${issues.size} ${issues.size === 1 ? 'row needs' : 'rows need'} attention`,
                    ]
                  : []),
              ].join(' · ')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {order &&
          !editable &&
          owns &&
          request?.orderStatus !== 'ordered' &&
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

          {/* Once level 1 has signed, only a reject sends it back. */}
          {(status === 'rejected' ||
            (status === 'pending_approval' && !order?.approved1At)) &&
          owns ? (
            <Button
              type="button"
              size="sm"
              variant={status === 'rejected' ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => void revise()}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {status === 'rejected' ? 'Revise' : 'Back to draft'}
            </Button>
          ) : null}

          {(status === 'pending_approval' ||
            status === 'approved' ||
            status === 'rejected') &&
          owns &&
          order?.realizationStatus !== 'full' ? (
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
                  ? `Approve ${order?.number} (level ${order?.approvalLevel})?`
                  : confirm === 'reject'
                    ? `Reject ${order?.number}?`
                    : confirm === 'cancel'
                      ? `Cancel ${order?.number}?`
                      : `Delete draft ${order?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'submit'
                ? `${vendorGroups.length > 1 ? `${vendorGroups.length} POs, one per vendor` : vendorName(vendorGroups[0]?.vendorId ?? '')} · ${formatRupiah(String(total))}. Level 1 approves first, then level 2.`
                : confirm === 'approve'
                  ? order?.approvalLevel === 1
                    ? `${order.vendorName} · ${formatRupiah(order.total)}. It then goes to ${order.approver2?.name ?? 'the level 2 approver'}.`
                    : `${order?.vendorName} · ${formatRupiah(order?.total)}. The PO can then be sent to the vendor.`
                  : confirm === 'reject'
                    ? 'Purchasing can revise and send it again; both levels approve again.'
                    : confirm === 'cancel'
                      ? order?.realizationStatus === 'partial'
                        ? 'Part of this PO has arrived. What arrived stays on record; the rest is not continued and goes back to the open requests.'
                        : 'Its items go back to the open requests.'
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
                confirm === 'approve' || confirm === 'submit'
                  ? 'default'
                  : 'destructive'
              }
              disabled={
                busy ||
                ((confirm === 'reject' || confirm === 'cancel') &&
                  !reason.trim())
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

/** Label over a value in the details panel. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 text-sm">
      <span className={cn('block text-xs', hintClassName)}>{label}</span>
      {children}
    </div>
  )
}
