import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Check,
  ChevronDown,
  Download,
  History,
  Layers,
  Info,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
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
import type {
  ProjectRab,
  ProjectShopDrawingFile,
  ProjectShopDrawingItem,
} from '#/lib/project'
import { buttonOutlineClassName, hintClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  canManage: boolean
  /** Called after items reload (upload, BOQ state, version switch, …). */
  onChanged?: () => void
  /**
   * When set, row click opens this item (current file if any).
   * Interactive cell actions stop propagation so Upload/History/menus still work.
   */
  onSelectItem?: (item: ProjectShopDrawingItem) => void
}

function stopRowClick(e: { stopPropagation: () => void }) {
  e.stopPropagation()
}

function BoqBadge({
  tone,
  label,
}: {
  tone: 'ok' | 'warn' | 'locked'
  label: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        tone === 'ok' && 'bg-emerald-50 text-emerald-800 ring-emerald-200',
        tone === 'warn' && 'bg-amber-50 text-amber-900 ring-amber-200',
        tone === 'locked' && 'bg-(--surface) text-(--ink) ring-(--line)',
      )}
    >
      {tone === 'locked' ? <Lock className="size-3" aria-hidden /> : null}
      {label}
    </span>
  )
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

const UNCATEGORIZED = 'Uncategorized'

function auditUploadedLine(doc: ProjectShopDrawingFile): string {
  return `Uploaded at ${formatWhen(doc.uploadedAt)} by ${doc.uploadedByName || 'Unknown'}`
}

/** Each shop drawing item carries two versioned file streams. */
type FileKind = 'sd' | 'production'

const FILE_KIND_LABELS: Record<FileKind, string> = {
  sd: 'Shop drawing',
  production: 'File Produksi',
}

const FILE_KIND_SHORT: Record<FileKind, string> = {
  sd: 'SD',
  production: 'Produksi',
}

function FileSlot({
  kind,
  file,
  versionCount,
  busy,
  canManage,
  onUpload,
  onDownload,
  onHistory,
}: {
  kind: FileKind
  file: ProjectShopDrawingFile | null
  versionCount: number
  busy: boolean
  canManage: boolean
  onUpload: () => void
  onDownload: (file: ProjectShopDrawingFile) => void
  onHistory: () => void
}) {
  const label = FILE_KIND_LABELS[kind]
  const detail = file
    ? `${file.originalFilename}\n${formatBytes(file.sizeBytes)} · ${auditUploadedLine(file)}`
    : undefined
  return (
    <div className="flex h-7 min-w-0 items-center gap-2">
      <span className="w-14 shrink-0 text-[10px] font-semibold tracking-wide text-(--muted) uppercase">
        {FILE_KIND_SHORT[kind]}
      </span>
      {file ? (
        <span className="min-w-0 flex-1 truncate text-xs" title={detail}>
          <span className="tabular-nums text-(--muted)">
            v{file.version}
            {file.sameAsVersion != null ? `=v${file.sameAsVersion}` : ''}
          </span>{' '}
          {file.originalFilename}
        </span>
      ) : (
        <span className={cn('min-w-0 flex-1 text-xs', hintClassName)}>
          No file yet
        </span>
      )}
      <div className="flex shrink-0 items-center">
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={busy}
            title={`Upload ${label}`}
            aria-label={`Upload ${label}`}
            onClick={onUpload}
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-3.5" aria-hidden />
            )}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={!file || file.isDeleted}
          title={`Download ${label}`}
          aria-label={`Download ${label}`}
          onClick={() => {
            if (file) onDownload(file)
          }}
        >
          <Download className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 min-w-9 gap-0.5 px-1 text-[11px] tabular-nums"
          disabled={versionCount === 0}
          title={`${label} history`}
          aria-label={`${label} history (${versionCount})`}
          onClick={onHistory}
        >
          <History className="size-3" aria-hidden />
          {versionCount}
        </Button>
      </div>
    </div>
  )
}

