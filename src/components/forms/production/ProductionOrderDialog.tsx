import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Ban,
  CheckCheck,
  Download,
  FileText,
  LoaderCircle,
  Plus,
  Send,
  Trash2,
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
import ProductionNotesField, {
  ProductionNotesList,
} from '#/components/forms/production/ProductionNotesField'
import ProductionPicPicker from '#/components/forms/production/ProductionPicPicker'
import SpkMaterialRequests from '#/components/forms/purchasing/SpkMaterialRequests'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  PRODUCTION_ORDER_STATUS_LABELS,
  PRODUCTION_ORDER_TYPE_LABELS,
  isActiveOrder,
  productionStatusChipClass,
} from '#/lib/production'
import type {
  ProductionOrder,
  ProductionOrderFileRef,
  ProductionReport,
} from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  orderId: string | null
  onOpenChange: (open: boolean) => void
  /** Called after any change so lists / progress can reload. */
  onChanged?: () => void
  canManage: boolean
  canReport: boolean
}

type Confirm =
  | { kind: 'release' }
  | { kind: 'delete' }
  | { kind: 'complete' }
  | { kind: 'cancel' }
  | { kind: 'void'; report: ProductionReport }

type DraftForm = {
  qty: string
  plannedStart: string
  plannedFinish: string
  picUserId: string | null
  notes: string
}

