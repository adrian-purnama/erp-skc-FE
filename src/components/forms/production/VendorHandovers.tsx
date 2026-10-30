import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Camera,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react'
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
import ProductionPicPicker from '#/components/forms/production/ProductionPicPicker'
import ProofFile from '#/components/forms/shared/ProofFile'
import {
  ListChip,
  type ListChipTone,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  PRODUCTION_HANDOVER_STATUS_LABELS,
  isActiveOrder,
} from '#/lib/production'
import type {
  ProductionHandover,
  ProductionHandoverCheck,
  ProductionOrder,
} from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  order: ProductionOrder
  /** May record handovers (production.handover). */
  canHandover: boolean
  /** May void posted handovers (production.manage). */
  canManage: boolean
  /** The SPK as returned after a change. */
  onOrder: (next: ProductionOrder) => void
}

type Form = {
  handoverDate: string
  qty: string
  deliveryNoteNumber: string
  receivedByUserId: string | null
  notes: string
  checklist: ProductionHandoverCheck[]
}

const STATUS_TONES: Record<ProductionHandover['status'], ListChipTone> = {
  draft: 'warning',
  posted: 'success',
  voided: 'neutral',
}

function formFrom(h: ProductionHandover): Form {
  return {
    handoverDate: h.handoverDate,
    qty: h.qty,
    deliveryNoteNumber: h.deliveryNoteNumber,
    receivedByUserId: h.receivedByUserId,
    notes: h.notes,
    checklist: h.checklist.map((c) => ({ ...c })),
  }
}

function newForm(order: ProductionOrder): Form {
  const left = Number(order.qty) - Number(order.doneQty)
  return {
    handoverDate: jakartaDateKey(new Date()),
    qty: left > 0 ? String(left) : '',
    deliveryNoteNumber: '',
    receivedByUserId: null,
    notes: '',
    checklist: order.defaultHandoverChecklist.map((label) => ({
      label,
      result: null,
      note: '',
    })),
  }
}

/** What still blocks posting, in the order the user fixes it. */
function postBlockers(form: Form, photoCount: number): string[] {
  const out: string[] = []
  if (form.checklist.length === 0) out.push('add a checklist row')
  if (form.checklist.some((c) => c.result === null)) out.push('check every row')
  if (form.checklist.some((c) => c.result === 'not_ok' && !c.note.trim())) {
    out.push('add a note to each row marked not OK')
  }
  if (photoCount === 0) out.push('add at least one file')
  return out
}

/**
 * Subcon / outsource: units the vendor hands over, each checked with proof.
 * Posting one counts its qty as done on the SPK; the vendor fee can be
 * received in step with it.
 */
