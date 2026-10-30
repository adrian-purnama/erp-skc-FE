import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  PurchaseRabStatusChip,
  PurchaseRequestStatusChip,
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
import ChargesEditor, {
  ChargesSummary,
  chargeStatesFrom,
  priceCharges,
  type ChargeState,
} from '#/components/forms/purchasing/ChargesEditor'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { formatRupiah, materialKey, parseQty } from '#/lib/purchasing'
import type {
  PurchaseRab,
  PurchaseRabLineInput,
  PurchasingMaterial,
} from '#/lib/purchasing'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  inputClassNameCompact,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  /** Existing RAB; omit for a new one. */
  rabId?: string
}

type LineRow = {
  rowKey: string
  materialItemId: string
  itemUomId: string
  qty: string
  unitPrice: string
  note: string
}

let rowSeq = 0
function newRow(patch: Partial<LineRow> = {}): LineRow {
  rowSeq += 1
  return {
    rowKey: `rab-row-${rowSeq}`,
    materialItemId: '',
    itemUomId: '',
    qty: '',
    unitPrice: '',
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

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
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

/** Create, edit, lock or view one Purchasing RAB. */
export default function PurchaseRabEditor({ rabId }: Props) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canManage = can('purchasing.rab')
  const isNew = !rabId

  const [loading, setLoading] = useState(!isNew)
  const [busy, setBusy] = useState(false)
  const [rab, setRab] = useState<PurchaseRab | null>(null)
  const [materials, setMaterials] = useState<PurchasingMaterial[] | null>(null)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<LineRow[]>([])
  const [charges, setCharges] = useState<ChargeState[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'lock' | 'unlock' | null>(null)

  const editable = canManage && (isNew || rab?.status === 'draft')

  function fill(doc: PurchaseRab) {
    setRab(doc)
    setTitle(doc.title)
    setNotes(doc.notes)
    setCharges(chargeStatesFrom(doc.charges))
    setRows(
      doc.lines.map((l) =>
        newRow({
          materialItemId: l.materialItemId,
          itemUomId: l.itemUomId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          note: l.note,
        }),
      ),
    )
  }

  useEffect(() => {
    if (!rabId) return
    let cancelled = false
    void (async () => {
      const doc = await call<PurchaseRab>(`/purchasing/rabs/${rabId}`)
      if (cancelled) return
      if (doc) fill(doc)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [rabId])

  // Item Master materials, once the form is editable.
  useEffect(() => {
    if (!editable || materials) return
    void (async () => {
      const m = await call<PurchasingMaterial[]>('/purchasing/rabs/materials')
      setMaterials(m ?? [])
    })()
  }, [editable, materials])

  const materialById = useMemo(
    () => new Map((materials ?? []).map((m) => [m.id, m])),
    [materials],
  )
  const materialOptions = useMemo(
    () =>
      (materials ?? []).map((m) => ({
        value: m.id,
        label: `${m.itemId} · ${m.name}`,
      })),
    [materials],
  )

  function updateRow(rowKey: string, patch: Partial<LineRow>) {
    setRows((list) =>
      list.map((x) => (x.rowKey === rowKey ? { ...x, ...patch } : x)),
    )
  }

  // ---- Derived lines + validation ----
  const issues = new Map<string, string | null>()
  const lines: PurchaseRabLineInput[] = []
  const seen = new Set<string>()
  let total = 0
  for (const row of rows) {
    const key = row.materialItemId && row.itemUomId ? materialKey(row) : ''
    const qty = parseQty(row.qty)
    const price = /^\d+$/.test(row.unitPrice.trim()) ? Number(row.unitPrice) : null
    let issue: string | null = null
    if (!row.materialItemId) issue = 'Choose a material'
    else if (!row.itemUomId) issue = 'Choose a unit'
    else if (qty === null) issue = 'Enter a qty above 0'
    else if (price === null) issue = 'Enter a unit price'
    else if (seen.has(key)) issue = 'Listed twice'
    if (key) seen.add(key)
    issues.set(row.rowKey, issue)
    if (qty !== null && price !== null) total += Math.round(qty * price)
    if (!issue) {
      lines.push({
        materialItemId: row.materialItemId,
        itemUomId: row.itemUomId,
        qty: row.qty.trim().replace(',', '.'),
        unitPrice: row.unitPrice.trim(),
        note: row.note.trim(),
      })
    }
  }
  const issueCount = [...issues.values()].filter(Boolean).length
  const pricedCharges = priceCharges(charges, total)
  const formErrors: string[] = []
  if (!title.trim()) formErrors.push('Enter a title')
  if (pricedCharges.issues.size > 0) formErrors.push('Fix the charges')
  const canSave = issueCount === 0 && formErrors.length === 0

  async function save(): Promise<PurchaseRab | null> {
    setShowErrors(true)
    if (!canSave) {
      toast.error('Fix the highlighted fields first')
      return null
    }
    const body = JSON.stringify({
      title: title.trim(),
      notes,
      lines,
      charges: pricedCharges.payload,
    })
    return isNew
      ? call<PurchaseRab>('/purchasing/rabs', { method: 'POST', body })
      : call<PurchaseRab>(`/purchasing/rabs/${rabId}`, { method: 'PUT', body })
  }

  async function saveDraft() {
    setBusy(true)
    try {
      const saved = await save()
      if (!saved) return
      toast.success(`${saved.number} saved`)
      if (isNew) {
        void navigate({
          to: '/dashboard/purchasing/rabs/$rabId',
          params: { rabId: saved.id },
          replace: true,
        })
      } else {
        fill(saved)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runConfirm() {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm === 'delete') {
        if (!rab) return
        try {
          const response = await apiFetch<null>(`/purchasing/rabs/${rab.id}`, {
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
        toast.success('RAB deleted')
        void navigate({ to: '/dashboard/purchasing/rabs' })
        return
      }
      if (confirm === 'lock') {
        const saved = await save()
        if (!saved) return
        const locked = await call<PurchaseRab>(`/purchasing/rabs/${saved.id}/lock`, {
          method: 'POST',
        })
        if (!locked) {
          if (isNew) {
            void navigate({
              to: '/dashboard/purchasing/rabs/$rabId',
              params: { rabId: saved.id },
              replace: true,
            })
          } else {
            fill(saved)
          }
          return
        }
        toast.success(`${locked.number} locked`)
        if (isNew) {
          void navigate({
            to: '/dashboard/purchasing/rabs/$rabId',
            params: { rabId: locked.id },
            replace: true,
          })
        } else {
          fill(locked)
        }
      } else if (confirm === 'unlock' && rab) {
        const next = await call<PurchaseRab>(`/purchasing/rabs/${rab.id}/unlock`, {
          method: 'POST',
        })
        if (!next) return
        toast.success(`${next.number} is a draft again`)
        fill(next)
      }
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  const backLink = (
    <Link
      to="/dashboard/purchasing/rabs"
      className={cn(
        buttonOutlineClassName,
        'inline-flex h-8 items-center gap-1.5 no-underline',
      )}
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      All RABs
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

  if (rabId && !rab) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>This RAB could not be loaded.</p>
      </div>
    )
  }

  if (isNew && !canManage) {
    return (
      <div className="space-y-4">
        {backLink}
        <p className={hintClassName}>You cannot create RABs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-24">
      <div className="space-y-3">
        {backLink}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn(pageTitleClassName, 'tabular-nums')}>
            {rab ? rab.number : 'New RAB'}
          </h1>
          {rab ? <PurchaseRabStatusChip status={rab.status} /> : null}
        </div>
        <p className={hintClassName}>
          {editable
            ? 'Budget for buying outside projects. Lock it so SPPs can be made from it.'
            : rab?.status === 'locked'
              ? `Locked ${formatWhen(rab.lockedAt)} by ${rab.lockedBy?.name ?? 'Unknown'}. SPPs can be made from it.`
              : null}
        </p>
      </div>

      <section className="max-w-xl">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          {editable ? (
            <input
              value={title}
              disabled={busy}
              placeholder="e.g. Workshop supplies November"
              onChange={(e) => setTitle(e.target.value)}
              className={cn(
                inputClassName,
                'w-full',
                showErrors && !title.trim() && 'border-red-500',
              )}
            />
          ) : (
            <p className="text-sm">{rab?.title}</p>
          )}
        </label>
      </section>

      <section className="space-y-3">
        <h2 className={sectionTitleClassName}>Items</h2>
        {editable ? (
          <>
            {rows.length === 0 ? (
              <div
                className={cn(
                  'rounded-md border border-dashed border-(--line) px-4 py-6 text-center text-sm',
                  hintClassName,
                )}
              >
                No items yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-(--line)">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="text-left text-xs text-(--muted)">
                    <tr className="border-b border-(--line)">
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="w-28 px-3 py-2 font-medium">Unit</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Qty</th>
                      <th className="w-36 px-3 py-2 text-right font-medium">Unit price</th>
                      <th className="w-36 px-3 py-2 text-right font-medium">Amount</th>
                      <th className="w-48 px-3 py-2 font-medium">Note</th>
                      <th className="w-10 px-2 py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const material = materialById.get(row.materialItemId)
                      const issue = showErrors ? (issues.get(row.rowKey) ?? null) : null
                      const qty = parseQty(row.qty)
                      const price = /^\d+$/.test(row.unitPrice.trim())
                        ? Number(row.unitPrice)
                        : null
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
                                const uom = (m?.uoms.find((u) => u.isBase) ?? m?.uoms[0])?.id
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
                            {issue ? (
                              <p className="mt-1 text-xs text-red-600">{issue}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Combobox
                              value={row.itemUomId}
                              onValueChange={(v) => updateRow(row.rowKey, { itemUomId: v })}
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
                              onChange={(e) => updateRow(row.rowKey, { qty: e.target.value })}
                              className={cn(
                                inputClassNameCompact,
                                'w-full text-right tabular-nums',
                                issue === 'Enter a qty above 0' && 'border-red-500',
                              )}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              inputMode="numeric"
                              value={row.unitPrice}
                              disabled={busy}
                              placeholder="0"
                              aria-label="Unit price"
                              onChange={(e) =>
                                updateRow(row.rowKey, {
                                  unitPrice: e.target.value.replace(/\D/g, ''),
                                })
                              }
                              className={cn(
                                inputClassNameCompact,
                                'w-full text-right tabular-nums',
                                issue === 'Enter a unit price' && 'border-red-500',
                              )}
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {qty !== null && price !== null
                              ? formatRupiah(String(Math.round(qty * price)))
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={row.note}
                              disabled={busy}
                              placeholder="Optional"
                              aria-label="Note"
                              onChange={(e) => updateRow(row.rowKey, { note: e.target.value })}
                              className={cn(inputClassNameCompact, 'w-full')}
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
                                setRows((list) => list.filter((x) => x.rowKey !== row.rowKey))
                              }
                            >
                              <X className="size-4" aria-hidden />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-(--line)">
                      <td colSpan={4} className="px-3 py-2 text-right font-medium">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatRupiah(String(total))}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setRows((list) => [...list, newRow()])}
            >
              <Plus className="size-3.5" aria-hidden />
              Add item
            </Button>
          </>
        ) : rab ? (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-(--muted)">
                <tr className="border-b border-(--line)">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Qty</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Unit price</th>
                  <th className="w-36 px-3 py-2 text-right font-medium">Amount</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Requested</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Ordered</th>
                </tr>
              </thead>
              <tbody>
                {rab.lines.map((l) => {
                  const over = Number(l.requestedQty) > Number(l.qty) + 1e-9
                  return (
                    <tr key={l.key} className="border-b border-(--line) align-top last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-(--muted) tabular-nums">
                            {l.materialCode}
                          </span>
                          <span>{l.materialName}</span>
                        </div>
                        {l.note ? (
                          <p className={cn('text-xs', hintClassName)}>{l.note}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.qty} {l.uomSymbol}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatRupiah(l.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatRupiah(l.amount)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums',
                          over && 'text-amber-700 dark:text-amber-300',
                        )}
                      >
                        {Number(l.requestedQty) > 0 ? `${l.requestedQty} ${l.uomSymbol}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(l.orderedQty) > 0 ? `${l.orderedQty} ${l.uomSymbol}` : '—'}
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
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatRupiah(rab.total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </section>

      {editable ? (
        <ChargesEditor
          rows={charges}
          onChange={setCharges}
          subtotal={total}
          disabled={busy}
          showErrors={showErrors}
          title="Additional costs"
          hint="Optional budget for tax, delivery and other costs on top of the items."
          footer={
            <p className="text-right text-sm">
              <span className={hintClassName}>Items </span>
              <span className="tabular-nums">{formatRupiah(String(total))}</span>
              <span className={hintClassName}> + additional </span>
              <span className="tabular-nums">
                {formatRupiah(String(pricedCharges.total))}
              </span>
              <span className={hintClassName}> = </span>
              <span className="font-semibold tabular-nums">
                {formatRupiah(String(total + pricedCharges.total))}
              </span>
            </p>
          }
        />
      ) : rab && rab.charges.length > 0 ? (
        <section className="space-y-2">
          <h2 className={sectionTitleClassName}>Additional costs</h2>
          <ChargesSummary
            charges={rab.charges}
            subtotal={rab.total}
            subtotalLabel="Items"
            totalLabel="Grand total"
          />
        </section>
      ) : null}

      {editable ? (
        <label className="block max-w-2xl space-y-1">
          <span className={sectionTitleClassName}>Notes</span>
          <textarea
            rows={3}
            value={notes}
            disabled={busy}
            placeholder="Optional"
            onChange={(e) => setNotes(e.target.value)}
            className={cn(inputClassName, 'w-full')}
          />
        </label>
      ) : rab?.notes ? (
        <section className="space-y-1">
          <h2 className={sectionTitleClassName}>Notes</h2>
          <p className="text-sm whitespace-pre-line">{rab.notes}</p>
        </section>
      ) : null}

      {rab && rab.requests.length > 0 ? (
        <section className="space-y-2">
          <h2 className={sectionTitleClassName}>Material requests (SPP)</h2>
          <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
            {rab.requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <Link
                  to="/dashboard/purchasing/requests/$requestId"
                  params={{ requestId: r.id }}
                  className="font-medium tabular-nums underline-offset-4 hover:underline"
                >
                  {r.number}
                </Link>
                <PurchaseRequestStatusChip status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editable ? (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-(--line) bg-(--surface) px-6 py-3 sm:-mx-8 sm:px-8">
          <div className="text-sm">
            <span className="font-medium tabular-nums">
              {rows.length} {rows.length === 1 ? 'item' : 'items'} ·{' '}
              {formatRupiah(String(total + pricedCharges.total))}
              {pricedCharges.total > 0 ? (
                <span className={cn('font-normal', hintClassName)}>
                  {' '}
                  (incl. {formatRupiah(String(pricedCharges.total))} additional)
                </span>
              ) : null}
            </span>
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
            {rab ? (
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
              onClick={() => void saveDraft()}
            >
              Save draft
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || rows.length === 0}
              onClick={() => {
                setShowErrors(true)
                if (!canSave) {
                  toast.error('Fix the highlighted fields first')
                  return
                }
                setConfirm('lock')
              }}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Lock className="size-3.5" aria-hidden />
              )}
              Save and lock
            </Button>
          </div>
        </div>
      ) : rab ? (
        <div className="flex flex-wrap gap-2">
          {rab.status === 'locked' && can('purchasing.request') ? (
            <Link
              to="/dashboard/purchasing/requests/new"
              search={{ purchaseRabId: rab.id }}
              className={cn(buttonClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
            >
              <Plus className="size-3.5" aria-hidden />
              New SPP from this RAB
            </Link>
          ) : null}
          {canManage && rab.canUnlock ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirm('unlock')}
            >
              <LockOpen className="size-3.5" aria-hidden />
              Unlock to edit
            </Button>
          ) : null}
        </div>
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
              {confirm === 'delete'
                ? `Delete draft ${rab?.number}?`
                : confirm === 'lock'
                  ? 'Lock this RAB?'
                  : `Unlock ${rab?.number}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'delete'
                ? 'The draft is removed for good.'
                : confirm === 'lock'
                  ? `Total ${formatRupiah(String(total))}. Once locked, SPPs can be made from it; unlock only while no SPP uses it.`
                  : 'It goes back to draft so you can edit it. SPPs cannot be made from it until it is locked again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === 'delete' ? 'destructive' : 'default'}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {confirm === 'delete' ? 'Delete' : confirm === 'lock' ? 'Lock' : 'Unlock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