function draftFrom(o: ProductionOrder): DraftForm {
  return {
    qty: o.qty,
    plannedStart: o.plannedStart ?? '',
    plannedFinish: o.plannedFinish ?? '',
    picUserId: o.picUserId,
    notes: o.notes,
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

export function ProductionStatusChip({
  status,
  label,
}: {
  status: Parameters<typeof productionStatusChipClass>[0]
  label: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        productionStatusChipClass(status),
      )}
    >
      {label}
    </span>
  )
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-(--line)"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          'h-full rounded-full',
          percent >= 100 ? 'bg-emerald-600' : 'bg-(--ink)',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/** SPK detail: files, materials, production reports and lifecycle actions. */
export default function ProductionOrderDialog({
  orderId,
  onOpenChange,
  onChanged,
  canManage,
  canReport,
}: Props) {
  const { can } = useAuth()
  const [order, setOrder] = useState<ProductionOrder | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<DraftForm | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportQty, setReportQty] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [reportNotes, setReportNotes] = useState('')

  const apply = useCallback((next: ProductionOrder) => {
    setOrder(next)
    setDraft(next.status === 'draft' ? draftFrom(next) : null)
  }, [])

  useEffect(() => {
    if (!orderId) {
      setOrder(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const response = await apiFetch<ProductionOrder>(
          `/production/orders/${orderId}`,
        )
        if (cancelled) return
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to load SPK')
          return
        }
        apply(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, apply])

  async function call(
    path: string,
    init: RequestInit,
    success: string,
  ): Promise<boolean> {
    setBusy(true)
    try {
      const response = await apiFetch<ProductionOrder | null>(path, init)
      if (!response.success) {
        toast.error(response.message || 'Request failed')
        return false
      }
      toast.success(success)
      if (response.data) apply(response.data)
      onChanged?.()
      return true
    } catch {
      toast.error('Unable to reach the server')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveDraft() {
    if (!order || !draft) return
    await call(
      `/production/orders/${order.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          qty: draft.qty,
          plannedStart: draft.plannedStart || null,
          plannedFinish: draft.plannedFinish || null,
          picUserId: draft.picUserId,
          notes: draft.notes,
        }),
      },
      'SPK saved',
    )
  }

  async function runConfirm() {
    if (!order || !confirm) return
    const base = `/production/orders/${order.id}`
    let ok = false
    if (confirm.kind === 'release') {
      ok = await call(`${base}/release`, { method: 'POST' }, 'SPK released')
    } else if (confirm.kind === 'delete') {
      ok = await call(base, { method: 'DELETE' }, 'SPK deleted')
      if (ok) onOpenChange(false)
    } else if (confirm.kind === 'complete') {
      ok = await call(
        `${base}/complete`,
        { method: 'POST', body: JSON.stringify({ note: confirmText }) },
        'SPK completed',
      )
    } else if (confirm.kind === 'cancel') {
      ok = await call(
        `${base}/cancel`,
        { method: 'POST', body: JSON.stringify({ reason: confirmText }) },
        'SPK cancelled',
      )
    } else {
      ok = await call(
        `/production/reports/${confirm.report.id}/void`,
        { method: 'POST', body: JSON.stringify({ reason: confirmText }) },
        'Report voided',
      )
    }
    if (ok) {
      setConfirm(null)
      setConfirmText('')
    }
  }

  async function addReport() {
    if (!order) return
    const ok = await call(
      `/production/orders/${order.id}/reports`,
      {
        method: 'POST',
        body: JSON.stringify({
          qtyDone: reportQty,
          reportDate,
          notes: reportNotes,
        }),
      },
      'Production report added',
    )
    if (ok) setReportOpen(false)
  }

  function openReport() {
    if (!order) return
    const left = Number(order.qty) - Number(order.doneQty)
    setReportQty(left > 0 ? String(left) : '')
    setReportDate(jakartaDateKey(new Date()))
    setReportNotes('')
    setReportOpen(true)
  }

  async function downloadPdf() {
    if (!order) return
    try {
      await apiDownload(
        `/production/orders/${order.id}/pdf`,
        `${order.number.replace(/[^A-Za-z0-9-]+/g, '_')}.pdf`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function downloadFile(
    kind: 'sd' | 'production',
    file: ProductionOrderFileRef,
  ) {
    if (!order) return
    const path =
      kind === 'sd'
        ? `/project/${order.projectId}/shop-drawing/files/${file.fileId}/download`
        : `/project/${order.projectId}/shop-drawing/production-files/${file.fileId}/download`
    try {
      await apiDownload(path, file.originalFilename)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  const active = order ? isActiveOrder(order.status) : false
  const doneNum = order ? Number(order.doneQty) : 0
  const short = order ? doneNum < Number(order.qty) : false
  const confirmNeedsText =
    confirm?.kind === 'cancel' ||
    confirm?.kind === 'void' ||
    (confirm?.kind === 'complete' && short)

  return (
    <>
      <Dialog open={orderId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {loading || !order ? (
            <div
              className={cn('flex items-center gap-2 text-sm', hintClassName)}
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              Loading SPK…
            </div>
          ) : (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="tabular-nums">
                    {order.number}
                  </DialogTitle>
                  <ProductionStatusChip
                    status={order.status}
                    label={PRODUCTION_ORDER_STATUS_LABELS[order.status]}
                  />
                  <span className={cn('text-xs', hintClassName)}>
                    {PRODUCTION_ORDER_TYPE_LABELS[order.type]}
                  </span>
                </div>
                <DialogDescription>
                  {order.projectNumber} · {order.projectName} ·{' '}
                  {order.itemLabel}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className={cn('text-xs', hintClassName)}>Done / qty</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {order.doneQty} / {order.qty}
                  </p>
                  <ProgressBar
                    percent={Math.min(
                      100,
                      Math.round((doneNum / Number(order.qty)) * 100) || 0,
                    )}
                  />
                </div>
                <div>
                  <p className={cn('text-xs', hintClassName)}>Planned</p>
                  <p className="text-sm tabular-nums">
                    {order.plannedStart ?? '—'} → {order.plannedFinish ?? '—'}
                  </p>
                  <p className={cn('text-xs', hintClassName)}>
                    PIC: {order.pic || '—'}
                  </p>
                </div>
                <div>
                  <p className={cn('text-xs', hintClassName)}>Item make qty</p>
                  <p className="text-sm tabular-nums">{order.makeQty}</p>
                  <p className={cn('text-xs', hintClassName)}>
                    Released {formatWhen(order.releasedAt)}
                  </p>
                </div>
              </div>

              {order.status === 'cancelled' ? (
                <p className="text-sm text-red-700 dark:text-red-300">
                  Cancelled {formatWhen(order.cancelledAt)}:{' '}
                  {order.cancelReason}
                </p>
              ) : null}
              {order.status === 'completed' && order.completeNote ? (
                <p className={cn('text-sm', hintClassName)}>
                  Closed short: {order.completeNote}
                </p>
              ) : null}

              {draft && canManage ? (
                <section className="space-y-3">
                  <h3 className={sectionTitleClassName}>Draft details</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">
                        Qty (max {order.maxQty})
                      </span>
                      <input
                        inputMode="decimal"
                        value={draft.qty}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, qty: e.target.value })
                        }
                        className={dialogInputClassName}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">PIC</span>
                      <ProductionPicPicker
                        value={draft.picUserId}
                        fallbackLabel={order.pic}
                        disabled={busy}
                        onChange={(picUserId) =>
                          setDraft({ ...draft, picUserId })
                        }
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">Planned start</span>
                      <input
                        type="date"
                        value={draft.plannedStart}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, plannedStart: e.target.value })
                        }
                        className={dialogInputClassName}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">
                        Planned finish
                      </span>
                      <input
                        type="date"
                        value={draft.plannedFinish}
                        disabled={busy}
                        onChange={(e) =>
                          setDraft({ ...draft, plannedFinish: e.target.value })
                        }
                        className={dialogInputClassName}
                      />
                    </label>
                  </div>
                  <ProductionNotesField
                    notes={draft.notes}
                    disabled={busy}
                    onChange={(notes) => setDraft({ ...draft, notes })}
                  />
                </section>
              ) : (
                <ProductionNotesList notes={order.notes} />
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => void downloadPdf()}
                >
                  <FileText className="size-3.5" aria-hidden />
                  {order.status === 'draft' ? 'Draft PDF' : 'Download PDF'}
                </Button>
                {order.status === 'draft' && canManage ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'release' })}
                    >
                      <Send className="size-3.5" aria-hidden />
                      Release SPK
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={() => void saveDraft()}
                    >
                      Save draft
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-red-700"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'delete' })}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </Button>
                  </>
                ) : null}
                {active && canReport ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy || doneNum >= Number(order.qty)}
                    onClick={openReport}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add report
                  </Button>
                ) : null}
                {active && canManage ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy || doneNum <= 0}
                      onClick={() => {
                        setConfirmText('')
                        setConfirm({ kind: 'complete' })
                      }}
                    >
                      <CheckCheck className="size-3.5" aria-hidden />
                      Complete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-red-700"
                      disabled={busy || doneNum > 0}
                      onClick={() => {
                        setConfirmText('')
                        setConfirm({ kind: 'cancel' })
                      }}
                    >
                      <Ban className="size-3.5" aria-hidden />
                      Cancel SPK
                    </Button>
                  </>
                ) : null}
              </div>

              <section className="space-y-2">
                <h3 className={sectionTitleClassName}>Files</h3>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['sd', 'Shop drawing', order.shopDrawingFile],
                      ['production', 'File Produksi', order.productionFile],
                    ] as const
                  ).map(([kind, label, file]) => (
                    <Button
                      key={kind}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 max-w-full gap-1.5"
                      disabled={!file}
                      onClick={() => file && void downloadFile(kind, file)}
                    >
                      <Download className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {label}
                        {file
                          ? ` v${file.version} · ${file.originalFilename}`
                          : ' · missing'}
                      </span>
                    </Button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className={sectionTitleClassName}>Material needed</h3>
                {order.materials.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>
                    No BOQ materials.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-(--line)">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="text-left text-xs text-(--muted)">
                        <tr className="border-b border-(--line)">
                          <th className="px-3 py-2 font-medium">Material</th>
                          <th className="px-3 py-2 text-right font-medium">
                            Per unit
                          </th>
                          <th className="px-3 py-2 text-right font-medium">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.materials.map((m) => (
                          <tr
                            key={`${m.materialItemId}:${m.itemUomId}`}
                            className="border-b border-(--line) last:border-0"
                          >
                            <td className="px-3 py-1.5">
                              <span className="text-xs text-(--muted) tabular-nums">
                                {m.materialCode}
                              </span>{' '}
                              {m.materialName}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {m.qtyPerUnit} {m.uomSymbol}
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                              {m.qty} {m.uomSymbol}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {order.status === 'draft' ? (
                  <p className={cn('text-xs', hintClassName)}>
                    Preview from the current BOQ; fixed when the SPK is
                    released.
                  </p>
                ) : null}
              </section>

              {order.status !== 'draft' && can('purchasing.view') ? (
                <SpkMaterialRequests
                  productionOrderId={order.id}
                  canRequest={active && can('purchasing.request')}
                />
              ) : null}

              <section className="space-y-2">
                <h3 className={sectionTitleClassName}>Production reports</h3>
                {order.reports.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>
                    No reports yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
                    {order.reports.map((r) => (
                      <li
                        key={r.id}
                        className={cn(
                          'flex flex-wrap items-start justify-between gap-2 px-3 py-2',
                          r.isVoided && 'opacity-60',
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'text-sm tabular-nums',
                              r.isVoided && 'line-through',
                            )}
                          >
                            <span className="font-medium">{r.qtyDone}</span>{' '}
                            done · {r.reportDate}
                          </p>
                          <p className={cn('text-xs', hintClassName)}>
                            {r.reportedBy?.name ?? 'Unknown'}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </p>
                          {r.isVoided ? (
                            <p className="text-xs text-red-700 dark:text-red-300">
                              Voided by {r.voidedBy?.name ?? 'Unknown'}:{' '}
                              {r.voidReason}
                            </p>
                          ) : null}
                        </div>
                        {!r.isVoided && active && canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={busy}
                            onClick={() => {
                              setConfirmText('')
                              setConfirm({ kind: 'void', report: r })
                            }}
                          >
                            Void
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={reportOpen}
        onOpenChange={(next) => {
          if (!busy) setReportOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add production report</AlertDialogTitle>
            <AlertDialogDescription>
              Qty finished on {order?.number}. Up to{' '}
              {order ? Number(order.qty) - doneNum : 0} left.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Qty done</span>
              <input
                inputMode="decimal"
                value={reportQty}
                disabled={busy}
                onChange={(e) => setReportQty(e.target.value)}
                className={dialogInputClassName}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Date</span>
              <input
                type="date"
                value={reportDate}
                max={jakartaDateKey(new Date())}
                disabled={busy}
                onChange={(e) => setReportDate(e.target.value)}
                className={dialogInputClassName}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              rows={2}
              value={reportNotes}
              disabled={busy}
              onChange={(e) => setReportNotes(e.target.value)}
              className={dialogInputClassName}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !reportQty.trim() || !reportDate}
              onClick={(e) => {
                e.preventDefault()
                void addReport()
              }}
            >
              Add report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'release'
                ? `Release ${order?.number}?`
                : confirm?.kind === 'delete'
                  ? `Delete draft ${order?.number}?`
                  : confirm?.kind === 'complete'
                    ? `Complete ${order?.number}?`
                    : confirm?.kind === 'cancel'
                      ? `Cancel ${order?.number}?`
                      : 'Void this report?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'release'
                ? 'Files and material list are fixed on the SPK and the floor can report output.'
                : confirm?.kind === 'delete'
                  ? 'The draft is removed and its qty is free again.'
                  : confirm?.kind === 'complete'
                    ? short
                      ? `Only ${order?.doneQty} of ${order?.qty} finished. The rest is freed for a new SPK.`
                      : 'All qty is finished. The SPK is closed.'
                    : confirm?.kind === 'cancel'
                      ? 'No output was reported. Its qty is free again.'
                      : 'The qty no longer counts as done. The report stays in the history.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmNeedsText ? (
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                {confirm?.kind === 'complete' ? 'Note' : 'Reason'}
              </span>
              <input
                value={confirmText}
                disabled={busy}
                onChange={(e) => setConfirmText(e.target.value)}
                className={dialogInputClassName}
              />
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={
                confirm?.kind === 'delete' ||
                confirm?.kind === 'cancel' ||
                confirm?.kind === 'void'
                  ? 'destructive'
                  : 'default'
              }
              disabled={busy || (confirmNeedsText && !confirmText.trim())}
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
