import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Download,
  Info,
  LoaderCircle,
  Map as MapIcon,
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
import { Input } from '#/components/ui/input'
import { apiDownload, apiFetch, apiUploadWithProgress } from '#/lib/api'
import {
  PROJECT_LOOSE_FILE_KIND_LABELS,
  PROJECT_LOOSE_FILE_KINDS,
  PROJECT_LOOSE_FILE_MAX_BYTES,
  type ProjectLooseFile,
  type ProjectLooseFileKind,
  type ProjectLooseFilesByKind,
} from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  canManage: boolean
}

const DEFAULT_KIND: ProjectLooseFileKind = PROJECT_LOOSE_FILE_KINDS[0]

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

export default function ProjectLooseFilesPanel({
  projectId,
  canManage,
}: Props) {
  const kind = DEFAULT_KIND
  const [loading, setLoading] = useState(true)
  const [files, setFiles] = useState<ProjectLooseFile[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [looseDeleteTargets, setLooseDeleteTargets] = useState<
    ProjectLooseFile[] | null
  >(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingNames, setPendingNames] = useState<string[]>([])
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)
  const [renameTarget, setRenameTarget] = useState<ProjectLooseFile | null>(
    null,
  )
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadIndex, setUploadIndex] = useState(0)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [uploadFileName, setUploadFileName] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<ProjectLooseFilesByKind[]>(
        `/project/${projectId}/loose-files`,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load Forcon / Map')
        return
      }
      const group = response.data.find((g) => g.kind === kind)
      const nextFiles = group?.files ?? []
      setFiles(nextFiles)
      const liveIds = new Set(
        nextFiles.filter((f) => !f.isDeleted).map((f) => f.id),
      )
      setSelectedIds((prev) => {
        const next = new Set<string>()
        for (const id of prev) {
          if (liveIds.has(id)) next.add(id)
        }
        return next
      })
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [projectId, kind])

  useEffect(() => {
    void load()
  }, [load])

  function toggleSelected(fileId: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(fileId)
      else next.delete(fileId)
      return next
    })
  }

  function setAllSelection(selectAll: boolean) {
    const liveIds = files.filter((f) => !f.isDeleted).map((f) => f.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of liveIds) {
        if (selectAll) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function closeUploadDialog() {
    if (uploading) return
    setUploadOpen(false)
    setPendingFiles([])
    setPendingNames([])
    setForceDifferent(false)
    setShowHashInfo(false)
    setUploadIndex(0)
    setUploadPercent(0)
    setUploadFileName(null)
  }

  async function confirmUpload() {
    if (pendingFiles.length === 0 || !canManage) return
    const oversized = pendingFiles.filter(
      (f) => f.size > PROJECT_LOOSE_FILE_MAX_BYTES,
    )
    if (oversized.length > 0) {
      toast.error(
        oversized.length === 1
          ? `${oversized[0].name} exceeds 20MB`
          : `${oversized.length} files exceed 20MB`,
      )
      return
    }
    const names = pendingNames.map((n) => n.trim())
    if (names.some((n) => !n)) {
      toast.error('Every file needs a filename')
      return
    }

    const queue = pendingFiles.map((file, i) => {
      const name = names[i]
      if (name === file.name) return file
      return new File([file], name, {
        type: file.type,
        lastModified: file.lastModified,
      })
    })
    const force = forceDifferent
    setUploading(true)
    let uploaded = 0
    let linked = 0
    let failed = 0

    try {
      for (let i = 0; i < queue.length; i++) {
        const file = queue[i]
        setUploadIndex(i + 1)
        setUploadPercent(0)
        setUploadFileName(file.name)
        const form = new FormData()
        form.append('file', file)
        const qs = force ? '?force=true' : ''
        try {
          const response = await apiUploadWithProgress<ProjectLooseFile>(
            `/project/${projectId}/loose-files/${kind}${qs}`,
            form,
            { onProgress: (percent) => setUploadPercent(percent) },
          )
          if (!response.success || !response.data) {
            failed += 1
            toast.error(response.message || `Failed to upload ${file.name}`)
            continue
          }
          if (response.data.linked) linked += 1
          else uploaded += 1
          setUploadPercent(100)
        } catch (error) {
          failed += 1
          toast.error(
            error instanceof Error
              ? error.message
              : `Failed to upload ${file.name}`,
          )
        }
      }

      const parts: string[] = []
      if (uploaded > 0) parts.push(`${uploaded} uploaded`)
      if (linked > 0) parts.push(`${linked} linked`)
      if (failed > 0) parts.push(`${failed} failed`)
      if (parts.length > 0) {
        if (failed > 0 && uploaded + linked === 0) toast.error(parts.join(', '))
        else toast.success(parts.join(', '))
      }

      setUploading(false)
      setUploadOpen(false)
      setPendingFiles([])
      setPendingNames([])
      setForceDifferent(false)
      setShowHashInfo(false)
      setUploadIndex(0)
      setUploadPercent(0)
      setUploadFileName(null)
      await load()
      setListOpen(true)
    } finally {
      setUploading(false)
    }
  }

  async function onDownload(file: ProjectLooseFile) {
    if (file.isDeleted) return
    try {
      await apiDownload(
        `/project/${projectId}/loose-files/${file.id}/download`,
        file.originalFilename,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function downloadSelected() {
    const targets = files.filter((f) => selectedIds.has(f.id) && !f.isDeleted)
    if (targets.length === 0) return
    setBulkBusy(true)
    let okCount = 0
    let failCount = 0
    try {
      for (const file of targets) {
        try {
          await apiDownload(
            `/project/${projectId}/loose-files/${file.id}/download`,
            file.originalFilename,
          )
          okCount += 1
        } catch {
          failCount += 1
          toast.error(`Failed to download ${file.originalFilename}`)
        }
      }
      if (okCount > 0 && failCount === 0) {
        toast.success(
          okCount === 1 ? 'Downloaded 1 file' : `Downloaded ${okCount} files`,
        )
      } else if (okCount > 0) {
        toast.success(`${okCount} downloaded, ${failCount} failed`)
      }
    } finally {
      setBulkBusy(false)
    }
  }

  function openRename(file: ProjectLooseFile) {
    if (!canManage || file.isDeleted) return
    setRenameDraft(file.originalFilename)
    setRenameTarget(file)
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
    const file = renameTarget
    setRenamingId(file.id)
    try {
      const response = await apiFetch<ProjectLooseFile>(
        `/project/${projectId}/loose-files/${file.id}`,
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
      toast.success('File renamed')
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
    if (deletingId || bulkBusy) return
    setLooseDeleteTargets(null)
  }

  async function confirmDelete() {
    if (!looseDeleteTargets || looseDeleteTargets.length === 0 || !canManage) {
      return
    }
    const targets = looseDeleteTargets.filter((f) => !f.isDeleted)
    if (targets.length === 0) return

    setBulkBusy(true)
    if (targets.length === 1) setDeletingId(targets[0].id)
    let deleted = 0
    let failed = 0
    try {
      for (const file of targets) {
        try {
          const response = await apiFetch<ProjectLooseFile>(
            `/project/${projectId}/loose-files/${file.id}`,
            { method: 'DELETE' },
          )
          if (!response.success) {
            failed += 1
            toast.error(
              response.message || `Failed to delete ${file.originalFilename}`,
            )
            continue
          }
          deleted += 1
        } catch {
          failed += 1
          toast.error(`Failed to delete ${file.originalFilename}`)
        }
      }
      if (deleted > 0 && failed === 0) {
        toast.success(
          deleted === 1 ? 'File deleted' : `${deleted} files deleted`,
        )
      } else if (deleted > 0) {
        toast.success(`${deleted} deleted, ${failed} failed`)
      }
      setLooseDeleteTargets(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const file of targets) next.delete(file.id)
        return next
      })
      await load()
    } finally {
      setDeletingId(null)
      setBulkBusy(false)
    }
  }

  const liveFiles = files.filter((f) => !f.isDeleted)
  const selectedLive = liveFiles.filter((f) => selectedIds.has(f.id))
  const allLiveSelected =
    liveFiles.length > 0 && liveFiles.every((f) => selectedIds.has(f.id))
  const latest = liveFiles[0] ?? null
  const anyOversize = pendingFiles.some(
    (f) => f.size > PROJECT_LOOSE_FILE_MAX_BYTES,
  )
  const anyMissingName = pendingNames.some((n) => !n.trim())
  const totalPendingBytes = pendingFiles.reduce((sum, f) => sum + f.size, 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-(--line) p-4">
        <div className={cn('flex items-center gap-2 text-xs', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading…
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md border border-(--line) p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapIcon className="size-4 text-(--muted)" aria-hidden />
            <h3 className="text-sm font-medium">
              {PROJECT_LOOSE_FILE_KIND_LABELS[kind]}
            </h3>
          </div>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={uploading}
              onClick={() => {
                setUploadOpen(true)
                setPendingFiles([])
                setForceDifferent(false)
                setShowHashInfo(false)
              }}
            >
              {uploading ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3.5" aria-hidden />
              )}
              Upload
            </Button>
          ) : null}
        </div>

        {latest ? (
          <div className="space-y-1">
            <p className="truncate text-xs font-medium">
              {latest.originalFilename}
            </p>
            <div className="space-y-0.5 text-[10px] leading-snug text-(--muted)">
              <p>{formatBytes(latest.sizeBytes)}</p>
              <p>{auditUploadedLine(latest)}</p>
            </div>
            <div className="flex items-center gap-1 pt-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={bulkBusy}
                onClick={() => void onDownload(latest)}
                aria-label="Download"
              >
                <Download className="size-3.5" aria-hidden />
              </Button>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={bulkBusy || deletingId === latest.id}
                  onClick={() => setLooseDeleteTargets([latest])}
                  aria-label="Delete"
                >
                  {deletingId === latest.id ? (
                    <LoaderCircle
                      className="size-3.5 animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className={cn('text-xs', hintClassName)}>No file yet.</p>
        )}

        {files.length > 0 ? (
          <button
            type="button"
            className={cn(
              'border-t border-(--line) pt-2 text-left text-xs underline-offset-4 hover:underline',
              hintClassName,
            )}
            onClick={() => setListOpen((v) => !v)}
          >
            {listOpen ? 'Hide' : 'All files'} ({files.length})
          </button>
        ) : null}

        {listOpen && files.length > 0 ? (
          <div className="space-y-2 border-t border-(--line) pt-2">
            {liveFiles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={allLiveSelected}
                  disabled={bulkBusy}
                  onCheckedChange={(checked) =>
                    setAllSelection(checked === true)
                  }
                  aria-label="Select all files"
                />
                <span className={cn('text-xs', hintClassName)}>
                  {selectedLive.length > 0
                    ? `${selectedLive.length} selected`
                    : 'Select'}
                </span>
                {selectedLive.length > 0 ? (
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      disabled={bulkBusy}
                      onClick={() => void downloadSelected()}
                    >
                      <Download className="size-3.5" aria-hidden />
                      Download
                    </Button>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs"
                        disabled={bulkBusy}
                        onClick={() => setLooseDeleteTargets(selectedLive)}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {files.map((file) => {
                const deletedLine = auditDeletedLine(file)
                const selected = selectedIds.has(file.id)
                return (
                  <li
                    key={file.id}
                    className={cn(
                      'rounded-sm px-1 py-1',
                      file.isDeleted && 'opacity-55',
                      selected && !file.isDeleted && 'bg-(--line)/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {!file.isDeleted ? (
                          <Checkbox
                            className="mt-0.5"
                            checked={selected}
                            disabled={bulkBusy}
                            onCheckedChange={(checked) =>
                              toggleSelected(file.id, checked === true)
                            }
                            aria-label={`Select ${file.originalFilename}`}
                          />
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'truncate text-xs font-medium',
                              file.isDeleted &&
                                'line-through decoration-(--muted)',
                            )}
                          >
                            {file.originalFilename}
                            {file.isDeleted ? ' · deleted' : ''}
                          </p>
                          <div className="mt-0.5 space-y-0.5 text-[10px] leading-snug text-(--muted)">
                            <p>{formatBytes(file.sizeBytes)}</p>
                            <p>{auditUploadedLine(file)}</p>
                            {deletedLine ? <p>{deletedLine}</p> : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!file.isDeleted ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={bulkBusy}
                            onClick={() => void onDownload(file)}
                            aria-label="Download"
                          >
                            <Download className="size-3.5" aria-hidden />
                          </Button>
                        ) : null}
                        {canManage && !file.isDeleted ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={
                              bulkBusy ||
                              deletingId === file.id ||
                              renamingId === file.id
                            }
                            onClick={() => openRename(file)}
                            aria-label="Rename"
                          >
                            {renamingId === file.id ? (
                              <LoaderCircle
                                className="size-3.5 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Pencil className="size-3.5" aria-hidden />
                            )}
                          </Button>
                        ) : null}
                        {canManage && !file.isDeleted ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            disabled={bulkBusy || deletingId === file.id}
                            onClick={() => setLooseDeleteTargets([file])}
                            aria-label="Delete"
                          >
                            {deletingId === file.id ? (
                              <LoaderCircle
                                className="size-3.5 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Trash2 className="size-3.5" aria-hidden />
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={renameTarget !== null}
        onOpenChange={(next) => {
          if (!next) closeRenameDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename file</AlertDialogTitle>
            <AlertDialogDescription>
              Change the display filename. Download will use the new name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Filename</span>
            <Input
              id="rename-loose-file-filename"
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
        open={looseDeleteTargets !== null}
        onOpenChange={(next) => {
          if (!next) closeDeleteDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(looseDeleteTargets?.length ?? 0) > 1
                ? 'Delete files?'
                : 'Delete file?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(looseDeleteTargets?.length ?? 0) > 1 ? (
                <>
                  Are you sure you want to delete{' '}
                  {looseDeleteTargets?.length ?? 0} files? They stay listed for
                  audit but cannot be downloaded.
                </>
              ) : (
                <>
                  Are you sure you want to delete{' '}
                  {looseDeleteTargets?.[0]?.originalFilename ?? 'this file'}? It
                  stays listed for audit but cannot be downloaded.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy || deletingId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkBusy || deletingId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {bulkBusy || deletingId
                ? 'Deleting…'
                : (looseDeleteTargets?.length ?? 0) > 1
                  ? `Delete ${looseDeleteTargets?.length}`
                  : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (!next) closeUploadDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upload {PROJECT_LOOSE_FILE_KIND_LABELS[kind]}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any file type, max 20MB each. Identical files are reused unless
              you choose to save a new copy.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Files</span>
              <input
                type="file"
                multiple
                disabled={uploading}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-(--line) file:bg-transparent file:px-2 file:py-1"
                onChange={(e) => {
                  const next = Array.from(e.target.files ?? [])
                  setPendingFiles(next)
                  setPendingNames(next.map((f) => f.name))
                }}
              />
            </label>
            {pendingFiles.length > 0 ? (
              <div className="space-y-2">
                <p className={cn('text-xs', hintClassName)}>
                  Selected: {pendingFiles.length} file
                  {pendingFiles.length === 1 ? '' : 's'} (
                  {formatBytes(totalPendingBytes)})
                  {anyOversize ? ' — one or more exceed 20MB' : ''}
                </p>
                <ul className="max-h-40 space-y-2 overflow-y-auto">
                  {pendingFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="space-y-1"
                    >
                      <Input
                        value={pendingNames[index] ?? ''}
                        disabled={uploading}
                        maxLength={255}
                        aria-label={`Filename for ${file.name}`}
                        onChange={(e) => {
                          const value = e.target.value
                          setPendingNames((prev) => {
                            const next = [...prev]
                            next[index] = value
                            return next
                          })
                        }}
                      />
                      <p
                        className={cn(
                          'text-[11px]',
                          file.size > PROJECT_LOOSE_FILE_MAX_BYTES
                            ? 'text-red-600'
                            : hintClassName,
                        )}
                      >
                        {formatBytes(file.size)}
                        {file.size > PROJECT_LOOSE_FILE_MAX_BYTES
                          ? ' — exceeds 20MB'
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="forcon-map-force-different"
                  checked={forceDifferent}
                  disabled={uploading}
                  onCheckedChange={(checked) =>
                    setForceDifferent(checked === true)
                  }
                />
                <label
                  htmlFor="forcon-map-force-different"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  Save as a new file even if content matches
                </label>
                <button
                  type="button"
                  aria-expanded={showHashInfo}
                  aria-controls="forcon-map-force-different-info"
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
                  id="forcon-map-force-different-info"
                  className={cn('text-xs leading-relaxed', hintClassName)}
                >
                  We skip saving a duplicate when the file content already
                  exists. Check this to always keep a separate copy.
                </p>
              ) : null}
            </div>

            {uploading ? (
              <UploadProgress
                percent={uploadPercent}
                label={`Uploading ${uploadIndex} / ${pendingFiles.length}`}
                fileName={uploadFileName}
              />
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                pendingFiles.length === 0 ||
                uploading ||
                anyOversize ||
                anyMissingName
              }
              onClick={(event) => {
                event.preventDefault()
                void confirmUpload()
              }}
            >
              {uploading
                ? `Uploading ${uploadIndex}/${pendingFiles.length}…`
                : pendingFiles.length > 1
                  ? `Upload ${pendingFiles.length} files`
                  : 'Upload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
