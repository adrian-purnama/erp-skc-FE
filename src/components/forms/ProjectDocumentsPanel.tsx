import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
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
import ProjectLooseFilesPanel from '#/components/forms/ProjectLooseFilesPanel'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import {
  PROJECT_DOCUMENT_KIND_LABELS,
  PROJECT_DOCUMENT_KINDS,
  PROJECT_DOCUMENT_MAX_BYTES,
  type ProjectDocument,
  type ProjectDocumentKind,
  type ProjectDocumentsByKind,
} from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  canManage: boolean
}

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

function auditUploadedLine(doc: {
  uploadedAt: string | null
  uploadedByName: string | null
}): string {
  return `Uploaded at ${formatWhen(doc.uploadedAt)} by ${doc.uploadedByName || 'Unknown'}`
}

function auditDeletedLine(doc: {
  isDeleted: boolean
  deletedAt: string | null
  deletedByName: string | null
}): string | null {
  if (!doc.isDeleted) return null
  return `Deleted at ${formatWhen(doc.deletedAt)} by ${doc.deletedByName || 'Unknown'}`
}

export default function ProjectDocumentsPanel({
  projectId,
  canManage,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<ProjectDocumentsByKind[]>([])
  const [historyKind, setHistoryKind] = useState<ProjectDocumentKind | null>(
    null,
  )
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [busyKind, setBusyKind] = useState<ProjectDocumentKind | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [usingId, setUsingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectDocument | null>(
    null,
  )
  const [uploadKind, setUploadKind] = useState<ProjectDocumentKind | null>(
    null,
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadFilename, setUploadFilename] = useState('')
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ProjectDocument | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const docsResponse = await apiFetch<ProjectDocumentsByKind[]>(
        `/project/${projectId}/documents`,
      )
      if (!docsResponse.success || !docsResponse.data) {
        toast.error(docsResponse.message || 'Failed to load documents')
        return
      }
      setGroups(docsResponse.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  function closeUploadDialog() {
    if (busyKind) return
    setUploadKind(null)
    setPendingFile(null)
    setUploadFilename('')
    setForceDifferent(false)
    setShowHashInfo(false)
  }

  function closeHistoryDialog() {
    setHistoryKind(null)
    setHistoryOpenId(null)
  }

  async function confirmUpload() {
    if (!uploadKind || !pendingFile || !canManage) return
    if (pendingFile.size > PROJECT_DOCUMENT_MAX_BYTES) {
      toast.error('File must be 20MB or smaller')
      return
    }
    const name = uploadFilename.trim()
    if (!name) {
      toast.error('Filename is required')
      return
    }
    const kind = uploadKind
    const force = forceDifferent
    const fileToUpload =
      name === pendingFile.name
        ? pendingFile
        : new File([pendingFile], name, {
            type: pendingFile.type,
            lastModified: pendingFile.lastModified,
          })
    setBusyKind(kind)
    try {
      const form = new FormData()
      form.append('file', fileToUpload)
      const qs = force ? '?force=true' : ''
      const response = await apiUpload<ProjectDocument>(
        `/project/${projectId}/documents/${kind}${qs}`,
        form,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        response.data.linked
          ? `${PROJECT_DOCUMENT_KIND_LABELS[kind]} linked to existing file`
          : `${PROJECT_DOCUMENT_KIND_LABELS[kind]} uploaded`,
      )
      setUploadKind(null)
      setPendingFile(null)
      setUploadFilename('')
      setForceDifferent(false)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusyKind(null)
    }
  }

  async function onDownload(doc: ProjectDocument) {
    try {
      await apiDownload(
        `/project/${projectId}/documents/${doc.id}/download`,
        doc.originalFilename,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function onUseVersion(doc: ProjectDocument) {
    if (!canManage || doc.isDeleted || doc.isCurrent) return
    setUsingId(doc.id)
    try {
      const response = await apiFetch<ProjectDocument>(
        `/project/${projectId}/documents/${doc.id}/current`,
        { method: 'POST' },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to use this version')
        return
      }
      toast.success(`Now using v${doc.version}`)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUsingId(null)
    }
  }

  function requestDelete(doc: ProjectDocument) {
    if (!canManage || doc.isDeleted) return
    setDeleteTarget(doc)
  }

  function openRename(doc: ProjectDocument) {
    if (!canManage || doc.isDeleted) return
    setRenameDraft(doc.originalFilename)
    setRenameTarget(doc)
  }

  function closeRenameDialog() {
    if (renamingId) return
    setRenameTarget(null)
    setRenameDraft('')
  }

  async function confirmRename() {
    if (!renameTarget || !canManage || renameTarget.isDeleted) return
    const originalFilename = renameDraft.trim()
    if (!originalFilename) {
      toast.error('Filename is required')
      return
    }
    const doc = renameTarget
    setRenamingId(doc.id)
    try {
      const response = await apiFetch<ProjectDocument>(
        `/project/${projectId}/documents/${doc.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ originalFilename }),
        },
      )
      if (!response.success) {
        toast.error(response.message || 'Rename failed')
        return
      }
      toast.success('Document renamed')
      setRenameTarget(null)
      setRenameDraft('')
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setRenamingId(null)
    }
  }

  function closeDeleteDialog() {
    if (deletingId) return
    setDeleteTarget(null)
  }

  async function confirmDelete() {
    if (!deleteTarget || !canManage || deleteTarget.isDeleted) return
    const doc = deleteTarget
    setDeletingId(doc.id)
    try {
      const response = await apiFetch<ProjectDocument>(
        `/project/${projectId}/documents/${doc.id}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Delete failed')
        return
      }
      toast.success('Document deleted')
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading documents…
      </div>
    )
  }

  const byKind = new Map(groups.map((g) => [g.kind, g]))
  const uploading = busyKind !== null
  const dialogOpen = uploadKind !== null
  const historyVersions = historyKind
    ? (byKind.get(historyKind)?.versions ?? [])
    : []

  return (
    <section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PROJECT_DOCUMENT_KINDS.map((kind) => {
          const group = byKind.get(kind)
          const current = group?.current ?? null
          const versions = group?.versions ?? []
          const Icon =
            kind === 'siteSurvey' || kind === 'meetingMinutes'
              ? FileText
              : FileSpreadsheet
          const kindBusy = busyKind === kind

          return (
            <div
              key={kind}
              className="flex flex-col gap-3 rounded-md border border-(--line) p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-(--muted)" aria-hidden />
                  <h3 className="text-sm font-medium">
                    {PROJECT_DOCUMENT_KIND_LABELS[kind]}
                  </h3>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2 text-xs"
                    disabled={kindBusy}
                    onClick={() => {
                      setUploadKind(kind)
                      setPendingFile(null)
                      setUploadFilename('')
                      setForceDifferent(false)
                      setShowHashInfo(false)
                    }}
                  >
                    {kindBusy ? (
                      <LoaderCircle
                        className="size-3.5 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <Upload className="size-3.5" aria-hidden />
                    )}
                    Upload
                  </Button>
                ) : null}
              </div>

              {current ? (
                <VersionRow
                  doc={current}
                  emphasize
                  busy={
                    deletingId === current.id || renamingId === current.id
                  }
                  canManage={canManage}
                  onDownload={() => void onDownload(current)}
                  onRename={() => openRename(current)}
                  onDelete={() => requestDelete(current)}
                />
              ) : (
                <p className={cn('text-xs', hintClassName)}>No file yet.</p>
              )}

              {versions.length > 0 ? (
                <button
                  type="button"
                  className={cn(
                    'border-t border-(--line) pt-2 text-left text-xs underline-offset-4 hover:underline',
                    hintClassName,
                  )}
                  onClick={() => {
                    setHistoryKind(kind)
                    setHistoryOpenId(null)
                  }}
                >
                  History ({versions.length} version
                  {versions.length === 1 ? '' : 's'})
                </button>
              ) : null}
            </div>
          )
        })}

        <ProjectLooseFilesPanel
          projectId={projectId}
          canManage={canManage}
        />
      </div>

      <Dialog
        open={historyKind !== null}
        onOpenChange={(next) => {
          if (!next) closeHistoryDialog()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {historyKind
                ? `${PROJECT_DOCUMENT_KIND_LABELS[historyKind]} history`
                : 'History'}
            </DialogTitle>
            <DialogDescription>
              All versions for this document kind, including deleted ones.
            </DialogDescription>
          </DialogHeader>

          {historyVersions.length === 0 ? (
            <p className={cn('text-sm', hintClassName)}>No versions yet.</p>
          ) : (
            <ul className="space-y-2">
              {historyVersions.map((doc) => {
                const open = historyOpenId === doc.id
                const deletedLine = auditDeletedLine(doc)
                return (
                  <li
                    key={doc.id}
                    className="rounded-md border border-(--line)"
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
                      onClick={() =>
                        setHistoryOpenId((prev) =>
                          prev === doc.id ? null : doc.id,
                        )
                      }
                    >
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block truncate text-sm',
                            doc.isDeleted &&
                              'line-through decoration-(--muted)',
                          )}
                        >
                          v{doc.version}
                          {doc.isCurrent && !doc.isDeleted
                            ? ' · current'
                            : ''}
                          {doc.isDeleted ? ' · deleted' : ''}
                          {' · '}
                          {doc.originalFilename}
                        </span>
                        <span className={cn('block text-[11px]', hintClassName)}>
                          {formatBytes(doc.sizeBytes)}
                          {doc.sameAsVersion != null
                            ? ` · same as v${doc.sameAsVersion}`
                            : ''}
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
                          {auditUploadedLine(doc)}
                        </p>
                        {deletedLine ? (
                          <p className="text-[11px] text-(--muted)">
                            {deletedLine}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1">
                          {!doc.isDeleted ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              onClick={() => void onDownload(doc)}
                            >
                              <Download className="size-3.5" aria-hidden />
                              Download
                            </Button>
                          ) : null}
                          {canManage && !doc.isDeleted ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              disabled={renamingId === doc.id}
                              onClick={() => openRename(doc)}
                            >
                              {renamingId === doc.id ? (
                                <LoaderCircle
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Pencil className="size-3.5" aria-hidden />
                              )}
                              Rename
                            </Button>
                          ) : null}
                          {canManage &&
                          !doc.isDeleted &&
                          !doc.isCurrent ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              disabled={usingId === doc.id}
                              onClick={() => void onUseVersion(doc)}
                            >
                              {usingId === doc.id ? (
                                <LoaderCircle
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Check className="size-3.5" aria-hidden />
                              )}
                              Use this version
                            </Button>
                          ) : null}
                          {canManage && !doc.isDeleted ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              disabled={deletingId === doc.id}
                              onClick={() => requestDelete(doc)}
                            >
                              {deletingId === doc.id ? (
                                <LoaderCircle
                                  className="size-3.5 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <Trash2 className="size-3.5" aria-hidden />
                              )}
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next) closeRenameDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename document</AlertDialogTitle>
            <AlertDialogDescription>
              Change the display filename for this version. Download will use
              the new name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Filename</span>
            <Input
              id="rename-document-filename"
              value={renameDraft}
              disabled={renamingId !== null}
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
            <AlertDialogCancel disabled={renamingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={renamingId !== null || !renameDraft.trim()}
              onClick={(event) => {
                event.preventDefault()
                void confirmRename()
              }}
            >
              {renamingId ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) closeDeleteDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              {deleteTarget
                ? `v${deleteTarget.version} · ${deleteTarget.originalFilename}`
                : 'this document'}
              ? You can still see it in history, but it cannot be downloaded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deletingId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) closeUploadDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upload{' '}
              {uploadKind
                ? PROJECT_DOCUMENT_KIND_LABELS[uploadKind]
                : 'document'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any file type, max 20MB. Identical files are reused instead of
              stored twice.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">File</span>
              <input
                type="file"
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
                    pendingFile.size > PROJECT_DOCUMENT_MAX_BYTES
                      ? 'text-red-600'
                      : hintClassName,
                  )}
                >
                  Size: {formatBytes(pendingFile.size)}
                  {pendingFile.size > PROJECT_DOCUMENT_MAX_BYTES
                    ? ' — exceeds 20MB'
                    : ''}
                </p>
              </>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="force-different"
                  checked={forceDifferent}
                  disabled={uploading}
                  onCheckedChange={(checked) =>
                    setForceDifferent(checked === true)
                  }
                />
                <label
                  htmlFor="force-different"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  Save as a new file even if content matches
                </label>
                <button
                  type="button"
                  aria-expanded={showHashInfo}
                  aria-controls="force-different-info"
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
                <p
                  id="force-different-info"
                  className={cn('text-xs leading-relaxed', hintClassName)}
                >
                  We skip saving a duplicate when the file content already
                  exists. Check this to always keep a separate copy.
                </p>
              ) : null}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !pendingFile ||
                uploading ||
                !uploadFilename.trim() ||
                pendingFile.size > PROJECT_DOCUMENT_MAX_BYTES
              }
              onClick={(event) => {
                event.preventDefault()
                void confirmUpload()
              }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function VersionRow({
  doc,
  emphasize,
  busy,
  canManage,
  onDownload,
  onRename,
  onDelete,
}: {
  doc: ProjectDocument
  emphasize: boolean
  busy: boolean
  canManage: boolean
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const muted = !doc.isCurrent || doc.isDeleted
  const deletedLine = auditDeletedLine(doc)

  return (
    <div
      className={cn(
        'space-y-1 rounded-sm px-1 py-1',
        muted && 'opacity-55',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={cn(
              'truncate text-xs',
              emphasize ? 'font-medium' : 'font-normal',
              doc.isDeleted && 'line-through decoration-(--muted)',
            )}
          >
            v{doc.version}
            {doc.isCurrent && !doc.isDeleted ? ' · current' : ''}
            {doc.sameAsVersion != null ? ` · same as v${doc.sameAsVersion}` : ''}
            {' · '}
            {doc.originalFilename}
          </p>
          <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug text-(--muted)">
            <p>{formatBytes(doc.sizeBytes)}</p>
            <p>{auditUploadedLine(doc)}</p>
            {deletedLine ? <p>{deletedLine}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!doc.isDeleted ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onDownload}
              aria-label="Download"
            >
              <Download className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          {canManage && !doc.isDeleted ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={busy}
              onClick={onRename}
              aria-label="Rename"
            >
              <Pencil className="size-3.5" aria-hidden />
            </Button>
          ) : null}
          {canManage && !doc.isDeleted ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={busy}
              onClick={onDelete}
              aria-label="Delete"
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
