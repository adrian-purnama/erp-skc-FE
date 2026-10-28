import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Ban,
  Camera,
  CheckCheck,
  FileText,
  LoaderCircle,
  Store,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
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
import { RupiahInput } from '#/components/ui/rupiah-input'
import { useAuth } from '#/context/authContext'
import { apiBlobUrl, apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  REALIZATION_METHOD_LABELS,
  formatRupiah,
  formatRupiahDiff,
  parseQty,
} from '#/lib/purchasing'
import type {
  PurchasingUser,
  Realization,
  RealizationMethod,
  RealizationPhoto,
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
  /** Existing nota; omit for a new one. */
  realizationId?: string
  /** New nota: the approved PO it realizes. */
  orderId?: string
}

type LineState = { qty: string; unitPrice: string; note: string }

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

/** One nota file: image thumbnail or a PDF card; opens full size in a new tab. */
function NotaFile({
  realizationId,
  photo,
  onRemove,
  disabled,
}: {
  realizationId: string
  photo: RealizationPhoto
  onRemove?: () => void
  disabled?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = photo.contentType.startsWith('image/')
  const path = `/purchasing/realizations/${realizationId}/photos/${photo.id}`

  useEffect(() => {
    if (!isImage) return
    let revoked = false
    let made: string | null = null
    void apiBlobUrl(path)
      .then((u) => {
        made = u
        if (revoked) URL.revokeObjectURL(u)
        else setUrl(u)
      })
      .catch(() => undefined)
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [path, isImage])

  async function open() {
    try {
      const u = url ?? (await apiBlobUrl(path))
      window.open(u, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the file')
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-md border border-(--line) bg-(--surface)">
      <button
        type="button"
        onClick={() => void open()}
        className="block aspect-[4/3] w-full focus-visible:ring-2 focus-visible:ring-(--ink) focus-visible:outline-none"
        aria-label={`Open ${photo.originalFilename}`}
      >
        {isImage ? (
          url ? (
            <img src={url} alt={photo.originalFilename} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center">
              <LoaderCircle className="size-4 animate-spin text-(--muted)" aria-hidden />
            </span>
          )
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-(--muted)">
            <FileText className="size-6" aria-hidden />
            <span className="text-xs">PDF</span>
          </span>
        )}
      </button>
      <p className="truncate px-2 py-1 text-xs" title={photo.originalFilename}>
        {photo.originalFilename}
      </p>
      {onRemove ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="absolute top-1 right-1 opacity-90"
          aria-label={`Remove ${photo.originalFilename}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

/** Record or view one Nota Realisasi for an approved PO. */
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
  const [comments, setComments] = useState('')
  const [lines, setLines] = useState<Record<string, LineState>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'post' | 'void' | null>(null)
  const [reason, setReason] = useState('')

  const isNew = !realizationId
  const editable = canRealize && (isNew || (doc?.status === 'draft' && doc.canChange))

  const apply = useCallback((next: Realization) => {
    setDoc(next)
    setMethod(next.method)
    setBuyerId(next.buyerUserId ?? '')
    setPurchaseDate(next.purchaseDate)
    setPlace(next.place)
    setNotaNumber(next.notaNumber)
    setComments(next.comments)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      let current: Realization | null = null
      if (realizationId) {
        current = await getData<Realization>(`/purchasing/realizations/${realizationId}`)
        if (cancelled) return
        if (current) apply(current)
      }
      const poId = current?.purchaseOrderId ?? orderId
      const willEdit =
        canRealize && (!realizationId || (current?.status === 'draft' && current.canChange))
      if (poId && willEdit) {
        const qs = realizationId ? `?exceptId=${realizationId}` : ''
        const [p, users] = await Promise.all([
          getData<RealizationPlan>(`/purchasing/realizations/plan/${poId}${qs}`),
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
                qty: Number(l.remainingQty) > 0 && !current ? l.remainingQty : '',
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
  const payload: Array<{ poLineId: string; qty: string; unitPrice: string; note: string }> = []
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
      issues.set(l.poLineId, `Only ${l.remainingQty} ${l.uomSymbol} left on the PO`)
      continue
    }
    if (!(Number(st.unitPrice) > 0)) {
      issues.set(l.poLineId, 'Enter the actual price')
      continue
    }
    total += amountOf(st.qty, st.unitPrice)
    approvedTotal += amountOf(st.qty, l.approvedPrice)
    payload.push({ poLineId: l.poLineId, qty: st.qty.trim(), unitPrice: st.unitPrice, note: st.note })
  }
  const difference = total - approvedTotal
  const formErrors: string[] = []
  if (!method) formErrors.push('Choose how it was bought')
  if (method === 'staff' && !buyerId) formErrors.push('Choose who bought it')
  if (!purchaseDate) formErrors.push('Set the purchase date')
  if (payload.length === 0 && issues.size === 0) formErrors.push('Enter at least one bought qty')
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
      buyerUserId: buyerId || null,
      purchaseDate,
      place,
      notaNumber,
      comments,
      lines: payload,
    })
    const saved = isNew
      ? await send<Realization>('/purchasing/realizations', { method: 'POST', body })
      : await send<Realization>(`/purchasing/realizations/${realizationId}`, { method: 'PUT', body })
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
      // A new nota is saved first so the files have somewhere to go.
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
      toast.success(files.length === 1 ? 'File added' : `${files.length} files added`)
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
          const response = await apiFetch<null>(`/purchasing/realizations/${doc.id}`, {
            method: 'DELETE',
          })
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
        const next = await send<Realization>(`/purchasing/realizations/${doc.id}/post`, {
          method: 'POST',
        })
        if (next) {
          toast.success(`${next.number} posted`)
          apply(next)
          setConfirm(null)
        }
        return
      }
      const next = await send<Realization>(`/purchasing/realizations/${doc.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
      if (next) {
        toast.success('Nota voided')
        apply(next)
        setConfirm(null)
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- Render ----
  const backLink = (
    <Link
      to="/dashboard/purchasing/realizations"
      className={cn(buttonOutlineClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Nota Realisasi
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
          {isNew ? 'Open an approved PO to record its nota.' : 'This nota could not be loaded.'}
        </p>
      </div>
    )
  }

  const poId = doc?.purchaseOrderId ?? plan?.purchaseOrderId ?? ''
  const banner = {
    poNumber: plan?.poNumber ?? doc?.poNumber ?? '',
    vendor: plan?.vendorName ?? doc?.vendorName ?? '',
    request: plan?.requestNumber ?? doc?.requestNumber ?? '',
    project: plan ? `${plan.projectNumber} · ${plan.projectName}` : doc ? `${doc.projectNumber} · ${doc.projectName}` : '',
  }

  const photoSection = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={sectionTitleClassName}>Nota photos</h2>
          <p className={cn('text-sm', hintClassName)}>
            {editable
              ? 'Photos or PDF scans of the nota, receipt or invoice. At least one is needed to post.'
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
          {editable ? 'Take or choose photos of the nota' : 'No files.'}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {photos.map((p) => (
            <NotaFile
              key={p.id}
              realizationId={doc!.id}
              photo={p}
              disabled={busy}
              onRemove={editable ? () => void removePhoto(p.id) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {doc ? doc.number : 'Record nota'}
          </h1>
          {doc ? <RealizationStatusChip status={doc.status} /> : null}
        </div>
        <p className="text-sm">
          For{' '}
          <Link
            to="/dashboard/purchasing/orders/$orderId"
            params={{ orderId: poId }}
            className="font-medium tabular-nums underline-offset-4 hover:underline"
          >
            {banner.poNumber}
          </Link>
          <span className={hintClassName}>
            {' '}
            · {banner.vendor} · {banner.request} · {banner.project}
          </span>
        </p>
        {doc?.status === 'posted' ? (
          <p className={hintClassName}>
            Posted {formatWhen(doc.postedAt)} by {doc.postedBy?.name ?? 'Unknown'}.
          </p>
        ) : null}
        {doc?.status === 'voided' ? (
          <p className="text-sm text-red-700 dark:text-red-300">
            Voided {formatWhen(doc.voidedAt)} by {doc.voidedBy?.name ?? 'Unknown'}: {doc.voidReason}
          </p>
        ) : null}
      </div>

      {editable ? (
        <>
          {/* How */}
          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>How was it bought?</h2>
            <div
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="How was it bought"
            >
              {(
                [
                  ['vendor', Truck, 'The vendor delivered and sent a nota or invoice.'],
                  ['staff', Store, 'Our staff bought it at a shop.'],
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
                      <span className={cn('block text-xs', hintClassName)}>{hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Details */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <span className="text-sm font-medium">
                {method === 'vendor' ? 'Received by' : 'Bought by'}
                {method === 'vendor' ? (
                  <span className={cn('font-normal', hintClassName)}> (optional)</span>
                ) : null}
              </span>
              <Combobox
                value={buyerId}
                onValueChange={setBuyerId}
                options={buyerOptions}
                placeholder="Choose a person"
                aria-label="Buyer"
                disabled={busy}
                className={cn(showErrors && method === 'staff' && !buyerId && 'border-red-500')}
              />
            </div>
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
              <span className="text-sm font-medium">Where</span>
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
                Nota / invoice no.
                <span className={cn('font-normal', hintClassName)}> (optional)</span>
              </span>
              <input
                value={notaNumber}
                disabled={busy}
                onChange={(e) => setNotaNumber(e.target.value)}
                className={cn(inputClassName, 'w-full')}
              />
            </label>
          </section>

          {/* Items */}
          <section className="space-y-3">
            <div>
              <h2 className={sectionTitleClassName}>What was bought</h2>
              <p className={cn('text-sm', hintClassName)}>
                Filled with what is still open on the PO. Change qty and price to match the nota;
                clear a qty if it was not bought this time.
              </p>
            </div>
            <div className="overflow-x-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Bought qty</th>
                    <th className="w-48 px-3 py-2 text-right font-medium">Actual price</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">vs approved</th>
                  </tr>
                </thead>
                <tbody>
                  {(plan?.lines ?? []).map((l) => {
                    const st = lines[l.poLineId] ?? { qty: '', unitPrice: l.approvedPrice, note: '' }
                    const issue = showErrors ? issues.get(l.poLineId) : undefined
                    const done = Number(l.remainingQty) <= 0
                    const amount = amountOf(st.qty, st.unitPrice)
                    const diff = amount - amountOf(st.qty, l.approvedPrice)
                    const update = (patch: Partial<LineState>) =>
                      setLines({ ...lines, [l.poLineId]: { ...st, ...patch } })
                    return (
                      <tr
                        key={l.poLineId}
                        className={cn(
                          'border-b border-(--line) align-top last:border-0',
                          done && !st.qty && 'opacity-60',
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-(--muted) tabular-nums">{l.materialCode}</span>
                            <span>{l.materialName}</span>
                          </div>
                          <p className={cn('mt-0.5 text-xs tabular-nums', hintClassName)}>
                            PO {l.orderedQty} {l.uomSymbol} at {formatRupiah(l.approvedPrice)}
                            {Number(l.realizedQty) > 0 ? ` · bought before ${l.realizedQty}` : ''}
                            {done ? ' · all bought' : ''}
                          </p>
                          {diff !== 0 || st.note ? (
                            <input
                              value={st.note}
                              disabled={busy}
                              placeholder="Why the price differs (optional)"
                              aria-label={`Note for ${l.materialName}`}
                              onChange={(e) => update({ note: e.target.value })}
                              className={cn(inputClassNameCompact, 'mt-1.5 w-full max-w-md')}
                            />
                          ) : null}
                          {issue ? <p className="mt-1 text-xs text-red-600">{issue}</p> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            <input
                              inputMode="decimal"
                              value={st.qty}
                              disabled={busy || (done && !st.qty)}
                              placeholder="0"
                              aria-label={`Bought qty of ${l.materialName}`}
                              onChange={(e) => update({ qty: e.target.value })}
                              className={cn(
                                inputClassNameCompact,
                                'w-20 text-right tabular-nums',
                                issue && 'border-red-500',
                              )}
                            />
                            <span className="w-8 text-xs text-(--muted)">{l.uomSymbol}</span>
                          </div>
                          {!done ? (
                            <p className={cn('mt-0.5 text-right text-xs tabular-nums', hintClassName)}>
                              {l.remainingQty} left
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <RupiahInput
                            value={st.unitPrice}
                            onValueChange={(digits) => update({ unitPrice: digits })}
                            disabled={busy}
                            aria-label={`Actual price of ${l.materialName}`}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {st.qty ? formatRupiah(String(amount)) : '—'}
                        </td>
                        <td className={cn('px-3 py-2 text-right text-xs tabular-nums', diffClass(diff))}>
                          {st.qty ? formatRupiahDiff(String(diff)) : ''}
                        </td>
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
                    <td className={cn('px-3 py-2 text-right text-xs tabular-nums', diffClass(difference))}>
                      {formatRupiahDiff(String(difference))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

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

          {/* Action bar */}
          <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
            <div className="text-sm">
              <span className="font-semibold tabular-nums">{formatRupiah(String(total))}</span>
              <span className={cn('tabular-nums', diffClass(difference))}>
                {' '}
                ({formatRupiahDiff(String(difference))} vs approved)
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
              ) : photos.length === 0 ? (
                <p className={cn('text-xs', hintClassName)}>Add a nota photo to post.</p>
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
                Post nota
              </Button>
            </div>
          </div>
        </>
      ) : doc ? (
        <>
          <section className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className={cn('text-xs', hintClassName)}>How</p>
              <p>{REALIZATION_METHOD_LABELS[doc.method]}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>
                {doc.method === 'vendor' ? 'Received by' : 'Bought by'}
              </p>
              <p>{doc.buyerName || '—'}</p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Date · where</p>
              <p className="tabular-nums">
                {doc.purchaseDate} · {doc.place || '—'}
              </p>
            </div>
            <div>
              <p className={cn('text-xs', hintClassName)}>Nota / invoice no.</p>
              <p>{doc.notaNumber || '—'}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className={sectionTitleClassName}>What was bought</h2>
            <div className="overflow-x-auto rounded-md border border-(--line)">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-(--muted)">
                  <tr className="border-b border-(--line)">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="w-28 px-3 py-2 text-right font-medium">Qty</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Actual price</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">vs approved</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l) => (
                    <tr key={l.id} className="border-b border-(--line) align-top last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-xs text-(--muted) tabular-nums">{l.materialCode}</span>{' '}
                        {l.materialName}
                        <p className={cn('text-xs tabular-nums', hintClassName)}>
                          approved {formatRupiah(l.approvedPrice)}
                          {l.note ? ` · ${l.note}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.qty} {l.uomSymbol}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatRupiah(l.amount)}
                      </td>
                      <td className={cn('px-3 py-2 text-right text-xs tabular-nums', diffClass(Number(l.difference)))}>
                        {formatRupiahDiff(l.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-(--line)">
                    <td colSpan={3} className="px-3 py-2 text-right font-medium">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatRupiah(doc.total)}
                    </td>
                    <td className={cn('px-3 py-2 text-right text-xs tabular-nums', diffClass(Number(doc.difference)))}>
                      {formatRupiahDiff(doc.difference)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {photoSection}

          {doc.comments ? (
            <section className="space-y-1">
              <h2 className={sectionTitleClassName}>Comments</h2>
              <p className="text-sm whitespace-pre-line">{doc.comments}</p>
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
              Void nota
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
                ? `${formatRupiah(String(total))} (${formatRupiahDiff(String(difference))} vs approved), ${photos.length} ${photos.length === 1 ? 'file' : 'files'}. It can no longer be edited.`
                : confirm === 'void'
                  ? 'It no longer counts as bought. Its quantities can be recorded again.'
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
              {confirm === 'post' ? 'Post' : confirm === 'void' ? 'Void' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
