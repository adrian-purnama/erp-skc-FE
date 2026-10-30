import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  Pencil,
  Trash2,
  Upload,
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
import UploadProgress from '#/components/forms/shared/UploadProgress'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  apiBlobUrl,
  apiDownload,
  apiFetch,
  apiUploadWithProgress,
} from '#/lib/api'
import {
  PO_QUOTATION_MAX_BYTES,
  type PurchaseOrder,
  type PurchaseOrderQuotation,
} from '#/lib/purchasing'
import { hintClassName, sectionTitleClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  order: PurchaseOrder | null
  /** Draft PO, and the viewer may change it. */
  editable: boolean
  onChanged: (next: PurchaseOrder) => void
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function versionLabel(q: PurchaseOrderQuotation): string {
  return [
    `v${q.version}`,
    q.isCurrent && !q.isDeleted ? 'current' : null,
    q.isDeleted ? 'deleted' : null,
    q.sameAsVersion != null ? `same as v${q.sameAsVersion}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Vendor quotation on a PO, versioned like project documents: each round of
 * negotiation is a new version, one is current, identical files are reused
 * unless forced, and deleted versions stay in the history.
 */
export default function PurchaseOrderQuotationPanel({
  order,
  editable,
  onChanged,
}: Props) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadFilename, setUploadFilename] = useState('')
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] =
    useState<PurchaseOrderQuotation | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] =
    useState<PurchaseOrderQuotation | null>(null)

  const base = order ? `/purchasing/orders/${order.id}/quotations` : ''
  const current = order?.quotation.current ?? null
  const versions = order?.quotation.versions ?? []
  const tooBig = (pendingFile?.size ?? 0) > PO_QUOTATION_MAX_BYTES

  function openUpload() {
    setPendingFile(null)
    setUploadFilename('')
    setForceDifferent(false)
    setShowHashInfo(false)
    setUploadOpen(true)
  }

  async function confirmUpload() {
    if (!order || !pendingFile || tooBig) return
    const name = uploadFilename.trim()
    if (!name) {
      toast.error('Filename is required')
      return
    }
    const file =
      name === pendingFile.name
        ? pendingFile
        : new File([pendingFile], name, {
            type: pendingFile.type,
            lastModified: pendingFile.lastModified,
          })
    setUploading(true)
    setUploadPercent(0)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await apiUploadWithProgress<
        PurchaseOrder & { linked: boolean }
      >(`${base}${forceDifferent ? '?force=true' : ''}`, form, {
        onProgress: setUploadPercent,
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        response.data.linked
          ? 'Quotation linked to an existing identical file'
          : 'Quotation uploaded',
      )
      onChanged(response.data)
      setUploadOpen(false)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
    }
  }

  async function act(
    q: PurchaseOrderQuotation,
    path: string,
    init: RequestInit,
    success: string,
  ): Promise<boolean> {
    setBusyId(q.id)
    try {
      const response = await apiFetch<PurchaseOrder>(path, init)
      if (!response.success || !response.data) {
        toast.error(response.message || 'Something went wrong')
        return false
      }
      toast.success(success)
      onChanged(response.data)
      return true
    } catch {
      toast.error('Unable to reach the server')
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function view(q: PurchaseOrderQuotation) {
    try {
      const url = await apiBlobUrl(`${base}/${q.id}`)
      window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the file')
    }
  }

  async function download(q: PurchaseOrderQuotation) {
    try {
      await apiDownload(`${base}/${q.id}`, q.originalFilename)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function confirmRename() {
    if (!renameTarget) return
    const originalFilename = renameDraft.trim()
    if (!originalFilename) {
      toast.error('Filename is required')
      return
    }
    const ok = await act(
      renameTarget,
      `${base}/${renameTarget.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFilename }),
      },
      'Quotation renamed',
    )
    if (ok) setRenameTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await act(
      deleteTarget,
      `${base}/${deleteTarget.id}`,
      { method: 'DELETE' },
      'Quotation deleted',
    )
    if (ok) setDeleteTarget(null)
  }

  function actions(q: PurchaseOrderQuotation, compact: boolean) {
    if (q.isDeleted) return null
    const busy = busyId === q.id
    const size = compact ? 'icon' : 'sm'
    const cls = compact ? 'size-7' : 'h-7 gap-1.5 px-2 text-xs'
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size={size}
          className={cls}
          aria-label="Open"
          onClick={() => void view(q)}
        >
          <ExternalLink className="size-3.5" aria-hidden />
          {compact ? null : 'Open'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={size}
          className={cls}
          aria-label="Download"
          onClick={() => void download(q)}
        >
          <Download className="size-3.5" aria-hidden />
          {compact ? null : 'Download'}
        </Button>
        {editable ? (
          <>
            {!q.isCurrent && !compact ? (
              <Button
                type="button"
                variant="ghost"
                size={size}
                className={cls}
                disabled={busy}
                onClick={() =>
                  void act(
                    q,
                    `${base}/${q.id}/current`,
                    { method: 'POST' },
                    `Now using v${q.version}`,
                  )
                }
              >
                {busy ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Check className="size-3.5" aria-hidden />
                )}
                Use this version
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size={size}
              className={cls}
              aria-label="Rename"
              disabled={busy}
              onClick={() => {
                setRenameDraft(q.originalFilename)
                setRenameTarget(q)
              }}
            >
              <Pencil className="size-3.5" aria-hidden />
              {compact ? null : 'Rename'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size={size}
              className={cls}
              aria-label="Delete"
              disabled={busy}
              onClick={() => setDeleteTarget(q)}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              {compact ? null : 'Delete'}
            </Button>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className={sectionTitleClassName}>Vendor quotation</h2>
          {editable ? (
            <p className={cn('text-sm', hintClassName)}>
              {order
                ? 'Upload each revised offer as a new version; the current one goes to the approvers.'
                : 'Save the draft first, then attach the vendor’s quotation (optional).'}
            </p>
          ) : null}
        </div>
        {editable && order ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={openUpload}
          >
            <Upload className="size-3.5" aria-hidden />
            {current ? 'Upload new version' : 'Upload quotation'}
          </Button>
        ) : null}
      </div>

      {order ? (
        <div className="max-w-2xl space-y-2 rounded-md border border-(--line) p-3">
          {current ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {versionLabel(current)} · {current.originalFilename}
                </p>
                <p className="text-[11px] text-(--muted)">
                  {formatBytes(current.sizeBytes)} · Uploaded{' '}
                  {formatWhen(current.uploadedAt)} by{' '}
                  {current.uploadedByName || 'Unknown'}
                </p>
              </div>
              {actions(current, true)}
            </div>
          ) : (
            <p className={cn('text-sm', hintClassName)}>
              No quotation attached.
            </p>
          )}
          {versions.length > 0 ? (
            <button
              type="button"
              className={cn(
                'border-t border-(--line) pt-2 text-left text-xs underline-offset-4 hover:underline',
                hintClassName,
              )}
              onClick={() => {
                setHistoryOpenId(null)
                setHistoryOpen(true)
              }}
            >
              History ({versions.length} version
              {versions.length === 1 ? '' : 's'})
            </button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vendor quotation history</DialogTitle>
            <DialogDescription>
              Every version uploaded on this PO, including deleted ones.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {versions.map((q) => {
              const open = historyOpenId === q.id
              return (
                <li key={q.id} className="rounded-md border border-(--line)">
                  <button
                    type="button"
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
                    onClick={() =>
                      setHistoryOpenId((prev) => (prev === q.id ? null : q.id))
                    }
                  >
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block truncate text-sm',
                          q.isDeleted && 'line-through decoration-(--muted)',
                        )}
                      >
                        {versionLabel(q)} · {q.originalFilename}
                      </span>
                      <span className={cn('block text-[11px]', hintClassName)}>
                        {formatBytes(q.sizeBytes)}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'mt-0.5 size-3.5 shrink-0 text-(--muted) transition-transform',
                        open && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                  {open ? (
                    <div className="space-y-2 border-t border-(--line) px-3 py-2">
                      <p className={cn('text-[11px]', hintClassName)}>
                        Uploaded at {formatWhen(q.uploadedAt)} by{' '}
                        {q.uploadedByName || 'Unknown'}
                      </p>
                      {q.isDeleted ? (
                        <p className="text-[11px] text-(--muted)">
                          Deleted at {formatWhen(q.deletedAt)} by{' '}
                          {q.deletedByName || 'Unknown'}
                        </p>
                      ) : null}
                      {actions(q, false)}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (!next && !uploading) setUploadOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current ? 'Upload new quotation version' : 'Upload quotation'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              PDF or photo (JPG, PNG, WEBP, HEIC), max 15MB. It becomes the
              current version. Identical files are reused instead of stored
              twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">File</span>
              <input
                type="file"
                accept={ACCEPT}
                disabled={uploading}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-(--line) file:bg-transparent file:px-2 file:py-1"
                onChange={(e) => {
                  const next = e.target.files?.[0] ?? null
                  setPendingFile(next)
                  setUploadFilename(next?.name ?? '')
                }}
              />
            </label>
            {pendingFile ? (
              <>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">Filename</span>
                  <Input
                    value={uploadFilename}
                    disabled={uploading}
                    maxLength={255}
                    onChange={(e) => setUploadFilename(e.target.value)}
                  />
                </label>
                <p
                  className={cn(
                    'text-xs',
                    tooBig ? 'text-red-600' : hintClassName,
                  )}
                >
                  Size: {formatBytes(pendingFile.size)}
                  {tooBig ? ' — exceeds 15MB' : ''}
                </p>
              </>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="po-quotation-force"
                  checked={forceDifferent}
                  disabled={uploading}
                  onCheckedChange={(checked) =>
                    setForceDifferent(checked === true)
                  }
                />
                <label
                  htmlFor="po-quotation-force"
                  className="text-sm leading-none"
                >
                  Save as a new file even if content matches
                </label>
                <button
                  type="button"
                  aria-expanded={showHashInfo}
                  aria-label="How file hashing works"
                  disabled={uploading}
                  onClick={() => setShowHashInfo((v) => !v)}
                  className={cn(
                    'rounded-sm p-0.5 text-(--muted) hover:text-(--ink)',
                    showHashInfo && 'text-(--ink)',
                  )}
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </div>
              {showHashInfo ? (
                <p className={cn('text-xs leading-relaxed', hintClassName)}>
                  We skip saving a duplicate when the file content already
                  exists, and mark the version “same as” the earlier one. Check
                  this to always keep a separate copy.
                </p>
              ) : null}
            </div>
          </div>
          {uploading ? <UploadProgress percent={uploadPercent} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !pendingFile || uploading || !uploadFilename.trim() || tooBig
              }
              onClick={(event) => {
                event.preventDefault()
                void confirmUpload()
              }}
            >
              {uploading ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Uploading…
                </>
              ) : (
                'Upload'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next && !busyId) setRenameTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename quotation</AlertDialogTitle>
            <AlertDialogDescription>
              Change the display filename for this version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Filename</span>
            <Input
              value={renameDraft}
              disabled={busyId !== null}
              maxLength={255}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void confirmRename()
                }
              }}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyId !== null || !renameDraft.trim()}
              onClick={(event) => {
                event.preventDefault()
                void confirmRename()
              }}
            >
              {busyId ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next && !busyId) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quotation version?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `v${deleteTarget.version} · ${deleteTarget.originalFilename}`
                : 'This version'}{' '}
              stays in the history but can no longer be opened. If it is the
              current one, the newest remaining version becomes current.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {busyId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
