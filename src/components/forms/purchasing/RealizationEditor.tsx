import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Camera,
  CheckCheck,
  LoaderCircle,
  Store,
  Trash2,
  Truck,
} from 'lucide-react'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { RabCompareButton } from '#/components/forms/purchasing/RabCompareDialog'
import ChargesEditor, {
  chargeStatesFrom,
  priceCharges,
  type ChargeState,
} from '#/components/forms/purchasing/ChargesEditor'
import ListTable from '#/components/forms/shared/ListTable'
import ProofFile from '#/components/forms/shared/ProofFile'
import type { ListTableColumn } from '#/components/forms/shared/ListTable'
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
import { RupiahInput } from '#/components/ui/rupiah-input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useAuth } from '#/context/authContext'
import { apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  PURCHASE_CHARGE_CATEGORIES,
  PURCHASE_CHARGE_CATEGORY_LABELS,
  REALIZATION_DOC_LABELS,
  REALIZATION_METHOD_LABELS,
  formatRupiah,
  formatRupiahDiff,
  parseQty,
} from '#/lib/purchasing'
import type {
  PurchaseChargeCategory,
  PurchasingUser,
  Realization,
  RealizationLine,
  RealizationMethod,
  RealizationPlan,
} from '#/lib/purchasing'
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
  /** Existing realization; omit for a new one. */
  realizationId?: string
  /** New realization: the approved PO it realizes. */
  orderId?: string
}

type LineState = { qty: string; unitPrice: string; note: string }


/** Penerimaan / Nota Realisasi, or a neutral name before the method is picked. */
function docLabel(method: RealizationMethod | ''): string {
  return method ? REALIZATION_DOC_LABELS[method] : 'Realization'
}

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

type PlanLine = RealizationPlan['lines'][number]

/** One charge as shown in the totals. */
type TotalCharge = {
  key: string
  category: PurchaseChargeCategory
  label: string
  detail: string
  amount: string
}