export default function ProjectShopDrawingPanel({
  projectId,
  canManage,
  onChanged,
  onSelectItem,
}: Props) {
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
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
  const [rab, setRab] = useState<ProjectRab | null>(null)
  const [deleteFileTarget, setDeleteFileTarget] =
    useState<ProjectShopDrawingFile | null>(null)
  const [deleteItemTarget, setDeleteItemTarget] =
    useState<ProjectShopDrawingItem | null>(null)
  const [deletingItem, setDeletingItem] = useState(false)

  const [uploadItemId, setUploadItemId] = useState<string | null>(null)
  /** Which file stream the upload / history / delete dialogs act on. */
  const [fileKind, setFileKind] = useState<FileKind>('sd')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)

  const [nameDialog, setNameDialog] = useState<
    { mode: 'create' } | { mode: 'rename'; item: ProjectShopDrawingItem } | null
  >(null)
  const [codeDraft, setCodeDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [descriptionsDraft, setDescriptionsDraft] = useState('')
  const [dimensionDraft, setDimensionDraft] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [mockupApproveDateDraft, setMockupApproveDateDraft] = useState('')
  const [groupByCategory, setGroupByCategory] = useState(false)
  const [nameBusy, setNameBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [response, rabRes] = await Promise.all([
        apiFetch<ProjectShopDrawingItem[]>(
          `/project/${projectId}/shop-drawing`,
        ),
        apiFetch<ProjectRab | null>(`/project/${projectId}/rab`),
      ])
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load Shop Drawing items')
        return
      }
      setItems(response.data)
      if (rabRes.success) setRab(rabRes.data ?? null)
      else setRab(null)
      onChangedRef.current?.()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  // Only the drawing feeds the RAB; File Produksi versions switch freely.
  const versionSwitchBlocked =
    fileKind === 'sd' && rab?.status === 'locked' && !rab.changeDraft

  function filesPath(kind: FileKind): string {
    return kind === 'sd'
      ? `/project/${projectId}/shop-drawing/files`
      : `/project/${projectId}/shop-drawing/production-files`
  }

  function openUpload(item: ProjectShopDrawingItem, kind: FileKind) {
    setFileKind(kind)
    setUploadItemId(item.id)
    setPendingFile(null)
    setForceDifferent(false)
    setShowHashInfo(false)
  }

  function openHistory(item: ProjectShopDrawingItem, kind: FileKind) {
    setFileKind(kind)
    setHistoryItemId(item.id)
    setHistoryOpenId(null)
  }

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
    setCodeDraft('')
    setNameDraft('')
    setDescriptionsDraft('')
    setDimensionDraft('')
    setCategoryDraft('')
    setMockupApproveDateDraft('')
    setNameDialog({ mode: 'create' })
  }

  function openRenameItem(item: ProjectShopDrawingItem) {
    setCodeDraft(item.code)
    setNameDraft(item.name)
    setDescriptionsDraft(item.descriptions.join('\n'))
    setDimensionDraft(item.dimension)
    setCategoryDraft(item.category ?? '')
    setMockupApproveDateDraft(item.mockupApproveDate ?? '')
    setNameDialog({ mode: 'rename', item })
  }

  async function confirmNameDialog() {
    if (!canManage || !nameDialog) return
    const code = codeDraft.trim()
    const name = nameDraft.trim()
    if (!code || !name) {
      toast.error('Kode and name are required')
      return
    }
    const payload = {
      code,
      name,
      descriptions: descriptionsDraft
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
      dimension: dimensionDraft.trim(),
      category: categoryDraft.trim() || null,
      mockupApproveDate: mockupApproveDateDraft.trim()
        ? mockupApproveDateDraft.trim()
        : null,
    }
    setNameBusy(true)
    try {
      if (nameDialog.mode === 'create') {
        const response = await apiFetch<ProjectShopDrawingItem>(
          `/project/${projectId}/shop-drawing/items`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
            body: JSON.stringify(payload),
          },
        )
        if (!response.success) {
          toast.error(response.message || 'Failed to update item')
          return
        }
        toast.success('Item updated')
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
        `/project/${projectId}/shop-drawing/items/${itemId}/${fileKind === 'sd' ? 'files' : 'production-files'}${qs}`,
        form,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        response.data.linked
          ? 'Linked to existing file'
          : versionSwitchBlocked
            ? 'File uploaded (current version unchanged — open a RAB change to switch)'
            : `${FILE_KIND_LABELS[fileKind]} uploaded`,
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

  async function onDownload(
    doc: ProjectShopDrawingFile,
    kind: FileKind = fileKind,
  ) {
    try {
      await apiDownload(
        `${filesPath(kind)}/${doc.id}/download`,
        doc.originalFilename,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed')
    }
  }

  async function onUseVersion(doc: ProjectShopDrawingFile) {
    if (!canManage || doc.isDeleted || doc.isCurrent) return
    if (versionSwitchBlocked) {
      toast.error(
        'RAB is locked — open a change on RAB before switching the current version',
      )
      return
    }
    setUsingId(doc.id)
    try {
      const response = await apiFetch<ProjectShopDrawingFile>(
        `${filesPath(fileKind)}/${doc.id}/current`,
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
        `${filesPath(fileKind)}/${doc.id}`,
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
      toast.success(response.message || 'Item deleted')
      if (historyItemId === deleteItemTarget.id) closeHistoryDialog()
      setDeleteItemTarget(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeletingItem(false)
    }
  }

  async function restoreItem(item: ProjectShopDrawingItem) {
    if (!canManage) return
    setBusyItemId(item.id)
    try {
      const response = await apiFetch<null>(
        `/project/${projectId}/shop-drawing/items/${item.id}/restore`,
        { method: 'POST' },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to restore item')
        return
      }
      toast.success('Item restored')
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusyItemId(null)
    }
  }

  /** Category list for this project = distinct categories across its items. */
  const categories = useMemo(
    () =>
      [
        ...new Set(
          items.map((i) => i.category).filter((c): c is string => Boolean(c)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [items],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    const matched = !q
      ? items
      : items.filter((item) => {
          if (item.label.toLowerCase().includes(q)) return true
          if (item.dimension.toLowerCase().includes(q)) return true
          if (item.category?.toLowerCase().includes(q)) return true
          const current = item.current
          if (current?.originalFilename.toLowerCase().includes(q)) return true
          return item.versions.some((v) =>
            v.originalFilename.toLowerCase().includes(q),
          )
        })
    if (!groupByCategory) return matched
    // Contiguous groups for ListTable; uncategorized last, names keep server order.
    return [...matched].sort((a, b) => {
      if (a.category === b.category) return 0
      if (!a.category) return 1
      if (!b.category) return -1
      return a.category.localeCompare(b.category)
    })
  }, [items, debounced, groupByCategory])

  useEffect(() => {
    setPage(1)
  }, [debounced, groupByCategory])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(
    () => paginate(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  const columns = useMemo<ListTableColumn<ProjectShopDrawingItem>[]>(
    () => [
      {
        header: 'Kode',
        cellClassName: 'w-20 font-medium whitespace-nowrap tabular-nums',
        cell: (item) => item.code || <span className={hintClassName}>—</span>,
      },
      {
        header: 'Item',
        cellClassName: 'min-w-[12rem] font-medium',
        cell: (item) => (
          <div className="min-w-0">
            <p
              className={cn(
                item.removedInChange && 'text-(--muted) line-through',
              )}
            >
              {item.name}
            </p>
            {item.removedInChange ? (
              <BoqBadge
                tone="warn"
                label="Removed in change · deleted on commit"
              />
            ) : null}
            {item.category && !groupByCategory ? (
              <p className="text-[10px] font-normal tracking-wide text-(--muted)">
                {item.category}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Ukuran',
        cellClassName: 'whitespace-nowrap text-xs tabular-nums',
        cell: (item) =>
          item.dimension || <span className={hintClassName}>—</span>,
      },
      {
        header: 'BOQ',
        cellClassName: 'whitespace-nowrap',
        cell: (item) => {
          const current = item.current
          if (!current) {
            return (
              <span className={cn('text-xs', hintClassName)}>
                Upload a file first
              </span>
            )
          }
          const frozen = rab?.status === 'locked' && !rab.changeDraft
          const editable = canManage && !frozen
          const label = current.hasBoq
            ? editable
              ? 'Edit'
              : 'View'
            : 'Add BOQ'
          return (
            <div className="flex items-center gap-2">
              {current.hasBoq ? (
                frozen ? (
                  <BoqBadge tone="locked" label="Frozen" />
                ) : (
                  <BoqBadge tone="ok" label="Ready" />
                )
              ) : (
                <BoqBadge tone="warn" label="Missing" />
              )}
              {current.hasBoq || editable ? (
                <Link
                  to="/dashboard/internal/shop-drawing-boq"
                  search={{
                    projectId,
                    itemId: item.id,
                    fileId: current.id,
                  }}
                  className={cn(
                    buttonOutlineClassName,
                    'inline-flex h-7 items-center gap-1 px-2 text-xs no-underline',
                  )}
                  aria-label={`${label} BOQ for ${item.label}`}
                  onClick={stopRowClick}
                >
                  {current.hasBoq ? (
                    <Pencil className="size-3" aria-hidden />
                  ) : (
                    <Plus className="size-3" aria-hidden />
                  )}
                  {label}
                </Link>
              ) : null}
            </div>
          )
        },
      },
      {
        header: 'Files',
        cellClassName: 'w-[22rem] max-w-[22rem]',
        cell: (item) => {
          const busy = busyItemId === item.id
          return (
            <div onClick={stopRowClick} onKeyDown={stopRowClick}>
              <FileSlot
                kind="sd"
                file={item.current}
                versionCount={item.versions.length}
                busy={busy && fileKind === 'sd'}
                canManage={canManage}
                onUpload={() => openUpload(item, 'sd')}
                onDownload={(f) => void onDownload(f, 'sd')}
                onHistory={() => openHistory(item, 'sd')}
              />
              <FileSlot
                kind="production"
                file={item.productionCurrent}
                versionCount={item.productionVersions.length}
                busy={busy && fileKind === 'production'}
                canManage={canManage}
                onUpload={() => openUpload(item, 'production')}
                onDownload={(f) => void onDownload(f, 'production')}
                onHistory={() => openHistory(item, 'production')}
              />
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
                  aria-label={`Item actions for ${item.label}`}
                  onClick={stopRowClick}
                >
                  <MoreHorizontal className="size-3.5" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Item</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => openRenameItem(item)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {item.removedInChange ? (
                  <DropdownMenuItem onClick={() => void restoreItem(item)}>
                    <RotateCcw className="size-3.5" aria-hidden />
                    Restore item
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteItemTarget(item)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    {rab?.status === 'locked'
                      ? 'Remove in change'
                      : 'Delete item'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [busyItemId, canManage, projectId, rab, groupByCategory, fileKind],
  )

  const uploading = busyItemId !== null
  const historyItem = historyItemId
    ? (items.find((i) => i.id === historyItemId) ?? null)
    : null
  const historyVersions =
    (fileKind === 'sd'
      ? historyItem?.versions
      : historyItem?.productionVersions) ?? []
  const uploadItem = uploadItemId
    ? (items.find((i) => i.id === uploadItemId) ?? null)
    : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className={hintClassName}>
          Shop drawing items and their files (max 20MB).
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
        density="compact"
        filters={
          <>
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter by item, category or filename…"
              aria-label="Filter Shop Drawing items"
            />
            {categories.length > 0 ? (
              <Button
                type="button"
                variant={groupByCategory ? 'default' : 'outline'}
                size="sm"
                className="h-9 shrink-0 gap-1.5"
                aria-pressed={groupByCategory}
                onClick={() => setGroupByCategory((v) => !v)}
              >
                <Layers className="size-3.5" aria-hidden />
                Group by category
              </Button>
            ) : null}
          </>
        }
        groupBy={
          groupByCategory ? (item) => item.category ?? UNCATEGORIZED : undefined
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
        minWidthClassName="min-w-[1040px]"
        onRowClick={onSelectItem}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename' ? 'Edit item' : 'Add item'}
            </DialogTitle>
            <DialogDescription>
              Kode and name make the item label (e.g. SA1-Sky Sign). Keterangan
              and ukuran are printed on the quotation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="flex items-end gap-2">
              <label className="block w-28 shrink-0 space-y-1.5">
                <span className="text-sm font-medium">Kode</span>
                <input
                  type="text"
                  value={codeDraft}
                  maxLength={30}
                  disabled={nameBusy}
                  placeholder="SA1"
                  className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm uppercase placeholder:normal-case"
                  onChange={(e) =>
                    setCodeDraft(e.target.value.replace(/[\s-]/g, ''))
                  }
                />
              </label>
              <span className="pb-2 text-sm text-(--muted)" aria-hidden>
                -
              </span>
              <label className="block min-w-0 flex-1 space-y-1.5">
                <span className="text-sm font-medium">Name</span>
                <input
                  type="text"
                  value={nameDraft}
                  maxLength={120}
                  disabled={nameBusy}
                  placeholder="Sky Sign"
                  className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm"
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </label>
            </div>
            <p className={cn('text-xs', hintClassName)}>
              Kode cannot contain spaces or “-”; it must be unique in this
              project.
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Keterangan <span className={hintClassName}>(one per line)</span>
            </span>
            <textarea
              value={descriptionsDraft}
              rows={5}
              disabled={nameBusy}
              placeholder={
                'Polished brass panel\nDeeply etched logo\nPin mounted'
              }
              className="w-full resize-y rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm leading-relaxed"
              onChange={(e) => setDescriptionsDraft(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Ukuran{' '}
              <span className={hintClassName}>
                (p x tebal x t mm, optional)
              </span>
            </span>
            <input
              type="text"
              value={dimensionDraft}
              maxLength={120}
              disabled={nameBusy}
              placeholder="600 x 3 x 500"
              className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm tabular-nums"
              onChange={(e) => setDimensionDraft(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Mockup approve date{' '}
              <span className={hintClassName}>(optional)</span>
            </span>
            <input
              type="date"
              value={mockupApproveDateDraft}
              disabled={nameBusy}
              className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm"
              onChange={(e) => setMockupApproveDateDraft(e.target.value)}
              aria-label="Mockup approve date"
            />
            <p className={cn('text-xs', hintClassName)}>
              Leave empty if the client does not need a mockup, or it is not
              approved yet.
            </p>
          </label>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                Category <span className={hintClassName}>(optional)</span>
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={categoryDraft}
                  maxLength={80}
                  disabled={nameBusy}
                  placeholder="Type a new category or pick one below"
                  className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 pr-8 text-sm uppercase placeholder:normal-case"
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void confirmNameDialog()
                    }
                  }}
                />
                {categoryDraft ? (
                  <button
                    type="button"
                    aria-label="Clear category"
                    disabled={nameBusy}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5 text-(--muted) hover:text-(--ink)"
                    onClick={() => setCategoryDraft('')}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            </label>
            {categories.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const selected = categoryDraft.trim().toUpperCase() === c
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={nameBusy}
                      aria-pressed={selected}
                      onClick={() => setCategoryDraft(selected ? '' : c)}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                        selected
                          ? 'bg-primary text-primary-foreground ring-primary'
                          : 'text-(--muted) ring-(--line) hover:text-(--ink)',
                      )}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
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
              disabled={nameBusy || !codeDraft.trim() || !nameDraft.trim()}
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
              {historyItem
                ? `${historyItem.label} · ${FILE_KIND_LABELS[fileKind]} history`
                : 'History'}
            </DialogTitle>
            <DialogDescription>
              Open a version to download, delete, or make it current. Deletes
              cannot be undone.
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
                        <span
                          className={cn('block text-[11px]', hintClassName)}
                        >
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
                            <div className="flex flex-col gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1.5 px-2 text-xs"
                                disabled={
                                  usingId === doc.id || versionSwitchBlocked
                                }
                                title={
                                  versionSwitchBlocked
                                    ? 'Open a change on RAB before switching version'
                                    : undefined
                                }
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
                              {versionSwitchBlocked ? (
                                <p className={cn('text-[11px]', hintClassName)}>
                                  Open a change on RAB to switch current version
                                </p>
                              ) : null}
                            </div>
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
              ?{' '}
              {fileKind === 'sd'
                ? 'This removes the file, its BOQ if any, and cannot be undone.'
                : 'This cannot be undone.'}
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
            <AlertDialogTitle>
              {rab?.status === 'locked'
                ? 'Remove item in the RAB change?'
                : 'Delete Shop Drawing item?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rab?.status === 'locked' ? (
                rab.changeDraft ? (
                  <>
                    {deleteItemTarget
                      ? `"${deleteItemTarget.label}"`
                      : 'This item'}{' '}
                    leaves the RAB now. It is deleted with its files when you
                    commit the change; Restore or Discard brings it back.
                  </>
                ) : (
                  'The RAB is locked. Open a RAB change first, then remove the item.'
                )
              ) : (
                <>
                  Permanently delete{' '}
                  {deleteItemTarget
                    ? `"${deleteItemTarget.label}"`
                    : 'this item'}
                  ? This removes the item, all file versions, their BOQs, and
                  cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingItem}>
              Cancel
            </AlertDialogCancel>
            {rab?.status === 'locked' && !rab.changeDraft ? null : (
              <AlertDialogAction
                variant="destructive"
                disabled={deletingItem}
                onClick={(event) => {
                  event.preventDefault()
                  void confirmDeleteItem()
                }}
              >
                {deletingItem
                  ? 'Removing…'
                  : rab?.status === 'locked'
                    ? 'Remove'
                    : 'Delete'}
              </AlertDialogAction>
            )}
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
              Upload {FILE_KIND_LABELS[fileKind]}
              {uploadItem ? ` · ${uploadItem.label}` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any file type up to 20MB. Identical files are reused instead of
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
                  Save as a new file even if content matches
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
                  We skip saving a duplicate when the file content already
                  exists. Check this to always keep a separate copy.
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
