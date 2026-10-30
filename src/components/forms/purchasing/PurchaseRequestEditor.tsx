import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Check,
  LoaderCircle,
  PackageCheck,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import {
  LineFlagBadge,
  PurchaseOrderStatusChip,
  PurchaseRequestStatusChip,
  RabLink,
  RequestOrderStatusChip,
  lineFlags,
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
import { Combobox } from '#/components/ui/combobox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import { formatRupiah, materialKey, parseQty } from '#/lib/purchasing'
import type {
  PurchaseRequest,
  PurchaseRequestLineInput,
  PurchaseRequestPlan,
  PurchaseRequestPlanRow,
  PurchasingMaterial,
  PurchasingRabOption,
  PurchasingSpk,
  PurchasingProjectContext,
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
  /** Existing SPP; omit for a new one. */
  requestId?: string
  /** New SPP opened from an SPK. */
  productionOrderId?: string
  /** New SPP opened from a Purchasing RAB. */
  purchaseRabId?: string
}

/** What a new SPP is made for. */
type Basis = 'spk' | 'rab'

/** One requested item: an SPK / RAB material or anything else from Item Master. */
type ItemRow = {
  rowKey: string
  materialItemId: string
  itemUomId: string
  qty: string
  note: string
}

let rowSeq = 0
function newRow(patch: Partial<ItemRow> = {}): ItemRow {
  rowSeq += 1
  return {
    rowKey: `row-${rowSeq}`,
    materialItemId: '',
    itemUomId: '',
    qty: '',
    note: '',
    ...patch,
  }
}

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

/** Create, edit or view one SPP (material request). */
export default function PurchaseRequestEditor({
  requestId,
  productionOrderId: initialOrderId,
  purchaseRabId: initialRabId,
}: Props) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canRequest = can('purchasing.request')
  const canViewOrders = can('purchasing.viewAll')

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [request, setRequest] = useState<PurchaseRequest | null>(null)

  const [spks, setSpks] = useState<PurchasingSpk[] | null>(null)
  const [rabs, setRabs] = useState<PurchasingRabOption[] | null>(null)
  const [basis, setBasis] = useState<Basis>(initialRabId ? 'rab' : 'spk')
  /** Older SPPs made for a project without SPK: its RAB keys. */
  const [context, setContext] = useState<PurchasingProjectContext | null>(null)
  const [orderId, setOrderId] = useState('')
  const [rabId, setRabId] = useState('')
  const [plan, setPlan] = useState<PurchaseRequestPlan | null>(null)
  const [materials, setMaterials] = useState<PurchasingMaterial[] | null>(null)

  const [rows, setRows] = useState<ItemRow[]>([])
  const [neededDate, setNeededDate] = useState('')
  const [notes, setNotes] = useState('')
  const [showErrors, setShowErrors] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirm, setConfirm] = useState<
    'delete' | 'cancel' | 'decline' | 'received' | null
  >(null)
  const [cancelReason, setCancelReason] = useState('')

  const isNew = !requestId
  const editable =
    canRequest && (isNew || (request?.status === 'draft' && request.canChange))

  const loadPlan = useCallback(
    async (kind: Basis, id: string, exceptRequestId?: string) => {
      const qs = exceptRequestId ? `?exceptRequestId=${exceptRequestId}` : ''
      const path = kind === 'rab' ? 'rab-plan' : 'plan'
      return getData<PurchaseRequestPlan>(
        `/purchasing/requests/${path}/${id}${qs}`,
      )
    },
    [],
  )

  const loadContext = useCallback(async (pid: string) => {
    const ctx = await getData<PurchasingProjectContext>(
      `/purchasing/projects/${pid}/context`,
    )
    setContext(ctx)
    return ctx
  }, [])

  function defaultNeededDate(next: PurchaseRequestPlan | null) {
    if (next?.plannedStart && next.plannedStart >= jakartaDateKey(new Date())) {
      setNeededDate((d) => d || next.plannedStart || '')
    }
  }

  // Initial load.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      if (requestId) {
        const doc = await getData<PurchaseRequest>(
          `/purchasing/requests/${requestId}`,
        )
        if (cancelled || !doc) {
          setLoading(false)
          return
        }
        setRequest(doc)
        setBasis(doc.purchaseRabId ? 'rab' : 'spk')
        setOrderId(doc.productionOrderId ?? '')
        setRabId(doc.purchaseRabId ?? '')
        setNeededDate(doc.neededDate)
        setNotes(doc.notes)
        if (canRequest && doc.status === 'draft' && doc.canChange) {
          const [p] = await Promise.all([
            doc.productionOrderId
              ? loadPlan('spk', doc.productionOrderId, doc.id)
              : doc.purchaseRabId
                ? loadPlan('rab', doc.purchaseRabId, doc.id)
                : Promise.resolve(null),
            !doc.productionOrderId && !doc.purchaseRabId && doc.projectId
              ? loadContext(doc.projectId)
              : Promise.resolve(null),
          ])
          if (cancelled) return
          setPlan(p)
          setRows(
            doc.lines.map((l) =>
              newRow({
                materialItemId: l.materialItemId,
                itemUomId: l.itemUomId,
                qty: l.qty,
                note: l.note,
              }),
            ),
          )
        }
      } else if (initialOrderId || initialRabId) {
        const p = initialOrderId
          ? await loadPlan('spk', initialOrderId)
          : await loadPlan('rab', initialRabId!)
        if (cancelled) return
        if (p) {
          setPlan(p)
          setOrderId(p.productionOrderId ?? '')
          setRabId(p.purchaseRabId ?? '')
          defaultNeededDate(p)
        }
      } else {
        const [spkList, rabList] = await Promise.all([
          getData<PurchasingSpk[]>('/purchasing/spks/mine'),
          getData<PurchasingRabOption[]>('/purchasing/rabs/requestable'),
        ])
        if (cancelled) return
        setSpks(spkList ?? [])
        setRabs(rabList ?? [])
        // No SPK assigned to you: most likely a request from a RAB.
        if ((spkList ?? []).length === 0 && (rabList ?? []).length > 0) {
          setBasis('rab')
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [requestId, initialOrderId, initialRabId])

  // Item Master materials, once the form is editable.
  useEffect(() => {
    if (!editable || materials) return
    void (async () => {
      const list = await getData<PurchasingMaterial[]>('/purchasing/materials')
      setMaterials(list ?? [])
    })()
  }, [editable, materials])

  /** New SPP: the SPK or RAB decides the project. */
  async function pickBasis(kind: Basis, next: string) {
    if (kind === 'spk') setOrderId(next)
    else setRabId(next)
    setPlan(null)
    if (!next) return
    const p = await loadPlan(kind, next)
    setPlan(p)
    defaultNeededDate(p)
  }

  function switchBasis(kind: Basis) {
    if (kind === basis) return
    setBasis(kind)
    setOrderId('')
    setRabId('')
    setPlan(null)
  }

  /** SPK or RAB, for labels. */
  const what = (plan?.basis ?? basis) === 'rab' ? 'RAB' : 'SPK'
  const rabKeys = useMemo(
    () => new Set(plan?.rabKeys ?? context?.rabKeys ?? []),
    [plan, context],
  )
  const planByKey = useMemo(
    () => new Map((plan?.rows ?? []).map((r) => [materialKey(r), r])),
    [plan],
  )
  const spkUomByMaterial = useMemo(
    () => new Map((plan?.rows ?? []).map((r) => [r.materialItemId, r.itemUomId])),
    [plan],
  )
  const materialById = useMemo(
    () => new Map((materials ?? []).map((m) => [m.id, m])),
    [materials],
  )
  // SPK / RAB materials first so the common pick is at the top.
  const materialOptions = useMemo(() => {
    const spkIds = new Set((plan?.rows ?? []).map((r) => r.materialItemId))
    const all = materials ?? []
    return [
      ...all
        .filter((m) => spkIds.has(m.id))
        .map((m) => ({ value: m.id, label: `${m.itemId} · ${m.name} (${what})` })),
      ...all
        .filter((m) => !spkIds.has(m.id))
        .map((m) => ({ value: m.id, label: `${m.itemId} · ${m.name}` })),
    ]
  }, [materials, plan, what])

  function addFromSpk(r: PurchaseRequestPlanRow) {
    const left = Number(r.remainingQty)
    setRows((list) => [
      ...list,
      newRow({
        materialItemId: r.materialItemId,
        itemUomId: r.itemUomId,
        qty: left > 0 ? r.remainingQty : '',
      }),
    ])
  }

  function updateRow(rowKey: string, patch: Partial<ItemRow>) {
    setRows((list) =>
      list.map((x) => (x.rowKey === rowKey ? { ...x, ...patch } : x)),
    )
  }

  // ---- Derived lines + validation ----
  type RowInfo = {
    planRow: PurchaseRequestPlanRow | null
    over: boolean
    needsReason: boolean
    issue: string | null
  }
  const info = new Map<string, RowInfo>()
  const lines: PurchaseRequestLineInput[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const key = row.materialItemId && row.itemUomId ? materialKey(row) : ''
    const planRow = key ? (planByKey.get(key) ?? null) : null
    const qty = parseQty(row.qty)
    const over =
      planRow !== null &&
      qty !== null &&
      Number(planRow.requestedQty) + qty > Number(planRow.plannedQty) + 1e-9
    const needsReason = key !== '' && (planRow === null || over)
    let issue: string | null = null
    if (!row.materialItemId) issue = 'Choose a material'
    else if (!row.itemUomId) issue = 'Choose a unit'
    else if (qty === null) issue = 'Enter a qty above 0'
    else if (seen.has(key)) issue = 'Listed twice'
    else if (needsReason && !row.note.trim()) {
      issue = over
        ? `More than the ${what === 'RAB' ? 'RAB budgets' : 'SPK needs'}: add a reason`
        : 'Add a reason'
    }
    if (key) seen.add(key)
    info.set(row.rowKey, { planRow, over, needsReason, issue })
    if (!issue) {
      lines.push({
        materialItemId: row.materialItemId,
        itemUomId: row.itemUomId,
        qty: row.qty.trim(),
        note: row.note.trim(),
      })
    }
  }
  const issueCount = [...info.values()].filter((i) => i.issue).length
  const formErrors: string[] = []
  if (isNew && !plan) formErrors.push(basis === 'rab' ? 'Choose a RAB' : 'Choose an SPK')
  if (!neededDate) formErrors.push('Set the date needed')
  if (rows.length === 0) formErrors.push('Add at least one item')
  const canSave = issueCount === 0 && formErrors.length === 0
  const flagged = rows.filter((row) => {
    const i = info.get(row.rowKey)
    return (
      row.materialItemId &&
      row.itemUomId &&
      (i?.needsReason || !rabKeys.has(materialKey(row)))
    )
  }).length
  const keysInRows = new Set(
    rows.filter((r) => r.materialItemId && r.itemUomId).map((r) => materialKey(r)),
  )

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

  async function save(submit: boolean) {
    setShowErrors(true)
    if (!canSave) {
      toast.error('Fix the highlighted rows first')
      return
    }
    setBusy(true)
    try {
      const body = { neededDate, notes, lines }
      const saved = isNew
        ? await send<PurchaseRequest>('/purchasing/requests', {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              productionOrderId: basis === 'spk' ? orderId || null : null,
              purchaseRabId: basis === 'rab' ? rabId || null : null,
            }),
          })
        : await send<PurchaseRequest>(`/purchasing/requests/${requestId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
      if (!saved) return
      let result = saved
      if (submit) {
        const submitted = await send<PurchaseRequest>(
          `/purchasing/requests/${saved.id}/submit`,
          { method: 'POST' },
        )
        if (!submitted) {
          toast('Saved as draft; submit failed')
        } else {
          result = submitted
          toast.success(`${result.number} sent to purchasing`)
        }
      } else {
        toast.success(`${result.number} saved as draft`)
      }
      if (isNew) {
        void navigate({
          to: '/dashboard/purchasing/requests/$requestId',
          params: { requestId: result.id },
          replace: true,
        })
      } else {
        setRequest(result)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!request || !confirm) return
    setBusy(true)
    try {
      if (confirm === 'delete') {
        try {
          const response = await apiFetch<null>(
            `/purchasing/requests/${request.id}`,
            { method: 'DELETE' },
          )
          if (!response.success) {
            toast.error(response.message || 'Delete failed')
            return
          }
        } catch {
          toast.error('Unable to reach the server')
          return
        }
        toast.success('Draft deleted')
        void navigate({ to: '/dashboard/purchasing/requests' })
      } else if (confirm === 'received') {
        const next = await send<PurchaseRequest>(
          `/purchasing/requests/${request.id}/received`,
          { method: 'POST' },
        )
        if (next) {
          toast.success(`${next.number} marked as received`)
          setRequest(next)
          setConfirm(null)
        }
      } else {
        const next = await send<PurchaseRequest>(
          `/purchasing/requests/${request.id}/${confirm}`,
          { method: 'POST', body: JSON.stringify({ reason: cancelReason }) },
        )
        if (next) {
          toast.success(confirm === 'decline' ? 'Request declined' : 'Request cancelled')
          setRequest(next)
          setConfirm(null)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- Render ----
  const backLink = (
    <Link
      to="/dashboard/purchasing/requests"
      className={cn(
        buttonOutlineClassName,
        'inline-flex h-8 items-center gap-1.5 no-underline',
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      All requests
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

  if (requestId && !request) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>This request could not be loaded.</p>
      </div>
    )
  }

  const basisLabel = plan
    ? `${plan.productionOrderNumber ?? plan.purchaseRabNumber} · ${plan.itemLabel}`
    : request?.productionOrderNumber
      ? `${request.productionOrderNumber} · ${request.itemLabel ?? ''}`
      : request?.purchaseRabNumber
        ? `${request.purchaseRabNumber} · ${request.purchaseRabTitle ?? ''}`
        : null
  // Every SPP is checked against a RAB: the SPK's project RAB or a Purchasing RAB.
  const rabRef = request
    ? {
        purchaseRabId: request.purchaseRabId,
        projectId: request.projectId,
        number: request.purchaseRabNumber,
      }
    : plan
      ? {
          purchaseRabId: plan.purchaseRabId,
          projectId: plan.projectId,
          number: plan.purchaseRabNumber,
        }
      : null
  const rabLinkLabel = rabRef?.purchaseRabId
    ? (rabRef.number ?? 'Purchasing RAB')
    : rabRef?.projectId
      ? 'Project RAB'
      : null
  const projectLabel = request
    ? request.projectId
      ? `${request.projectNumber} · ${request.projectName}`
      : 'No project'
    : plan?.projectNumber
      ? `${plan.projectNumber} · ${plan.projectName}`
      : plan
        ? 'No project'
        : ''

  // Picking the SPK / RAB of a new request stays on the page; the rest opens in a sheet.
  const detailsInline = isNew && !initialOrderId && !initialRabId
  const detailsNeedAttention = !detailsInline && editable && showErrors && !neededDate
  const detailFields = (
    <>
      <div className="space-y-1">
        <span className="text-sm font-medium">{what}</span>
        {isNew && !initialOrderId && !initialRabId ? (
          basis === 'spk' ? (
            <Combobox
              value={orderId}
              onValueChange={(v) => void pickBasis('spk', v)}
              options={(spks ?? []).map((o) => ({
                value: o.id,
                label: `${o.number} · ${o.itemLabel}`,
              }))}
              placeholder="Choose your SPK"
              emptyText="No open SPK is assigned to you."
              aria-label="SPK"
              disabled={busy}
              className={cn(showErrors && !orderId && 'border-red-500')}
            />
          ) : (
            <Combobox
              value={rabId}
              onValueChange={(v) => void pickBasis('rab', v)}
              options={(rabs ?? []).map((r) => ({
                value: r.id,
                label: `${r.number} · ${r.title}`,
              }))}
              placeholder="Choose a RAB"
              emptyText="No locked RAB yet."
              aria-label="RAB"
              disabled={busy}
              className={cn(showErrors && !rabId && 'border-red-500')}
            />
          )
        ) : (
          <p className="text-sm">
            {basisLabel ?? <span className={hintClassName}>No SPK or RAB</span>}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <span className="text-sm font-medium">Project</span>
        <p className={cn('text-sm', !projectLabel && hintClassName)}>
          {projectLabel || '—'}
        </p>
      </div>
      <div className="space-y-1">
        <span className="text-sm font-medium">RAB</span>
        <p className="text-sm">
          {rabRef && rabLinkLabel ? (
            <RabLink
              purchaseRabId={rabRef.purchaseRabId}
              projectId={rabRef.projectId}
              label={rabLinkLabel}
            />
          ) : (
            <span className={hintClassName}>—</span>
          )}
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Needed by</span>
        {editable ? (
          <input
            type="date"
            value={neededDate}
            min={isNew ? jakartaDateKey(new Date()) : undefined}
            disabled={busy}
            onChange={(e) => setNeededDate(e.target.value)}
            className={cn(
              inputClassName,
              'w-full',
              showErrors && !neededDate && 'border-red-500',
            )}
          />
        ) : (
          <p className="text-sm tabular-nums">{neededDate}</p>
        )}
      </label>
    </>
  )

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {request ? request.number : 'New material request'}
          </h1>
          {request ? <PurchaseRequestStatusChip status={request.status} /> : null}
          {request?.status === 'submitted' ? (
            request.receivedAt ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                Received
              </span>
            ) : (
              <RequestOrderStatusChip status={request.orderStatus} />
            )
          ) : null}
          {!detailsInline ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-8"
              onClick={() => setDetailsOpen(true)}
            >
              Details
            </Button>
          ) : null}
        </div>
        {request && request.status !== 'draft' ? (
          <PurchaseFlowHeader
            key={`${request.id}:${request.status}:${request.orderStatus}`}
            kind="request"
            id={request.id}
          />
        ) : null}
        {editable ? (
          <p className={hintClassName}>
            Pick what you need now. You can send another request later.
          </p>
        ) : null}
        {request?.status === 'declined' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Declined by purchasing {formatWhen(request.declinedAt)} (
            {request.declinedBy?.name ?? 'Unknown'}): {request.declineReason}
          </p>
        ) : null}
        {request?.status === 'cancelled' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Cancelled {formatWhen(request.cancelledAt)} by{' '}
            {request.cancelledBy?.name ?? 'Unknown'}: {request.cancelReason}
          </p>
        ) : null}
      </div>

      {/* Request for */}
      {isNew && !initialOrderId && !initialRabId ? (
        <div
          role="radiogroup"
          aria-label="Request for"
          className="inline-flex rounded-md border border-(--line) p-0.5"
        >
          {(
            [
              ['spk', 'For an SPK'],
              ['rab', 'From a RAB'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={basis === kind}
              disabled={busy}
              onClick={() => switchBasis(kind)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                basis === kind
                  ? 'bg-(--ink) text-(--surface)'
                  : 'text-(--muted) hover:text-(--ink)',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {detailsInline ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {detailFields}
        </section>
      ) : (
        <Sheet
          open={detailsOpen || detailsNeedAttention}
          onOpenChange={(open) => {
            if (!open && detailsNeedAttention) return
            setDetailsOpen(open)
          }}
        >
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Request details</SheetTitle>
              <SheetDescription>
                {what}, project, RAB, needed date and status history.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">{detailFields}</div>
            {request && !editable ? (
              <div className="space-y-2 border-t border-(--line) px-4 py-4 text-sm">
                {request.status === 'submitted' ||
                request.status === 'cancelled' ||
                request.receivedAt ? (
                  <p className={hintClassName}>
                    Sent to purchasing {formatWhen(request.submittedAt)} by{' '}
                    {request.submittedBy?.name ??
                      request.requestedBy?.name ??
                      'Unknown'}
                    .
                  </p>
                ) : null}
                {request.receivedAt ? (
                  <p className="text-emerald-700 dark:text-emerald-300">
                    Received by {request.receivedBy?.name ?? 'Unknown'} on{' '}
                    {formatWhen(request.receivedAt)}.
                  </p>
                ) : request.canConfirmReceived ? (
                  <p className="text-emerald-700 dark:text-emerald-300">
                    Everything has arrived. Press “I have received” once you have
                    the goods.
                  </p>
                ) : null}
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      )}

      {editable ? (
        <>
          {plan && plan.rows.length > 0 ? (
            <section className="space-y-2">
              <div>
                <h2 className={sectionTitleClassName}>From this {what}</h2>
                <p className={cn('text-sm', hintClassName)}>
                  Tap a material to add it. The number is what is still not
                  requested.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {plan.rows.map((r) => {
                  const added = keysInRows.has(materialKey(r))
                  const left = Number(r.remainingQty)
                  return (
                    <button
                      key={materialKey(r)}
                      type="button"
                      disabled={busy || added}
                      onClick={() => addFromSpk(r)}
                      className={cn(
                        'inline-flex max-w-full items-center gap-1.5 rounded-md border border-(--line) px-2.5 py-1 text-sm transition-colors',
                        added
                          ? 'bg-(--surface) text-(--muted)'
                          : 'hover:bg-accent focus-visible:ring-2 focus-visible:ring-(--ink) focus-visible:outline-none',
                      )}
                      aria-label={
                        added
                          ? `${r.materialName} added`
                          : `Add ${r.materialName}`
                      }
                    >
                      {added ? (
                        <Check className="size-3.5 shrink-0" aria-hidden />
                      ) : (
                        <Plus className="size-3.5 shrink-0" aria-hidden />
                      )}
                      <span className="truncate">{r.materialName}</span>
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          left > 0 ? 'text-(--muted)' : 'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {left > 0 ? `${r.remainingQty} ${r.uomSymbol}` : 'all requested'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className={sectionTitleClassName}>Items</h2>
              <p className={cn('text-sm', hintClassName)}>
                {plan
                  ? `Items outside the ${what}, or more than it ${what === 'RAB' ? 'budgets' : 'needs'}, need a reason.`
                  : 'Any item from Item Master. Each needs a reason.'}
              </p>
            </div>
            {rows.length === 0 ? (
              <div
                className={cn(
                  'rounded-md border border-dashed border-(--line) px-4 py-6 text-center text-sm',
                  hintClassName,
                  showErrors && 'border-red-500',
                )}
              >
                {plan && plan.rows.length > 0
                  ? `No items yet. Pick from the ${what} above, or add any item.`
                  : 'No items yet.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-(--line)">
                <table className="w-full min-w-[780px] text-sm">
                  <thead className="text-left text-xs text-(--muted)">
                    <tr className="border-b border-(--line)">
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="w-28 px-3 py-2 font-medium">Unit</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Qty</th>
                      <th className="w-64 px-3 py-2 font-medium">Reason</th>
                      <th className="w-10 px-2 py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const material = materialById.get(row.materialItemId)
                      const i = info.get(row.rowKey)
                      const issue = showErrors ? (i?.issue ?? null) : null
                      const known = Boolean(row.materialItemId && row.itemUomId)
                      const planRow = i?.planRow ?? null
                      return (
                        <tr
                          key={row.rowKey}
                          className="border-b border-(--line) align-top last:border-0"
                        >
                          <td className="px-3 py-2">
                            <Combobox
                              value={row.materialItemId}
                              onValueChange={(v) => {
                                const m = materialById.get(v)
                                const uom =
                                  spkUomByMaterial.get(v) ??
                                  (m?.uoms.find((u) => u.isBase) ?? m?.uoms[0])?.id
                                updateRow(row.rowKey, {
                                  materialItemId: v,
                                  itemUomId: uom ?? '',
                                })
                              }}
                              options={materialOptions}
                              placeholder={materials ? 'Search material' : 'Loading…'}
                              contentClassName="w-[28rem]"
                              aria-label="Material"
                              disabled={busy || !materials}
                            />
                            {known ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {planRow ? (
                                  <span className={cn('text-xs tabular-nums', hintClassName)}>
                                    {what === 'RAB' ? 'RAB budgets' : 'SPK needs'}{' '}
                                    {planRow.plannedQty} {planRow.uomSymbol}
                                    {planRow.unitPrice
                                      ? ` @ ${formatRupiah(planRow.unitPrice)}`
                                      : ''}
                                    {Number(planRow.requestedQty) > 0
                                      ? ` · asked before ${planRow.requestedQty}`
                                      : ''}
                                  </span>
                                ) : plan ? (
                                  <LineFlagBadge flag="extra" />
                                ) : null}
                                {i?.over ? <LineFlagBadge flag="overPlan" /> : null}
                                {!rabKeys.has(materialKey(row)) ? (
                                  <LineFlagBadge flag="notInRab" />
                                ) : null}
                              </div>
                            ) : null}
                            {issue ? (
                              <p className="mt-1 text-xs text-red-600">{issue}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Combobox
                              value={row.itemUomId}
                              onValueChange={(v) =>
                                updateRow(row.rowKey, { itemUomId: v })
                              }
                              options={(material?.uoms ?? []).map((u) => ({
                                value: u.id,
                                label: u.symbol,
                              }))}
                              placeholder="Unit"
                              aria-label="Unit"
                              disabled={busy || !material}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              inputMode="decimal"
                              value={row.qty}
                              disabled={busy}
                              placeholder="0"
                              aria-label="Qty"
                              onChange={(e) =>
                                updateRow(row.rowKey, { qty: e.target.value })
                              }
                              className={cn(
                                inputClassNameCompact,
                                'w-full text-right tabular-nums',
                                issue === 'Enter a qty above 0' && 'border-red-500',
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.note}
                              disabled={busy}
                              placeholder={
                                i?.needsReason ? 'Why is this needed?' : 'Optional'
                              }
                              aria-label="Reason"
                              onChange={(e) =>
                                updateRow(row.rowKey, { note: e.target.value })
                              }
                              className={cn(
                                inputClassNameCompact,
                                'w-full',
                                issue && i?.needsReason && !row.note.trim() && 'border-red-500',
                              )}
                            />
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove item"
                              disabled={busy}
                              onClick={() =>
                                setRows((list) =>
                                  list.filter((x) => x.rowKey !== row.rowKey),
                                )
                              }
                            >
                              <X className="size-4" aria-hidden />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || (isNew && !plan)}
              onClick={() => setRows((list) => [...list, newRow()])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add item
            </Button>
          </section>

          <label className="block max-w-2xl space-y-1">
            <span className={sectionTitleClassName}>Notes</span>
            <textarea
              rows={3}
              value={notes}
              disabled={busy}
              placeholder="Anything purchasing should know (optional)"
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClassName, 'w-full')}
            />
          </label>

          {/* Action bar */}
          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
            <div className="text-sm">
              <span className="font-medium tabular-nums">
                {rows.length} {rows.length === 1 ? 'item' : 'items'}
              </span>
              {flagged > 0 ? (
                <span className={hintClassName}>
                  {' '}
                  · {flagged} flagged for purchasing
                </span>
              ) : null}
              {showErrors && (issueCount > 0 || formErrors.length > 0) ? (
                <p className="text-xs text-red-600">
                  {[
                    ...formErrors,
                    ...(issueCount > 0
                      ? [`${issueCount} ${issueCount === 1 ? 'row needs' : 'rows need'} attention`]
                      : []),
                  ].join(' · ')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {request?.status === 'draft' ? (
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
                onClick={() => void save(false)}
              >
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {busy ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-3.5" aria-hidden />
                )}
                Submit to purchasing
              </Button>
            </div>
          </div>
        </>
      ) : request ? (
        <>
          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>Items</h2>
            <div className="overflow-x-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="w-56 px-3 py-2 font-medium">Ordered</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Arrived</th>
                  </tr>
                </thead>
                <tbody>
                  {request.lines.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-(--line) align-top last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-(--muted) tabular-nums">
                            {l.materialCode}
                          </span>
                          <span>{l.materialName}</span>
                          {lineFlags(l).map((f) => (
                            <LineFlagBadge key={f} flag={f} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {l.qty} {l.uomSymbol}
                      </td>
                      <td className={cn('px-3 py-2', hintClassName)}>
                        {l.note || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {l.orders.length === 0 ? (
                          <span className={hintClassName}>
                            {request.status === 'submitted' ? 'Not yet' : '—'}
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {l.orders.map((o) => (
                              <li key={o.id} className="flex flex-wrap items-center gap-1.5">
                                {canViewOrders ? (
                                  <Link
                                    to="/dashboard/purchasing/orders/$orderId"
                                    params={{ orderId: o.id }}
                                    className="tabular-nums underline-offset-4 hover:underline"
                                  >
                                    {o.number}
                                  </Link>
                                ) : (
                                  <span className="tabular-nums">{o.number}</span>
                                )}
                                <span className="text-xs tabular-nums text-(--muted)">
                                  {o.qty} {l.uomSymbol}
                                </span>
                                <PurchaseOrderStatusChip status={o.status} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(l.receivedQty) > 0 ? (
                          <span
                            className={
                              Number(l.receivedQty) >= Number(l.qty)
                                ? 'text-emerald-700 dark:text-emerald-300'
                                : undefined
                            }
                          >
                            {l.receivedQty} {l.uomSymbol}
                          </span>
                        ) : (
                          <span className={hintClassName}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {request.notes ? (
            <section className="space-y-1">
              <h2 className={sectionTitleClassName}>Notes</h2>
              <p className="text-sm whitespace-pre-line">{request.notes}</p>
            </section>
          ) : null}
          {request.orders.length > 0 ? (
            <section className="space-y-2">
              <h2 className={sectionTitleClassName}>Purchase orders</h2>
              <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
                {request.orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    {canViewOrders ? (
                      <Link
                        to="/dashboard/purchasing/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-medium tabular-nums underline-offset-4 hover:underline"
                      >
                        {o.number}
                      </Link>
                    ) : (
                      <span className="font-medium tabular-nums">{o.number}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{o.vendorName}</span>
                    <span className="tabular-nums">{formatRupiah(o.total)}</span>
                    <PurchaseOrderStatusChip status={o.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className={cn('text-xs', hintClassName)}>
            Requested by {request.requestedBy?.name ?? 'Unknown'} ·{' '}
            {formatWhen(request.createdAt)} · {request.lineCount}{' '}
            {request.lineCount === 1 ? 'item' : 'items'}
            {request.flaggedCount > 0 ? ` · ${request.flaggedCount} flagged` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {request.status === 'submitted' &&
            request.orderStatus !== 'ordered' &&
            can('purchasing.manage') ? (
              <Link
                to="/dashboard/purchasing/orders/new"
                search={{ requestId: request.id }}
                className={cn(
                  buttonClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <ShoppingCart className="size-3.5" aria-hidden />
                {request.orderStatus === 'open' ? 'Create PO' : 'PO for remaining items'}
              </Link>
            ) : null}
            {request.productionOrderId && canRequest ? (
              <Link
                to="/dashboard/purchasing/requests/new"
                search={{ productionOrderId: request.productionOrderId }}
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                Request more for this SPK
              </Link>
            ) : null}
            {request.purchaseRabId && canRequest ? (
              <Link
                to="/dashboard/purchasing/requests/new"
                search={{ purchaseRabId: request.purchaseRabId }}
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <Plus className="size-3.5" aria-hidden />
                Request more from this RAB
              </Link>
            ) : null}
            {request.canConfirmReceived ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm('received')}
              >
                <PackageCheck className="size-3.5" aria-hidden />
                I have received
              </Button>
            ) : null}
            {request.status === 'submitted' &&
            can('purchasing.manage') &&
            !request.orders.some((o) => o.status !== 'cancelled') ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-red-700"
                disabled={busy}
                onClick={() => {
                  setCancelReason('')
                  setConfirm('decline')
                }}
              >
                <Ban className="size-3.5" aria-hidden />
                Decline request
              </Button>
            ) : null}
            {request.status === 'submitted' && request.canChange ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-700"
                disabled={busy}
                onClick={() => {
                  setCancelReason('')
                  setConfirm('cancel')
                }}
              >
                <Ban className="size-3.5" aria-hidden />
                Cancel request
              </Button>
            ) : null}
          </div>
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
              {confirm === 'received'
                ? `Confirm you received ${request?.number}?`
                : confirm === 'delete'
                ? `Delete draft ${request?.number}?`
                : confirm === 'decline'
                  ? `Decline ${request?.number}?`
                  : `Cancel ${request?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'received'
                ? 'Records that you have all the requested materials, with your name and the time.'
                : confirm === 'delete'
                ? 'The draft is removed. Its quantities are free to request again.'
                : confirm === 'decline'
                  ? 'The requester sees your reason. Its quantities are free to request again.'
                  : 'Purchasing will no longer act on it. Its quantities are free to request again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === 'cancel' || confirm === 'decline' ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Reason</span>
              <input
                value={cancelReason}
                disabled={busy}
                onChange={(e) => setCancelReason(e.target.value)}
                className={dialogInputClassName}
              />
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === 'received' ? 'default' : 'destructive'}
              disabled={
                busy ||
                ((confirm === 'cancel' || confirm === 'decline') && !cancelReason.trim())
              }
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {confirm === 'received'
                ? 'I have received'
                : confirm === 'delete'
                ? 'Delete'
                : confirm === 'decline'
                  ? 'Decline'
                  : 'Cancel request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
