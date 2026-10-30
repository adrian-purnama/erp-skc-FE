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
  Truck,
  X,
} from 'lucide-react'
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
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  MATERIAL_DISPATCH_STATUS_LABELS,
  isActiveOrder,
} from '#/lib/production'
import type { MaterialDispatch, ProductionOrder } from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  order: ProductionOrder
  /** The SPK as returned after a change. */
  onOrder: (next: ProductionOrder) => void
}

type Form = {
  dispatchDate: string
  notes: string
  receivedByName: string
  /** Qty per `${materialItemId}:${itemUomId}`. */
  qty: Record<string, string>
}

const STATUS_TONES: Record<MaterialDispatch['status'], ListChipTone> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'info',
  sent: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  voided: 'neutral',
}

const key = (m: { materialItemId: string; itemUomId: string }) =>
  `${m.materialItemId}:${m.itemUomId}`

/**
 * Subcon: our material at the warehouse goes to the vendor on a surat jalan,
 * requested, approved by someone else, then marked sent with proof. Material
 * the supplier delivers straight to the vendor is ticked on its receipt.
 */
export default function SubconDispatches({ order, onOrder }: Props) {
  const { can } = useAuth()
  const canDispatch = can('production.dispatch')
  const canApprove = can('production.dispatchApprove')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState<'reject' | 'cancel' | 'void' | null>(
    null,
  )
  const fileInput = useRef<HTMLInputElement>(null)

  const active = isActiveOrder(order.status)
  const editing =
    editingId && editingId !== 'new'
      ? (order.dispatches.find((d) => d.id === editingId) ?? null)
      : null
  const editable =
    editingId === 'new' ||
    editing?.status === 'draft' ||
    editing?.status === 'rejected'
  const canEdit = editable && canDispatch && active
  const anyAvailable = order.materialsAtVendor.some(
    (m) => Number(m.availableQty) > 0,
  )

  function open(d: MaterialDispatch | null) {
    setAsking(null)
    setReason('')
    setEditingId(d ? d.id : 'new')
    setForm(
      d
        ? {
            dispatchDate: d.dispatchDate,
            notes: d.notes,
            receivedByName: d.receivedByName,
            qty: Object.fromEntries(d.lines.map((l) => [key(l), l.qty])),
          }
        : {
            dispatchDate: jakartaDateKey(new Date()),
            notes: '',
            receivedByName: '',
            qty: Object.fromEntries(
              order.materialsAtVendor
                .filter((m) => Number(m.availableQty) > 0)
                .map((m) => [key(m), m.availableQty]),
            ),
          },
    )
  }

  async function send(
    path: string,
    init: RequestInit,
    success: string | null,
  ): Promise<ProductionOrder | null> {
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
  }

  function body(): string {
    if (!form) return '{}'
    return JSON.stringify({
      dispatchDate: form.dispatchDate,
      notes: form.notes,
      receivedByName: form.receivedByName,
      lines: order.materialsAtVendor
        .map((m) => ({
          materialItemId: m.materialItemId,
          itemUomId: m.itemUomId,
          qty: form.qty[key(m)] ?? '',
        }))
        .filter((l) => Number(l.qty) > 0),
    })
  }

  /** Saves the form; a new one becomes a draft and stays open. Returns its id. */
  async function save(success: string | null): Promise<string | null> {
    if (editingId === 'new') {
      const before = new Set(order.dispatches.map((d) => d.id))
      const next = await send(
        `/production/orders/${order.id}/dispatches`,
        { method: 'POST', body: body() },
        success,
      )
      const created = next?.dispatches.find((d) => !before.has(d.id))
      if (!created) return null
      setEditingId(created.id)
      return created.id
    }
    if (!editing) return null
    const next = await send(
      `/production/dispatches/${editing.id}`,
      { method: 'PUT', body: body() },
      success,
    )
    return next ? editing.id : null
  }

  async function submit() {
    const id = await save(null)
    if (id)
      await send(
        `/production/dispatches/${id}/submit`,
        { method: 'POST' },
        'Sent for approval',
      )
  }

  async function act(path: string, success: string, payload?: unknown) {
    if (!editing) return
    const next = await send(
      `/production/dispatches/${editing.id}${path}`,
      { method: 'POST', body: payload ? JSON.stringify(payload) : undefined },
      success,
    )
    if (next) {
      setAsking(null)
      setReason('')
    }
  }

  async function remove() {
    if (!editing) return
    const next = await send(
      `/production/dispatches/${editing.id}`,
      { method: 'DELETE' },
      'Surat jalan deleted',
    )
    if (next) setEditingId(null)
  }

  async function onFiles(list: FileList | null) {
    const files = list ? [...list] : []
    if (files.length === 0) return
    setUploading(true)
    try {
      const id = editingId === 'new' ? await save(null) : editing?.id
      if (!id) return
      const data = new FormData()
      for (const f of files) data.append('files', f)
      const response = await apiUpload<ProductionOrder>(
        `/production/dispatches/${id}/photos`,
        data,
      )
      if (!response.success) {
        toast.error(response.message || 'Upload failed')
        return
      }
      onOrder(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function downloadPdf(d: MaterialDispatch) {
    try {
      await apiDownload(
        `/production/dispatches/${d.id}/pdf`,
        `${d.number.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  const photos = editing?.photos ?? []
  const status = editing?.status
  const photoEditable =
    canDispatch &&
    active &&
    (editingId === 'new' ||
      (status &&
        ['draft', 'pending_approval', 'approved', 'rejected'].includes(status)))

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className={sectionTitleClassName}>Material at vendor</h3>
          <p className={cn('text-xs', hintClassName)}>
            {order.dispatchVendor
              ? `Goes to ${order.dispatchVendor.vendorName}. Send it from the warehouse on a surat jalan, or tick “straight to the vendor” on the supplier's receipt.`
              : 'Waiting fee PO — it decides which vendor the material goes to.'}
          </p>
        </div>
        {active && canDispatch && order.dispatchVendor ? (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            disabled={busy || !anyAvailable}
            title={
              anyAvailable
                ? undefined
                : 'Nothing at the warehouse is waiting to be sent'
            }
            onClick={() => open(null)}
          >
            <Truck className="size-3.5" aria-hidden />
            Send to vendor
          </Button>
        ) : null}
      </div>

      {order.materialsAtVendor.length === 0 ? (
        <p className={cn('text-sm', hintClassName)}>
          No BOQ material on this SPK.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-(--line)">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-(--muted)">
              <tr className="border-b border-(--line)">
                <th className="px-3 py-2 font-medium">Material</th>
                <th className="px-3 py-2 text-right font-medium">Needed</th>
                <th className="px-3 py-2 text-right font-medium">
                  At warehouse
                </th>
                <th className="px-3 py-2 text-right font-medium">On the way</th>
                <th className="px-3 py-2 text-right font-medium">At vendor</th>
              </tr>
            </thead>
            <tbody>
              {order.materialsAtVendor.map((m) => {
                const done = Number(m.atVendorQty) >= Number(m.needQty)
                return (
                  <tr
                    key={key(m)}
                    className="border-b border-(--line) last:border-0"
                  >
                    <td className="px-3 py-1.5">{m.materialName}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.needQty} {m.uomSymbol}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.availableQty}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {m.onTheWayQty}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-1.5 text-right font-medium tabular-nums',
                        done && 'text-emerald-700 dark:text-emerald-300',
                      )}
                    >
                      {m.atVendorQty}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {order.dispatches.length > 0 ? (
        <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
          {order.dispatches.map((d) => (
            <li
              key={d.id}
              className={cn(
                'flex flex-wrap items-center gap-2 px-3 py-2',
                (d.status === 'cancelled' || d.status === 'voided') &&
                  'opacity-60',
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => open(d)}
              >
                <p className="text-sm tabular-nums">
                  <span className="font-medium underline-offset-4 hover:underline">
                    {d.number}
                  </span>{' '}
                  · {d.dispatchDate} · {d.lines.length}{' '}
                  {d.lines.length === 1 ? 'material' : 'materials'}
                </p>
                <p className={cn('text-xs', hintClassName)}>
                  {d.status === 'rejected'
                    ? `Rejected by ${d.rejectedBy?.name ?? '—'}: ${d.rejectReason}`
                    : d.status === 'approved'
                      ? `Approved by ${d.approvedBy?.name ?? '—'}`
                      : d.status === 'sent'
                        ? `Sent${d.receivedByName ? `, received by ${d.receivedByName}` : ''}`
                        : `Requested by ${d.createdBy?.name ?? '—'}`}
                </p>
              </button>
              <ListChip tone={STATUS_TONES[d.status]}>
                {MATERIAL_DISPATCH_STATUS_LABELS[d.status]}
              </ListChip>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void downloadPdf(d)}
              >
                <FileText className="size-3.5" aria-hidden />
                PDF
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

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
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="tabular-nums">
                    {editing ? editing.number : 'Send material to vendor'}
                  </DialogTitle>
                  {editing ? (
                    <ListChip tone={STATUS_TONES[editing.status]}>
                      {MATERIAL_DISPATCH_STATUS_LABELS[editing.status]}
                    </ListChip>
                  ) : null}
                </div>
                <DialogDescription>
                  {order.number} · to{' '}
                  {editing?.vendorName ??
                    order.dispatchVendor?.vendorName ??
                    '—'}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-x-auto rounded-md border border-(--line)">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="text-left text-xs text-(--muted)">
                    <tr className="border-b border-(--line)">
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="px-3 py-2 text-right font-medium">
                        At warehouse
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Send</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(canEdit
                      ? order.materialsAtVendor
                      : (editing?.lines ?? [])
                    ).map((m) => {
                      const flow = order.materialsAtVendor.find(
                        (x) => key(x) === key(m),
                      )
                      // While editing, this dispatch's own qty is held by it, so it is free for it again.
                      const own =
                        editing?.lines.find((l) => key(l) === key(m))?.qty ??
                        '0'
                      const free =
                        Number(flow?.availableQty ?? 0) +
                        (editing && editing.status === 'draft'
                          ? Number(own)
                          : 0)
                      return (
                        <tr
                          key={key(m)}
                          className="border-b border-(--line) last:border-0"
                        >
                          <td className="px-3 py-1.5">{m.materialName}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {canEdit ? `${free} ${flow?.uomSymbol ?? ''}` : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {canEdit ? (
                              <input
                                inputMode="decimal"
                                value={form.qty[key(m)] ?? ''}
                                disabled={busy}
                                aria-label={`Qty of ${m.materialName} to send`}
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    qty: {
                                      ...form.qty,
                                      [key(m)]: e.target.value,
                                    },
                                  })
                                }
                                className={cn(
                                  dialogInputClassName,
                                  'w-24 text-right',
                                )}
                              />
                            ) : (
                              <span className="tabular-nums">
                                {form.qty[key(m)]}{' '}
                                {'uomSymbol' in m ? m.uomSymbol : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    {status === 'approved' ? 'Sent on' : 'Send date'}
                  </span>
                  <input
                    type="date"
                    value={form.dispatchDate}
                    disabled={
                      busy ||
                      !(canEdit || (status === 'approved' && canDispatch))
                    }
                    onChange={(e) =>
                      setForm({ ...form, dispatchDate: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Received by (at vendor)
                  </span>
                  <input
                    value={form.receivedByName}
                    disabled={
                      busy ||
                      !(canEdit || (status === 'approved' && canDispatch))
                    }
                    onChange={(e) =>
                      setForm({ ...form, receivedByName: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  disabled={busy || !canEdit}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className={dialogInputClassName}
                />
              </label>

              <section className="space-y-2">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h4 className={sectionTitleClassName}>Files</h4>
                    <p className={cn('text-xs', hintClassName)}>
                      A photo of the goods or the signed surat jalan. At least
                      one is needed to mark it sent.
                    </p>
                  </div>
                  {photoEditable ? (
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
                        path={`/production/dispatches/${editing!.id}/photos/${p.id}`}
                        photo={p}
                        disabled={busy}
                        onRemove={
                          photoEditable
                            ? () =>
                                void send(
                                  `/production/dispatches/${editing!.id}/photos/${p.id}`,
                                  { method: 'DELETE' },
                                  null,
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </section>

              {editing?.status === 'rejected' ? (
                <p className="text-sm text-red-700 dark:text-red-300">
                  Rejected by {editing.rejectedBy?.name ?? '—'}:{' '}
                  {editing.rejectReason}. Change it and send it again, or cancel
                  it.
                </p>
              ) : null}
              {editing?.status === 'voided' ||
              editing?.status === 'cancelled' ? (
                <p className="text-sm text-red-700 dark:text-red-300">
                  {editing.status === 'voided'
                    ? `Voided by ${editing.voidedBy?.name ?? '—'}: ${editing.voidReason}`
                    : `Cancelled by ${editing.cancelledBy?.name ?? '—'}: ${editing.cancelReason}`}
                </p>
              ) : null}

              {asking ? (
                <div className="space-y-2 rounded-md border border-(--line) p-3">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">
                      {asking === 'reject'
                        ? 'Why reject?'
                        : asking === 'void'
                          ? 'Why void it?'
                          : 'Why cancel?'}
                    </span>
                    <input
                      value={reason}
                      disabled={busy}
                      onChange={(e) => setReason(e.target.value)}
                      className={dialogInputClassName}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8"
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void act(
                          `/${asking}`,
                          asking === 'reject'
                            ? 'Rejected'
                            : asking === 'void'
                              ? 'Voided'
                              : 'Cancelled',
                          { reason },
                        )
                      }
                    >
                      {asking === 'reject'
                        ? 'Reject'
                        : asking === 'void'
                          ? 'Void'
                          : 'Cancel surat jalan'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={() => setAsking(null)}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy || uploading}
                        onClick={() => void submit()}
                      >
                        <Send className="size-3.5" aria-hidden />
                        Send for approval
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={busy || uploading}
                        onClick={() => void save('Surat jalan saved')}
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Save draft
                      </Button>
                      {editing?.status === 'draft' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-red-700"
                          disabled={busy}
                          onClick={() => void remove()}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Delete draft
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {status === 'pending_approval' && canApprove && active ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy}
                        onClick={() => void act('/approve', 'Approved')}
                      >
                        <Check className="size-3.5" aria-hidden />
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy}
                        onClick={() => {
                          setReason('')
                          setAsking('reject')
                        }}
                      >
                        <X className="size-3.5" aria-hidden />
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {status === 'approved' && canDispatch && active ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy || uploading || photos.length === 0}
                      title={
                        photos.length === 0
                          ? 'Add a photo or the signed surat jalan first'
                          : undefined
                      }
                      onClick={() =>
                        void act('/send', 'Material marked as sent', {
                          dispatchDate: form.dispatchDate,
                          receivedByName: form.receivedByName,
                        })
                      }
                    >
                      <Truck className="size-3.5" aria-hidden />
                      Mark sent
                    </Button>
                  ) : null}
                  {status &&
                  ['pending_approval', 'approved', 'rejected'].includes(
                    status,
                  ) &&
                  canDispatch ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-red-700"
                      disabled={busy}
                      onClick={() => {
                        setReason('')
                        setAsking('cancel')
                      }}
                    >
                      Cancel surat jalan
                    </Button>
                  ) : null}
                  {status === 'sent' && canApprove ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-red-700"
                      disabled={busy}
                      onClick={() => {
                        setReason('')
                        setAsking('void')
                      }}
                    >
                      Void
                    </Button>
                  ) : null}
                </div>
              )}
              {status === 'pending_approval' ? (
                <p className={cn('text-xs', hintClassName)}>
                  Waiting for someone with approval rights (not the requester)
                  to approve it.
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