export default function VendorHandovers({
  order,
  canHandover,
  canManage,
  onOrder,
}: Props) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [voiding, setVoiding] = useState<ProductionHandover | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const active = isActiveOrder(order.status)
  const left = Number(order.qty) - Number(order.doneQty)
  const editing =
    editingId && editingId !== 'new'
      ? (order.handovers.find((h) => h.id === editingId) ?? null)
      : null
  const editable = editingId === 'new' || editing?.status === 'draft'
  const canEdit = editable && canHandover && active
  const photos = editing?.photos ?? []
  const blockers = form ? postBlockers(form, photos.length) : []
  // Subcon: warn (not block) when the vendor may not have all our material yet.
  const materialShort = order.materialsAtVendor.filter(
    (m) => Number(m.atVendorQty) < Number(m.needQty),
  )

  function open(h: ProductionHandover | null) {
    setEditingId(h ? h.id : 'new')
    setForm(h ? formFrom(h) : newForm(order))
  }

  async function send(
    path: string,
    init: RequestInit,
    success: string | null,
  ): Promise<ProductionOrder | null> {
    try {
      const response = await apiFetch<ProductionOrder>(path, init)
      if (!response.success) {
        toast.error(response.message || 'Request failed')
        return null
      }
      if (success) toast.success(success)
      onOrder(response.data)
      return response.data
    } catch {
      toast.error('Unable to reach the server')
      return null
    }
  }

  /** Saves the form; a new handover becomes a draft and stays open. Returns its id. */
  async function save(success: string | null): Promise<string | null> {
    if (!form) return null
    const body = JSON.stringify(form)
    if (editingId === 'new') {
      const before = new Set(order.handovers.map((h) => h.id))
      const next = await send(
        `/production/orders/${order.id}/handovers`,
        { method: 'POST', body },
        success,
      )
      const created = next?.handovers.find((h) => !before.has(h.id))
      if (!created) return null
      setEditingId(created.id)
      return created.id
    }
    if (!editing) return null
    const next = await send(
      `/production/handovers/${editing.id}`,
      { method: 'PUT', body },
      success,
    )
    return next ? editing.id : null
  }

  async function run(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  function saveDraft() {
    void run(async () => {
      await save('Handover saved')
    })
  }

  function post() {
    void run(async () => {
      const id = await save(null)
      if (!id) return
      const next = await send(
        `/production/handovers/${id}/post`,
        { method: 'POST' },
        'Handover posted',
      )
      if (next) setEditingId(null)
    })
  }

  function remove() {
    if (!editing) return
    void run(async () => {
      const next = await send(
        `/production/handovers/${editing.id}`,
        { method: 'DELETE' },
        'Handover deleted',
      )
      if (next) setEditingId(null)
    })
  }

  async function onFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setUploading(true)
    try {
      // A new handover is saved first so the files have somewhere to go.
      const id = editingId === 'new' ? await save(null) : editing?.id
      if (!id) return
      const data = new FormData()
      for (const f of files) data.append('files', f)
      const response = await apiUpload<ProductionOrder>(
        `/production/handovers/${id}/photos`,
        data,
      )
      if (!response.success) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        files.length === 1 ? 'File added' : `${files.length} files added`,
      )
      onOrder(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function removePhoto(photoId: string) {
    if (!editing) return
    void run(async () => {
      await send(
        `/production/handovers/${editing.id}/photos/${photoId}`,
        { method: 'DELETE' },
        null,
      )
    })
  }

  function confirmVoid() {
    if (!voiding) return
    void run(async () => {
      const next = await send(
        `/production/handovers/${voiding.id}/void`,
        { method: 'POST', body: JSON.stringify({ reason: voidReason }) },
        'Handover voided',
      )
      if (next) setVoiding(null)
    })
  }

  async function downloadPdf(h: ProductionHandover) {
    try {
      await apiDownload(
        `/production/handovers/${h.id}/pdf`,
        `${h.number.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  function setCheck(i: number, patch: Partial<ProductionHandoverCheck>) {
    if (!form) return
    setForm({
      ...form,
      checklist: form.checklist.map((c, j) =>
        j === i ? { ...c, ...patch } : c,
      ),
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className={sectionTitleClassName}>Handovers</h3>
          <p className={cn('text-xs', hintClassName)}>
            Record each delivery from the vendor after checking it. Posting one
            counts its qty as done.
          </p>
        </div>
        {active && canHandover ? (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            disabled={busy || left <= 0}
            onClick={() => open(null)}
          >
            <Plus className="size-3.5" aria-hidden />
            New handover
          </Button>
        ) : null}
      </div>

      {materialShort.length > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Not all material is at the vendor yet (
          {materialShort.map((m) => m.materialName).join(', ')}). You can
          still record a handover, but check the vendor really used our
          material.
        </p>
      ) : null}

      {order.vendorFees.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-(--line) bg-(--surface) px-3 py-2 text-xs">
          {order.vendorFees.map((f) => (
            <li
              key={`${f.materialItemId}:${f.itemUomId}`}
              className="flex flex-wrap justify-between gap-2"
            >
              <span>Vendor fee · {f.materialName}</span>
              <span className="tabular-nums">
                received {f.receivedQty} of {f.feeQty} {f.uomSymbol}
                <span className={hintClassName}>
                  {' '}
                  · up to {f.receivableQty} so far
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {order.handovers.length === 0 ? (
        <p className={cn('text-sm', hintClassName)}>No handovers yet.</p>
      ) : (
        <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
          {order.handovers.map((h) => (
            <li
              key={h.id}
              className={cn(
                'flex flex-wrap items-start justify-between gap-2 px-3 py-2',
                h.status === 'voided' && 'opacity-60',
              )}
            >
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => open(h)}
              >
                <p className="text-sm tabular-nums">
                  <span className="font-medium underline-offset-4 hover:underline">
                    {h.number}
                  </span>{' '}
                  · <span className="font-medium">{h.qty}</span> units ·{' '}
                  {h.handoverDate}
                </p>
                <p className={cn('text-xs', hintClassName)}>
                  {[
                    h.receivedByName && `received by ${h.receivedByName}`,
                    h.deliveryNoteNumber && `SJ ${h.deliveryNoteNumber}`,
                    h.checklist.some((c) => c.result === 'not_ok') &&
                      'has not OK checks',
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
                {h.status === 'voided' ? (
                  <p className="text-xs text-red-700 dark:text-red-300">
                    Voided by {h.voidedBy?.name ?? 'Unknown'}: {h.voidReason}
                  </p>
                ) : null}
              </button>
              <div className="flex items-center gap-1">
                <ListChip tone={STATUS_TONES[h.status]}>
                  {PRODUCTION_HANDOVER_STATUS_LABELS[h.status]}
                </ListChip>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void downloadPdf(h)}
                >
                  <FileText className="size-3.5" aria-hidden />
                  PDF
                </Button>
                {h.status === 'posted' && active && canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={busy}
                    onClick={() => {
                      setVoidReason('')
                      setVoiding(h)
                    }}
                  >
                    Void
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editingId !== null}
        onOpenChange={(next) => {
          if (!next && !busy && !uploading) setEditingId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {form ? (
            <div className="space-y-5">
              <DialogHeader>
                <DialogTitle className="tabular-nums">
                  {editing ? editing.number : 'New handover'}
                </DialogTitle>
                <DialogDescription>
                  {order.number} · {order.itemLabel} · {order.doneQty} of{' '}
                  {order.qty} done
                </DialogDescription>
              </DialogHeader>
              {materialShort.length > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Not all material is at the vendor yet (
          {materialShort.map((m) => m.materialName).join(', ')}). You can
          still record a handover, but check the vendor really used our
          material.
        </p>
      ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Qty accepted</span>
                  <input
                    inputMode="decimal"
                    value={form.qty}
                    disabled={!canEdit || busy}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Date</span>
                  <input
                    type="date"
                    value={form.handoverDate}
                    max={jakartaDateKey(new Date())}
                    disabled={!canEdit || busy}
                    onChange={(e) =>
                      setForm({ ...form, handoverDate: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Surat jalan no.</span>
                  <input
                    value={form.deliveryNoteNumber}
                    disabled={!canEdit || busy}
                    onChange={(e) =>
                      setForm({ ...form, deliveryNoteNumber: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Received by</span>
                  {canEdit ? (
                    <ProductionPicPicker
                      value={form.receivedByUserId}
                      fallbackLabel={editing?.receivedByName}
                      disabled={busy}
                      noneLabel="Not recorded"
                      placeholder="Select who received it"
                      ariaLabel="Received by"
                      onChange={(receivedByUserId) =>
                        setForm({ ...form, receivedByUserId })
                      }
                    />
                  ) : (
                    <p className="text-sm">{editing?.receivedByName || '—'}</p>
                  )}
                </label>
              </div>

              <section className="space-y-2">
                <h4 className={sectionTitleClassName}>Checklist</h4>
                <ul className="space-y-2">
                  {form.checklist.map((c, i) => (
                    <li
                      key={i}
                      className="space-y-1.5 rounded-md border border-(--line) p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {canEdit ? (
                          <input
                            value={c.label}
                            disabled={busy}
                            aria-label={`Check ${i + 1}`}
                            onChange={(e) =>
                              setCheck(i, { label: e.target.value })
                            }
                            className={cn(
                              dialogInputClassName,
                              'min-w-0 flex-1',
                            )}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 text-sm">
                            {c.label}
                          </span>
                        )}
                        <div className="flex gap-1">
                          {(['ok', 'not_ok'] as const).map((result) => (
                            <Button
                              key={result}
                              type="button"
                              size="sm"
                              variant={
                                c.result === result ? 'default' : 'outline'
                              }
                              className={cn(
                                'h-7 gap-1 px-2 text-xs',
                                c.result === result &&
                                  result === 'not_ok' &&
                                  'bg-red-700 hover:bg-red-700/90',
                              )}
                              disabled={!canEdit || busy}
                              aria-pressed={c.result === result}
                              onClick={() => setCheck(i, { result })}
                            >
                              {result === 'ok' ? (
                                <Check className="size-3.5" aria-hidden />
                              ) : (
                                <X className="size-3.5" aria-hidden />
                              )}
                              {result === 'ok' ? 'OK' : 'Not OK'}
                            </Button>
                          ))}
                          {canEdit ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Remove ${c.label || 'row'}`}
                              disabled={busy}
                              onClick={() =>
                                setForm({
                                  ...form,
                                  checklist: form.checklist.filter(
                                    (_, j) => j !== i,
                                  ),
                                })
                              }
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {canEdit ? (
                        <input
                          value={c.note}
                          disabled={busy}
                          placeholder={
                            c.result === 'not_ok'
                              ? 'What is wrong (required)'
                              : 'Note (optional)'
                          }
                          aria-label={`Note for ${c.label || `check ${i + 1}`}`}
                          onChange={(e) =>
                            setCheck(i, { note: e.target.value })
                          }
                          className={dialogInputClassName}
                        />
                      ) : c.note ? (
                        <p className={cn('text-xs', hintClassName)}>{c.note}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() =>
                      setForm({
                        ...form,
                        checklist: [
                          ...form.checklist,
                          { label: '', result: null, note: '' },
                        ],
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add check
                  </Button>
                ) : null}
              </section>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  disabled={!canEdit || busy}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={dialogInputClassName}
                />
              </label>

              <section className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h4 className={sectionTitleClassName}>Files</h4>
                    <p className={cn('text-xs', hintClassName)}>
                      The signed handover, the surat jalan or photos of the
                      units. At least one is needed to post.
                    </p>
                  </div>
                  {canEdit ? (
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
                {photos.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>No files.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {photos.map((p) => (
                      <ProofFile
                        key={p.id}
                        path={`/production/handovers/${editing!.id}/photos/${p.id}`}
                        photo={p}
                        disabled={busy}
                        onRemove={canEdit ? () => removePhoto(p.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </section>

              {editing?.status === 'posted' ? (
                <p className={cn('text-xs', hintClassName)}>
                  Posted {editing.postedBy ? `by ${editing.postedBy.name}` : ''}
                  . It counts as done on the SPK.
                </p>
              ) : null}

              {canEdit ? (
                <div className="space-y-2">
                  {blockers.length > 0 ? (
                    <p className={cn('text-xs', hintClassName)}>
                      To post: {blockers.join(', ')}.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy || uploading || blockers.length > 0}
                      onClick={post}
                    >
                      <Send className="size-3.5" aria-hidden />
                      Post handover
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy || uploading}
                      onClick={saveDraft}
                    >
                      Save draft
                    </Button>
                    {editing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-red-700"
                        disabled={busy || uploading}
                        onClick={remove}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Delete draft
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={voiding !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setVoiding(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {voiding?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {voiding?.qty} units no longer count as done. Not possible
              while the vendor fee received already relies on them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Reason</span>
            <input
              value={voidReason}
              disabled={busy}
              onChange={(e) => setVoidReason(e.target.value)}
              className={dialogInputClassName}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy || !voidReason.trim()}
              onClick={(e) => {
                e.preventDefault()
                confirmVoid()
              }}
            >
              Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
