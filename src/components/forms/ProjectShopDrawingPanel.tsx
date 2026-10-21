import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Check,
  ChevronDown,
  Download,
  History,
  Info,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import type { ProjectShopDrawingFile, ProjectShopDrawingItem } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
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

function auditUploadedLine(doc: ProjectShopDrawingFile): string {
  return `Uploaded at ${formatWhen(doc.uploadedAt)} by ${doc.uploadedByName || 'Unknown'}`
}


export default function ProjectShopDrawingPanel({ projectId, canManage }: Props) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ProjectShopDrawingItem[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [historyItemId, setHistoryItemId] = useState<string | null>(null)
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)
  const [usingId, setUsingId] = useState<string | null>(null)
  const [deleteFileTarget, setDeleteFileTarget] =
    useState<ProjectShopDrawingFile | null>(null)
  const [deleteItemTarget, setDeleteItemTarget] =
    useState<ProjectShopDrawingItem | null>(null)
  const [deletingItem, setDeletingItem] = useState(false)

  const [uploadItemId, setUploadItemId] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)

  const [nameDialog, setNameDialog] = useState<
    | { mode: 'create' }
    | { mode: 'rename'; item: ProjectShopDrawingItem }
    | null
  >(null)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<ProjectShopDrawingItem[]>(
        `/project/${projectId}/shop-drawing`,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load Shop Drawing items')
        return
      }
      setItems(response.data)
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
    if (busyItemId) return
    setUploadItemId(null)
    setPendingFile(null)
    setForceDifferent(false)
    setShowHashInfo(false)
  }

  function closeHistoryDialog() {
    setHistoryItemId(null)
    setHistoryOpenId(null)
  }

  function openCreateItem() {
    setNameDraft('')
    setNameDialog({ mode: 'create' })
  }

  function openRenameItem(item: ProjectShopDrawingItem) {
    setNameDraft(item.name)
    setNameDialog({ mode: 'rename', item })
  }

  async function confirmNameDialog() {
    if (!canManage || !nameDialog) return
    const name = nameDraft.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    setNameBusy(true)
    try {
      if (nameDialog.mode === 'create') {
        const response = await apiFetch<ProjectShopDrawingItem>(
          `/project/${projectId}/shop-drawing/items`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          },
        )
        if (!response.success) {
          toast.error(response.message || 'Failed to create item')
          return
        }
        toast.success('Item created')
      } else {
        const response = await apiFetch<ProjectShopDrawingItem>(
          `/project/${projectId}/shop-drawing/items/${nameDialog.item.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          },
        )
        if (!response.success) {
          toast.error(response.message || 'Failed to rename item')
          return
        }
        toast.success('Item renamed')
      }
      setNameDialog(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setNameBusy(false)
    }
  }

  async function confirmUpload() {
    if (!uploadItemId || !pendingFile || !canManage) return
    const itemId = uploadItemId
    const force = forceDifferent
    setBusyItemId(itemId)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const qs = force ? '?force=true' : ''
      const response = await apiUpload<ProjectShopDrawingFile>(
        `/project/${projectId}/shop-drawing/items/${itemId}/files${qs}`,
        form,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        response.data.linked
          ? 'Linked to existing file'
          : 'File uploaded',
      )
      setUploadItemId(null)
      setPendingFile(null)
      setForceDifferent(false)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusyItemId(null)
    }
  }

  async function onDownload(doc: ProjectShopDrawingFile) {
    try {
      await apiDownload(
        `/project/${projectId}/shop-drawing/files/${doc.id}/download`,
        doc.originalFilename,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function onUseVersion(doc: ProjectShopDrawingFile) {
    if (!canManage || doc.isDeleted || doc.isCurrent) return
    setUsingId(doc.id)
    try {
      const response = await apiFetch<ProjectShopDrawingFile>(
        `/project/${projectId}/shop-drawing/files/${doc.id}/current`,
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

  function requestDeleteFile(doc: ProjectShopDrawingFile) {
    if (!canManage || doc.isDeleted) return
    setDeleteFileTarget(doc)
  }

  async function confirmDeleteFile() {
    if (!deleteFileTarget || !canManage) return
    const doc = deleteFileTarget
    setDeletingFileId(doc.id)
    try {
      const response = await apiFetch<ProjectShopDrawingFile>(
        `/project/${projectId}/shop-drawing/files/${doc.id}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Delete failed')
        return
      }
      toast.success('File deleted')
      setDeleteFileTarget(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeletingFileId(null)
    }
  }

  async function confirmDeleteItem() {
    if (!deleteItemTarget || !canManage) return
    setDeletingItem(true)
    try {
      const response = await apiFetch(
        `/project/${projectId}/shop-drawing/items/${deleteItemTarget.id}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to delete item')
        return
      }
      toast.success('Item deleted')
      if (historyItemId === deleteItemTarget.id) closeHistoryDialog()
      setDeleteItemTarget(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeletingItem(false)
    }
  }

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(q)) return true
      const current = item.current
      if (current?.originalFilename.toLowerCase().includes(q)) return true
      return item.versions.some((v) =>
        v.originalFilename.toLowerCase().includes(q),
      )
    })
  }, [items, debounced])

  useEffect(() => {
    setPage(1)
  }, [debounced])

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginate(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  const columns = useMemo<ListTableColumn<ProjectShopDrawingItem>[]>(
    () => [
      {
        header: 'Item',
        cellClassName: 'font-medium',
        cell: (item) => item.name,
      },
      {
        header: 'Current file',
        cell: (item) => {
          const current = item.current
          if (!current) {
            return <span className={hintClassName}>No file yet</span>
          }
          return (
            <div className="min-w-0">
              <p className="truncate">
                v{current.version}
                {current.sameAsVersion != null
                  ? ` · same as v${current.sameAsVersion}`
                  : ''}
                {' · '}
                {current.originalFilename}
              </p>
              <p className="text-[10px] leading-snug text-(--muted)">
                {formatBytes(current.sizeBytes)}
                {' · '}
                {auditUploadedLine(current)}
              </p>
            </div>
          )
        },
      },
      {
        header: 'BOQ',
        cellClassName: 'whitespace-nowrap',
        cell: (item) => {
          const current = item.current
          if (!current) {
            return <span className={hintClassName}>—</span>
          }
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'text-xs',
                  current.hasBoq ? 'text-(--ink)' : hintClassName,
                )}
              >
                {current.hasBoq ? 'BOQ' : 'No BOQ'}
              </span>
              <Link
                to="/dashboard/internal/shop-drawing-boq"
                search={{
                  projectId,
                  itemId: item.id,
                  fileId: current.id,
                }}
                className="inline-flex h-7 items-center px-2 text-xs underline-offset-4 hover:underline"
              >
                {current.hasBoq ? 'Edit BOQ' : 'Add BOQ'}
              </Link>
            </div>
          )
        },
      },
      {
        header: 'Files',
        cell: (item) => {
          const current = item.current
          const itemBusy = busyItemId === item.id
          const versionCount = item.versions.length
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={itemBusy}
                  onClick={() => {
                    setUploadItemId(item.id)
                    setPendingFile(null)
                    setForceDifferent(false)
                    setShowHashInfo(false)
                  }}
                >
                  {itemBusy ? (
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
              {current && !current.isDeleted ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => void onDownload(current)}
                >
                  <Download className="size-3.5" aria-hidden />
                  Download
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={versionCount === 0}
                onClick={() => {
                  setHistoryItemId(item.id)
                  setHistoryOpenId(null)
                }}
              >
                <History className="size-3.5" aria-hidden />
                History
                {versionCount > 0 ? ` (${versionCount})` : ''}
              </Button>
            </div>
          )
        },
      },
      {
        header: '',
        cellClassName: 'w-10 text-right',
        cell: (item) =>
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Item actions for ${item.name}`}
                >
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Item</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openRenameItem(item)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteItemTarget(item)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Delete item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [busyItemId, canManage, projectId],
  )

  const uploading = busyItemId !== null
  const historyItem = historyItemId
    ? (items.find((i) => i.id === historyItemId) ?? null)
    : null
  const historyVersions = historyItem?.versions ?? []
  const uploadItem = uploadItemId
    ? (items.find((i) => i.id === uploadItemId) ?? null)
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className={cn('text-sm', hintClassName)}>
          Named items with versioned files (any type, max 20MB). Same hash
          reuse and revision history as documents.
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            onClick={openCreateItem}
          >
            <Plus className="size-3.5" aria-hidden />
            Add item
          </Button>
        ) : null}
      </div>

      <ListTable
        filters={
          <ListSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter by item or filename…"
            aria-label="Filter Shop Drawing items"
          />
        }
        loading={loading}
        loadingLabel="Loading Shop Drawing…"
        empty={
          debounced.trim()
            ? 'No items match the current filter.'
            : 'No Shop Drawing items yet. Add an item, then upload a file.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(item) => item.id}
        minWidthClassName="min-w-[820px]"
        pagination={{
          page: safePage,
          totalPages,
          totalItems: filtered.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      <Dialog
        open={nameDialog !== null}
        onOpenChange={(next) => {
          if (!next && !nameBusy) setNameDialog(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename' ? 'Rename item' : 'Add item'}
            </DialogTitle>
            <DialogDescription>
              Give this Shop Drawing item a short name (e.g. item1).
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={nameDraft}
              maxLength={120}
              disabled={nameBusy}
              className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void confirmNameDialog()
                }
              }}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={nameBusy}
              onClick={() => setNameDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={nameBusy || !nameDraft.trim()}
              onClick={() => void confirmNameDialog()}
            >
              {nameBusy
                ? 'Saving…'
                : nameDialog?.mode === 'rename'
                  ? 'Save'
                  : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={historyItemId !== null}
        onOpenChange={(next) => {
          if (!next) closeHistoryDialog()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {historyItem ? `${historyItem.name} history` : 'History'}
            </DialogTitle>
            <DialogDescription>
              Expand a version to download, delete it permanently, or make it
              the current file. Deleted versions are removed and cannot be
              restored.
            </DialogDescription>
          </DialogHeader>
          {historyVersions.length === 0 ? (
            <p className={cn('text-sm', hintClassName)}>No versions yet.</p>
          ) : (
            <ul className="space-y-2">
              {historyVersions.map((doc) => {
                const open = historyOpenId === doc.id
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
                        <span className="block truncate text-sm">
                          v{doc.version}
                          {doc.isCurrent ? ' · current' : ''}
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
                        <div className="flex flex-wrap items-center gap-1">
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
                          {canManage && !doc.isCurrent ? (
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
                          {canManage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-xs"
                              disabled={deletingFileId === doc.id}
                              onClick={() => requestDeleteFile(doc)}
                            >
                              {deletingFileId === doc.id ? (
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
        open={deleteFileTarget !== null}
        onOpenChange={(next) => {
          if (!next && !deletingFileId) setDeleteFileTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file version?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete{' '}
              {deleteFileTarget
                ? `v${deleteFileTarget.version} · ${deleteFileTarget.originalFilename}`
                : 'this file'}
              ? This removes the file, its BOQ if any, and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingFileId !== null}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingFileId !== null}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteFile()
              }}
            >
              {deletingFileId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteItemTarget !== null}
        onOpenChange={(next) => {
          if (!next && !deletingItem) setDeleteItemTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shop Drawing item?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete{' '}
              {deleteItemTarget ? `"${deleteItemTarget.name}"` : 'this item'}?
              This removes the item, all file versions, their BOQs, and cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingItem}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingItem}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteItem()
              }}
            >
              {deletingItem ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={uploadItemId !== null}
        onOpenChange={(next) => {
          if (!next) closeUploadDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upload{uploadItem ? ` · ${uploadItem.name}` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any file type up to 20MB. Matching content reuses the existing
              blob and adds a new version marked as same.
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
                  setPendingFile(e.target.files?.[0] ?? null)
                }}
              />
            </label>
            {pendingFile ? (
              <p className={cn('text-xs', hintClassName)}>
                Selected: {pendingFile.name} ({formatBytes(pendingFile.size)})
              </p>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="shopDrawing-force-different"
                  checked={forceDifferent}
                  disabled={uploading}
                  onCheckedChange={(checked) =>
                    setForceDifferent(checked === true)
                  }
                />
                <label
                  htmlFor="shopDrawing-force-different"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  This file is fucking different
                </label>
                <button
                  type="button"
                  aria-expanded={showHashInfo}
                  aria-controls="shopDrawing-force-different-info"
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
                  id="shopDrawing-force-different-info"
                  className={cn('text-xs leading-relaxed', hintClassName)}
                >
                  Kami cek apakah file sama atau beda lewat hash (kode unik dari
                  isi file). Kalau hash-nya sama, kami pakai file yang sudah
                  ada. Centang kotak ini kalau kamu mau lewati pengecekan dan
                  tetap simpan sebagai file baru.
                </p>
              ) : null}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingFile || uploading}
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
    </div>
  )
}