/** Goods subtotal, each charge, and the grand total the nota adds up to. */
function TotalsCard({
  subtotal,
  difference,
  charges,
  grandTotal,
}: {
  subtotal: number
  /** Goods vs the approved PO price. */
  difference: number
  charges: TotalCharge[]
  grandTotal: number
}) {
  const row = (label: ReactNode, value: ReactNode, className?: string) => (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 px-4 py-1.5',
        className,
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
  return (
    <div className="ml-auto w-full max-w-md rounded-lg border border-(--line) py-1.5 text-sm">
      {row(
        <>
          Goods subtotal
          {difference !== 0 ? (
            <span
              className={cn('ml-2 text-xs tabular-nums', diffClass(difference))}
            >
              {formatRupiahDiff(String(difference))} vs PO
            </span>
          ) : null}
        </>,
        formatRupiah(String(subtotal)),
      )}
      {PURCHASE_CHARGE_CATEGORIES.map((category) => {
        const inCategory = charges.filter((c) => c.category === category)
        if (inCategory.length === 0) return null
        const sum = inCategory.reduce((s, c) => s + Number(c.amount), 0)
        return (
          <Fragment key={category}>
            {row(
              <span className="font-medium">
                {PURCHASE_CHARGE_CATEGORY_LABELS[category]}
              </span>,
              <span className="font-medium">{formatRupiah(String(sum))}</span>,
              'mt-1',
            )}
            {inCategory.map((c) => (
              <Fragment key={c.key}>
                {row(
                  <span className="pl-3">
                    {c.label || 'Charge'}
                    {c.detail ? (
                      <span className={cn('text-xs', hintClassName)}>
                        {' '}
                        {c.detail}
                      </span>
                    ) : null}
                  </span>,
                  <span className={hintClassName}>{formatRupiah(c.amount)}</span>,
                  'py-0.5 text-xs',
                )}
              </Fragment>
            ))}
          </Fragment>
        )
      })}
      {charges.length > 0
        ? row(
            <span className={hintClassName}>Charges total</span>,
            <span className={hintClassName}>
              {formatRupiah(
                String(charges.reduce((sum, c) => sum + Number(c.amount), 0)),
              )}
            </span>,
          )
        : null}
      {row(
        <span className="font-semibold">Grand total</span>,
        <span className="font-semibold">
          {formatRupiah(String(grandTotal))}
        </span>,
        'mt-1 border-t border-(--line) pt-2',
      )}
    </div>
  )
}

/**
 * Record or view one realization of an approved PO: a Penerimaan (goods from
 * the vendor) or a Nota Realisasi (staff bought it). Same document, same qty
 * ledger; labels follow the method.
 */
export default function RealizationEditor({ realizationId, orderId }: Props) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canRealize = can('purchasing.realize')
  const canVoid = can('purchasing.manage')
  const fileInput = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [doc, setDoc] = useState<Realization | null>(null)
  const [plan, setPlan] = useState<RealizationPlan | null>(null)
  const [buyers, setBuyers] = useState<PurchasingUser[]>([])

  const [method, setMethod] = useState<RealizationMethod | ''>('')
  const [buyerId, setBuyerId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(jakartaDateKey(new Date()))
  const [place, setPlace] = useState('')
  const [notaNumber, setNotaNumber] = useState('')
  const [receivedById, setReceivedById] = useState('')
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('')
  const [deliveredTo, setDeliveredTo] = useState<'us' | 'vendor'>('us')
  const [comments, setComments] = useState('')
  const [lines, setLines] = useState<Record<string, LineState>>({})
  const [charges, setCharges] = useState<ChargeState[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'post' | 'void' | null>(
    null,
  )
  const [reason, setReason] = useState('')

  const isNew = !realizationId
  const editable =
    canRealize && (isNew || (doc?.status === 'draft' && doc.canChange))

  const apply = useCallback((next: Realization) => {
    setDoc(next)
    setMethod(next.method)
    setBuyerId(next.buyerUserId ?? '')
    setPurchaseDate(next.purchaseDate)
    setPlace(next.place)
    setNotaNumber(next.notaNumber)
    setReceivedById(next.receivedByUserId ?? '')
    setDeliveryNoteNumber(next.deliveryNoteNumber)
    setDeliveredTo(next.deliveredTo)
    setComments(next.comments)
    setCharges(chargeStatesFrom(next.charges))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      let current: Realization | null = null
      if (realizationId) {
        current = await getData<Realization>(
          `/purchasing/realizations/${realizationId}`,
        )
        if (cancelled) return
        if (current) apply(current)
      }
      const poId = current?.purchaseOrderId ?? orderId
      const willEdit =
        canRealize &&
        (!realizationId || (current?.status === 'draft' && current.canChange))
      if (poId && willEdit) {
        const qs = realizationId ? `?exceptId=${realizationId}` : ''
        const [p, users] = await Promise.all([
          getData<RealizationPlan>(
            `/purchasing/realizations/plan/${poId}${qs}`,
          ),
          getData<PurchasingUser[]>('/purchasing/realizations/buyers'),
        ])
        if (cancelled) return
        setPlan(p)
        setBuyers(users ?? [])
        const next: Record<string, LineState> = {}
        for (const l of p?.lines ?? []) {
          const saved = current?.lines.find((x) => x.poLineId === l.poLineId)
          next[l.poLineId] = saved
            ? { qty: saved.qty, unitPrice: saved.unitPrice, note: saved.note }
            : {
                qty:
                  Number(l.remainingQty) > 0 && !current ? l.remainingQty : '',
                unitPrice: l.approvedPrice,
                note: '',
              }
        }
        setLines(next)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [realizationId, orderId, canRealize, apply])

  function pickMethod(next: RealizationMethod) {
    setMethod(next)
    // Vendor invoices are usually from the PO vendor.
    if (next === 'vendor' && !place && plan) setPlace(plan.vendorName)
  }

  // ---- Derived ----
  const issues = new Map<string, string>()
  const payload: Array<{
    poLineId: string
    qty: string
    unitPrice: string
    note: string
  }> = []
  let total = 0
  let approvedTotal = 0
  for (const l of plan?.lines ?? []) {
    const st = lines[l.poLineId]
    if (!st || !st.qty.trim()) continue
    const q = parseQty(st.qty)
    if (q === null) {
      issues.set(l.poLineId, 'Enter a qty above 0, or clear it')
      continue
    }
    if (q > Number(l.remainingQty) + 1e-9) {
      issues.set(
        l.poLineId,
        `Only ${l.remainingQty} ${l.uomSymbol} left on the PO`,
      )
      continue
    }
    if (!(Number(st.unitPrice) > 0)) {
      issues.set(l.poLineId, 'Enter the actual price')
      continue
    }
    total += amountOf(st.qty, st.unitPrice)
    approvedTotal += amountOf(st.qty, l.approvedPrice)
    payload.push({
      poLineId: l.poLineId,
      qty: st.qty.trim(),
      unitPrice: st.unitPrice,
      note: st.note,
    })
  }
  const difference = total - approvedTotal
  const subtotal = total
  const {
    payload: chargePayload,
    issues: chargeIssues,
    total: chargesTotal,
  } = priceCharges(charges, subtotal)
  const grandTotal = subtotal + chargesTotal
  const estimateHint = plan
    ? PURCHASE_CHARGE_CATEGORIES.flatMap((c) =>
        plan.estimates[c]
          ? [`${PURCHASE_CHARGE_CATEGORY_LABELS[c]} ${formatRupiah(plan.estimates[c])}`]
          : [],
      ).join(', ')
    : ''
  const verb = method === 'staff' ? 'bought' : 'arrived'
  const formErrors: string[] = []
  if (!method) formErrors.push('Choose vendor or staff purchase')
  if (method === 'staff' && !buyerId) formErrors.push('Choose who bought it')
  if (!purchaseDate) formErrors.push('Set the date')
  if (payload.length === 0 && issues.size === 0)
    formErrors.push(`Enter at least one ${verb} qty`)
  if (chargeIssues.size > 0) formErrors.push('Fix the charges')
  const canSave = formErrors.length === 0 && issues.size === 0
  const photos = doc?.photos ?? []

  const buyerOptions = useMemo(
    () => buyers.map((u) => ({ value: u.id, label: u.name || u.email })),
    [buyers],
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

  async function saveDraft(): Promise<Realization | null> {
    setShowErrors(true)
    if (!canSave) {
      toast.error('Fix the highlighted fields first')
      return null
    }
    const body = JSON.stringify({
      purchaseOrderId: doc?.purchaseOrderId ?? orderId,
      method,
      buyerUserId: method === 'staff' ? buyerId || null : null,
      purchaseDate,
      place,
      notaNumber,
      receivedByUserId: method === 'vendor' ? receivedById || null : null,
      deliveryNoteNumber: method === 'vendor' ? deliveryNoteNumber : '',
      deliveredTo:
        method === 'vendor' && plan?.directToVendor ? deliveredTo : 'us',
      comments,
      lines: payload,
      charges: chargePayload,
    })
    const saved = isNew
      ? await send<Realization>('/purchasing/realizations', {
          method: 'POST',
          body,
        })
      : await send<Realization>(`/purchasing/realizations/${realizationId}`, {
          method: 'PUT',
          body,
        })
    if (saved && !isNew) apply(saved)
    return saved
  }

  function goTo(saved: Realization) {
    void navigate({
      to: '/dashboard/purchasing/realizations/$realizationId',
      params: { realizationId: saved.id },
      replace: true,
    })
  }

  async function onSave() {
    setBusy(true)
    try {
      const saved = await saveDraft()
      if (saved) {
        toast.success(`${saved.number} saved`)
        if (isNew) goTo(saved)
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
      // A new realization is saved first so the files have somewhere to go.
      const target = doc ?? (await saveDraft())
      if (!target) return
      const form = new FormData()
      for (const f of files) form.append('files', f)
      const response = await apiUpload<Realization>(
        `/purchasing/realizations/${target.id}/photos`,
        form,
      )
      if (!response.success) {
        toast.error(response.message || 'Upload failed')
        if (isNew) goTo(target)
        return
      }
      toast.success(
        files.length === 1 ? 'File added' : `${files.length} files added`,
      )
      if (isNew) goTo(response.data)
      else apply(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function removePhoto(photoId: string) {
    if (!doc) return
    setBusy(true)
    try {
      const next = await send<Realization>(
        `/purchasing/realizations/${doc.id}/photos/${photoId}`,
        { method: 'DELETE' },
      )
      if (next) apply(next)
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirm || !doc) return
    setBusy(true)
    try {
      if (confirm === 'delete') {
        try {
          const response = await apiFetch<null>(
            `/purchasing/realizations/${doc.id}`,
            {
              method: 'DELETE',
            },
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
        void navigate({ to: '/dashboard/purchasing/realizations' })
        return
      }
      if (confirm === 'post') {
        const saved = await saveDraft()
        if (!saved) return
        const next = await send<Realization>(
          `/purchasing/realizations/${doc.id}/post`,
          {
            method: 'POST',
          },
        )
        if (next) {
          toast.success(`${next.number} posted`)
          apply(next)
          setConfirm(null)
        }
        return
      }
      const next = await send<Realization>(
        `/purchasing/realizations/${doc.id}/void`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      )
      if (next) {
        toast.success(`${next.number} voided`)
        apply(next)
        setConfirm(null)
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- Columns ----
  const lineState = (l: PlanLine): LineState =>
    lines[l.poLineId] ?? { qty: '', unitPrice: l.approvedPrice, note: '' }
  const updateLine = (l: PlanLine, patch: Partial<LineState>) =>
    setLines((prev) => ({
      ...prev,
      [l.poLineId]: { ...lineState(l), ...patch },
    }))
  const lineDiff = (l: PlanLine) => {
    const st = lineState(l)
    return amountOf(st.qty, st.unitPrice) - amountOf(st.qty, l.approvedPrice)
  }

  const editColumns: ListTableColumn<PlanLine>[] = [
    {
      header: 'Material',
      cell: (l) => {
        const st = lineState(l)
        const issue = showErrors ? issues.get(l.poLineId) : undefined
        return (
          <div className="min-w-0 py-0.5">
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs text-(--muted)">
                {l.materialCode}
              </span>
              <span className="truncate">{l.materialName}</span>
            </div>
            <p className={cn('text-xs tabular-nums', hintClassName)}>
              PO {l.orderedQty} {l.uomSymbol} at {formatRupiah(l.approvedPrice)}
              {Number(l.realizedQty) > 0
                ? ` · ${l.realizedQty} on other realizations`
                : ''}
              {Number(l.remainingQty) <= 0
                ? ' · all done'
                : ` · ${l.remainingQty} left`}
            </p>
            {lineDiff(l) !== 0 || st.note ? (
              <input
                value={st.note}
                disabled={busy}
                placeholder="Why the price differs (optional)"
                aria-label={`Note for ${l.materialName}`}
                onChange={(e) => updateLine(l, { note: e.target.value })}
                className={cn(inputClassNameCompact, 'mt-1 w-full max-w-md')}
              />
            ) : null}
            {issue ? (
              <p className="mt-1 text-xs text-red-600">{issue}</p>
            ) : null}
          </div>
        )
      },
    },
    {
      header: method === 'staff' ? 'Bought qty' : 'Arrived qty',
      align: 'right',
      widthClassName: 'w-36',
      cell: (l) => {
        const st = lineState(l)
        return (
          <div className="flex items-center justify-end gap-1.5">
            <input
              inputMode="decimal"
              value={st.qty}
              disabled={busy || (Number(l.remainingQty) <= 0 && !st.qty)}
              placeholder="0"
              aria-label={`Qty of ${l.materialName}`}
              onChange={(e) => updateLine(l, { qty: e.target.value })}
              className={cn(
                inputClassNameCompact,
                'w-20 text-right tabular-nums',
                showErrors && issues.has(l.poLineId) && 'border-red-500',
              )}
            />
            <span className="w-8 text-left text-xs text-(--muted)">
              {l.uomSymbol}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Actual price',
      align: 'right',
      widthClassName: 'w-44',
      cell: (l) => (
        <RupiahInput
          value={lineState(l).unitPrice}
          onValueChange={(digits) => updateLine(l, { unitPrice: digits })}
          disabled={busy}
          aria-label={`Actual price of ${l.materialName}`}
          className="h-8 text-right"
        />
      ),
    },
    {
      header: 'Amount',
      align: 'right',
      widthClassName: 'w-36',
      cellClassName: 'font-medium',
      cell: (l) => {
        const st = lineState(l)
        return st.qty
          ? formatRupiah(String(amountOf(st.qty, st.unitPrice)))
          : '—'
      },
    },
    {
      header: 'vs PO',
      align: 'right',
      widthClassName: 'w-32',
      cell: (l) =>
        lineState(l).qty ? (
          <span className={cn('text-xs', diffClass(lineDiff(l)))}>
            {formatRupiahDiff(String(lineDiff(l)))}
          </span>
        ) : null,
    },
  ]

  const viewColumns: ListTableColumn<RealizationLine>[] = [
    {
      header: 'Material',
      cell: (l) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-xs text-(--muted)">
              {l.materialCode}
            </span>
            <span className="truncate">{l.materialName}</span>
          </div>
          {l.note ? (
            <p className={cn('text-xs', hintClassName)}>“{l.note}”</p>
          ) : null}
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
      cell: (l) => formatRupiah(l.approvedPrice),
    },
    {
      header: 'Actual price',
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
      to="/dashboard/purchasing/realizations"
      className={cn(
        buttonOutlineClassName,
        'inline-flex h-8 items-center gap-1.5 no-underline',
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Realizations
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
  if ((realizationId && !doc) || (isNew && !plan)) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>
          {isNew
            ? 'Open an approved PO to record what arrived or was bought.'
            : 'This realization could not be loaded.'}
        </p>
      </div>
    )
  }

  const poId = doc?.purchaseOrderId ?? plan?.purchaseOrderId ?? ''
  const banner = {
    poNumber: plan?.poNumber ?? doc?.poNumber ?? '',
    vendor: plan?.vendorName ?? doc?.vendorName ?? '',
    request: plan?.requestNumber ?? doc?.requestNumber ?? '',
    project: plan
      ? `${plan.projectNumber} · ${plan.projectName}`
      : doc
        ? `${doc.projectNumber} · ${doc.projectName}`
        : '',
  }

  const photoSection = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={sectionTitleClassName}>Files</h2>
          <p className={cn('text-sm', hintClassName)}>
            {editable
              ? method === 'vendor'
                ? 'Photos or PDF scans of the invoice, surat jalan or the goods. At least one is needed to post.'
                : 'Photos or PDF scans of the shop nota or receipt. At least one is needed to post.'
              : `${photos.length} ${photos.length === 1 ? 'file' : 'files'}. Click to open full size.`}
          </p>
        </div>
        {editable ? (
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
              disabled={busy || uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-3.5" aria-hidden />
              )}
              Add photos
            </Button>
          </>
        ) : null}
      </div>
      {photos.length === 0 ? (
        <button
          type="button"
          disabled={!editable || busy || uploading}
          onClick={() => fileInput.current?.click()}
          className={cn(
            'flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-(--line) px-4 py-8 text-sm',
            hintClassName,
            editable && 'hover:bg-accent',
          )}
        >
          <Camera className="size-5" aria-hidden />
          {editable
            ? method === 'vendor'
              ? 'Take or choose photos of the invoice / surat jalan'
              : 'Take or choose photos of the nota'
            : 'No files.'}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <ProofFile
              key={p.id}
              path={`/purchasing/realizations/${doc!.id}/photos/${p.id}`}
              photo={p}
              disabled={busy}
              onRemove={editable ? () => void removePhoto(p.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )

  const detailsNeedAttention =
    editable && showErrors && method === 'staff' && !buyerId
  const detailSummary = editable
    ? method
      ? [
          (method === 'staff'
            ? buyerOptions.find((o) => o.value === buyerId)?.label
            : buyerOptions.find((o) => o.value === receivedById)?.label) ?? '',
          purchaseDate,
          place,
          notaNumber,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''
    : doc
      ? [
          doc.method === 'vendor' ? doc.receivedByName : doc.buyerName,
          doc.purchaseDate,
          doc.place,
          doc.notaNumber,
        ]
          .filter(Boolean)
          .join(' · ')
      : ''

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {doc ? doc.number : `Record ${docLabel(method)}`}
          </h1>
          {doc ? <RealizationStatusChip status={doc.status} /> : null}
          {doc ? (
            <span className={cn('text-sm', hintClassName)}>
              {docLabel(editable ? method : doc.method)}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {poId ? <RabCompareButton orderId={poId} /> : null}
            {doc || method ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setDetailsOpen(true)}
              >
                Details
              </Button>
            ) : null}
          </div>
        </div>
        {doc ? (
          <PurchaseFlowHeader key={`${doc.id}:${doc.status}`} kind="realization" id={doc.id} />
        ) : null}
        <p className="text-sm">
          For{' '}
          <Link
            to="/dashboard/purchasing/orders/$orderId"
            params={{ orderId: poId }}
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            {banner.poNumber}
          </Link>
          {banner.vendor ? (
            <span className={hintClassName}> · {banner.vendor}</span>
          ) : null}
        </p>
        {editable && plan && plan.drafts.length > 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {plan.lines.every((l) => Number(l.remainingQty) <= 0)
              ? 'Everything left on this PO is already on '
              : 'Part of this PO is already on '}
            {plan.drafts.map((d, i) => (
              <span key={d.id}>
                {i > 0 ? ', ' : ''}
                <Link
                  to="/dashboard/purchasing/realizations/$realizationId"
                  params={{ realizationId: d.id }}
                  className="font-medium underline underline-offset-4"
                >
                  {d.number}
                </Link>
              </span>
            ))}
            {plan.drafts.length === 1
              ? ', a draft not posted yet.'
              : ', drafts not posted yet.'}{' '}
            Open it to change or post it instead of recording again.
          </p>
        ) : null}
        {doc?.status === 'draft' && !editable ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {!canRealize
              ? 'You can view this draft, but you do not have the permission to record realizations.'
              : `Only ${doc.createdBy?.name ?? 'the person who recorded it'} can edit or post this draft.`}
          </p>
        ) : null}
        {doc?.status === 'voided' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Voided {formatWhen(doc.voidedAt)} by{' '}
            {doc.voidedBy?.name ?? 'Unknown'}: {doc.voidReason}
          </p>
        ) : null}
      </div>

      {editable ? (
        <>
          {/* How */}
          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>How did it come in?</h2>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="How did it come in"
            >
              {(
                [
                  [
                    'vendor',
                    Truck,
                    'The vendor delivered: record a Penerimaan with its invoice / surat jalan.',
                  ],
                  [
                    'staff',
                    Store,
                    'Our staff bought it at a shop: record a Nota Realisasi.',
                  ],
                ] as const
              ).map(([value, Icon, hint]) => {
                const active = method === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={busy}
                    onClick={() => pickMethod(value)}
                    className={cn(
                      'flex items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-(--ink) focus-visible:outline-none',
                      active
                        ? 'border-(--ink) bg-accent'
                        : 'border-(--line) hover:bg-accent',
                      showErrors && !method && 'border-red-500',
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">
                        {REALIZATION_METHOD_LABELS[value]}
                      </span>
                      <span className={cn('block text-xs', hintClassName)}>
                        {hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Details */}
          <Sheet
            open={detailsOpen || detailsNeedAttention}
            onOpenChange={(open) => {
              if (!open && detailsNeedAttention) return
              setDetailsOpen(open)
            }}
          >
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Details</SheetTitle>
                <SheetDescription>
                  Who, when, where, document numbers and PO context.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 border-b border-(--line) px-4 pb-4 text-sm">
                {detailSummary ? (
                  <p className={cn('tabular-nums', hintClassName)}>{detailSummary}</p>
                ) : null}
                <p className={hintClassName}>
                  {banner.request}
                  {banner.project ? ` · ${banner.project}` : ''}
                </p>
                {doc?.status === 'posted' ? (
                  <p className={hintClassName}>
                    Posted {formatWhen(doc.postedAt)} by{' '}
                    {doc.postedBy?.name ?? 'Unknown'}.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 px-4 pb-4 text-sm sm:grid-cols-2">
                {method === 'vendor' ? (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">
                      Received by
                      <span className={cn('font-normal', hintClassName)}>
                        {' '}
                        (optional)
                      </span>
                    </span>
                    <Combobox
                      value={receivedById}
                      onValueChange={setReceivedById}
                      options={buyerOptions}
                      placeholder="Who took the goods"
                      aria-label="Received by"
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-sm font-medium">Bought by</span>
                    <Combobox
                      value={buyerId}
                      onValueChange={setBuyerId}
                      options={buyerOptions}
                      placeholder="Choose a person"
                      aria-label="Bought by"
                      disabled={busy}
                      className={cn(
                        showErrors &&
                          method === 'staff' &&
                          !buyerId &&
                          'border-red-500',
                      )}
                    />
                  </div>
                )}
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Date</span>
                  <input
                    type="date"
                    value={purchaseDate}
                    max={jakartaDateKey(new Date())}
                    disabled={busy}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className={cn(inputClassName, 'w-full')}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {method === 'staff' ? 'Shop' : 'Vendor'}
                  </span>
                  <input
                    value={place}
                    disabled={busy}
                    placeholder={method === 'staff' ? 'Shop name' : 'Vendor'}
                    onChange={(e) => setPlace(e.target.value)}
                    className={cn(inputClassName, 'w-full')}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {method === 'staff' ? 'Nota no.' : 'Invoice no.'}
                    <span className={cn('font-normal', hintClassName)}>
                      {' '}
                      (optional)
                    </span>
                  </span>
                  <input
                    value={notaNumber}
                    disabled={busy}
                    onChange={(e) => setNotaNumber(e.target.value)}
                    className={cn(inputClassName, 'w-full')}
                  />
                </label>
                {method === 'vendor' ? (
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      Surat jalan no.
                      <span className={cn('font-normal', hintClassName)}>
                        {' '}
                        (optional)
                      </span>
                    </span>
                    <input
                      value={deliveryNoteNumber}
                      disabled={busy}
                      onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                      className={cn(inputClassName, 'w-full')}
                    />
                  </label>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>

          {/* Items */}
          <section className="space-y-3">
            <div>
              <h2 className={sectionTitleClassName}>
                {method === 'staff' ? 'What was bought' : 'What arrived'}
              </h2>
              <p className={cn('text-sm', hintClassName)}>
                Filled with what is still open on the PO. Change qty and price
                to match the {method === 'staff' ? 'nota' : 'invoice'}; clear a
                qty if it did not come this time.
              </p>
              {method === 'vendor' && plan?.directToVendor ? (
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={deliveredTo === 'vendor'}
                    disabled={!editable || busy}
                    onChange={(e) =>
                      setDeliveredTo(e.target.checked ? 'vendor' : 'us')
                    }
                  />
                  <span>
                    Supplier ships straight to the subcon vendor (
                    {plan.directToVendor.join(', ')})
                    <span className={cn('block text-xs', hintClassName)}>
                      It counts as arrived and already at the vendor, so no
                      surat jalan from our warehouse is needed.
                    </span>
                  </span>
                </label>
              ) : doc?.deliveredTo === 'vendor' ? (
                <p className="mt-2 text-sm">
                  Delivered straight to the subcon vendor.
                </p>
              ) : null}
            </div>
            <ListTable<PlanLine>
              rows={plan?.lines ?? []}
              rowKey={(l) => l.poLineId}
              empty="This PO has no lines."
              minWidthClassName="min-w-[820px]"
              isRowMuted={(l) =>
                Number(l.remainingQty) <= 0 && !lineState(l).qty
              }
              columns={editColumns}
            />
          </section>

          <details
            className="rounded-md border border-(--line) open:pb-3"
            open={charges.length > 0 || photos.length > 0 || Boolean(comments)}
          >
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              More · charges, files, comments
            </summary>
            <div className="space-y-6 px-3">
              <ChargesEditor
                rows={charges}
                onChange={setCharges}
                subtotal={subtotal}
                disabled={busy}
                showErrors={showErrors}
                hint={`Tax, delivery and other costs on top of the goods; leave empty if there are none.${estimateHint ? ` PO estimate: ${estimateHint}.` : ''}`}
                footer={
                  <TotalsCard
                    subtotal={subtotal}
                    difference={difference}
                    charges={charges.flatMap((c, i) =>
                      chargeIssues.has(c.key)
                        ? []
                        : [
                            {
                              key: c.key,
                              category: c.category,
                              label: c.label.trim(),
                              detail:
                                c.kind === 'percent'
                                  ? `(${c.rate}% of goods)`
                                  : '',
                              amount: chargePayload[i].amount,
                            },
                          ],
                    )}
                    grandTotal={grandTotal}
                  />
                }
              />
              {photoSection}
              <label className="block max-w-2xl space-y-1">
                <span className={sectionTitleClassName}>Comments</span>
                <textarea
                  rows={3}
                  value={comments}
                  disabled={busy}
                  placeholder="Anything worth knowing: delivery, substitutes, missing items… (optional)"
                  onChange={(e) => setComments(e.target.value)}
                  className={cn(inputClassName, 'w-full')}
                />
              </label>
            </div>
          </details>

          {/* Action bar */}
          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
            <div className="text-sm">
              <span className={hintClassName}>Grand total </span>
              <span className="font-semibold tabular-nums">
                {formatRupiah(String(grandTotal))}
              </span>
              <span className={cn('tabular-nums', hintClassName)}>
                {' '}
                · goods {formatRupiah(String(subtotal))}
                {chargesTotal > 0
                  ? ` + charges ${formatRupiah(String(chargesTotal))}`
                  : ''}
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
              ) : photos.length === 0 ? (
                <p className={cn('text-xs', hintClassName)}>
                  Add a file to post.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {doc ? (
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
                disabled={busy || uploading}
                onClick={() => void onSave()}
              >
                Save draft
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || uploading || !doc || photos.length === 0}
                onClick={() => {
                  setShowErrors(true)
                  if (canSave) setConfirm('post')
                  else toast.error('Fix the highlighted fields first')
                }}
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Post {docLabel(method)}
              </Button>
            </div>
          </div>
        </>
      ) : doc ? (
        <>
          <Sheet
            open={detailsOpen}
            onOpenChange={(open) => {
              if (!open && detailsNeedAttention) return
              setDetailsOpen(open)
            }}
          >
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Details</SheetTitle>
                <SheetDescription>
                  Who, when, where, document numbers and PO context.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 border-b border-(--line) px-4 pb-4 text-sm">
                {detailSummary ? (
                  <p className={cn('tabular-nums', hintClassName)}>{detailSummary}</p>
                ) : null}
                <p className={hintClassName}>
                  {banner.request}
                  {banner.project ? ` · ${banner.project}` : ''}
                </p>
                {doc.status === 'posted' ? (
                  <p className={hintClassName}>
                    Posted {formatWhen(doc.postedAt)} by{' '}
                    {doc.postedBy?.name ?? 'Unknown'}.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 px-4 pb-4 text-sm sm:grid-cols-2">
                <div>
                  <p className={cn('text-xs', hintClassName)}>How</p>
                  <p>{REALIZATION_METHOD_LABELS[doc.method]}</p>
                </div>
                <div>
                  <p className={cn('text-xs', hintClassName)}>
                    {doc.method === 'vendor' ? 'Received by' : 'Bought by'}
                  </p>
                  <p>
                    {(doc.method === 'vendor'
                      ? doc.receivedByName
                      : doc.buyerName) || '—'}
                  </p>
                </div>
                <div>
                  <p className={cn('text-xs', hintClassName)}>
                    Date · {doc.method === 'staff' ? 'shop' : 'vendor'}
                  </p>
                  <p className="tabular-nums">
                    {doc.purchaseDate} · {doc.place || '—'}
                  </p>
                </div>
                <div>
                  <p className={cn('text-xs', hintClassName)}>
                    {doc.method === 'staff'
                      ? 'Nota no.'
                      : 'Invoice no. · surat jalan'}
                  </p>
                  <p>
                    {doc.method === 'staff'
                      ? doc.notaNumber || '—'
                      : `${doc.notaNumber || '—'} · ${doc.deliveryNoteNumber || '—'}`}
                  </p>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>
              {doc.method === 'staff' ? 'What was bought' : 'What arrived'}
            </h2>
            <ListTable<RealizationLine>
              rows={doc.lines}
              rowKey={(l) => l.id}
              empty="No items."
              minWidthClassName="min-w-[720px]"
              columns={viewColumns}
            />
            <TotalsCard
              subtotal={Number(doc.subtotal)}
              difference={Number(doc.difference)}
              charges={doc.charges.map((c) => ({
                key: c.id,
                category: c.category,
                label: c.label,
                detail: c.kind === 'percent' ? `(${c.rate}% of goods)` : '',
                amount: c.amount,
              }))}
              grandTotal={Number(doc.total)}
            />
          </section>

          {(doc.photos.length > 0 || doc.comments) ? (
            <details className="rounded-md border border-(--line) open:pb-3">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                More · files, comments
              </summary>
              <div className="space-y-4 px-3">
                {photoSection}
                {doc.comments ? (
                  <section className="space-y-1">
                    <h2 className={sectionTitleClassName}>Comments</h2>
                    <p className="text-sm whitespace-pre-line">{doc.comments}</p>
                  </section>
                ) : null}
              </div>
            </details>
          ) : null}

          <p className={cn('text-xs', hintClassName)}>
            Recorded by {doc.createdBy?.name ?? 'Unknown'} ·{' '}
            {formatWhen(doc.createdAt)}
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
              Void {docLabel(doc.method)}
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
              {confirm === 'post'
                ? `Post ${doc?.number}?`
                : confirm === 'void'
                  ? `Void ${doc?.number}?`
                  : `Delete draft ${doc?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'post'
                ? `${formatRupiah(String(grandTotal))} (goods ${formatRupiahDiff(String(difference))} vs approved${chargesTotal > 0 ? `, incl. ${formatRupiah(String(chargesTotal))} charges` : ''}), ${photos.length} ${photos.length === 1 ? 'file' : 'files'}. The qty counts as ${verb} on the SPP / SPK and it can no longer be edited.`
                : confirm === 'void'
                  ? 'Its qty no longer counts as arrived on the SPP / SPK and can be recorded again.'
                  : 'The draft and its files are removed.'}
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
              {confirm === 'post'
                ? 'Post'
                : confirm === 'void'
                  ? 'Void'
                  : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
