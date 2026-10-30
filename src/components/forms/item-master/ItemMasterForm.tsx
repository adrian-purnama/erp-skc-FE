import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Ban,
  CircleCheck,
  Download,
  Folder,
  FolderInput,
  FolderPlus,
  Hash,
  Package,
  Pencil,
  Plus,
  Shapes,
  Tag,
  ToggleRight,
  Trash2,
  Upload,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
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
import { Combobox } from '#/components/ui/combobox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch, apiUpload } from '#/lib/api'
import {
  findNode,
  flattenFolderNameOptions,
  flattenFolders,
  flattenItems,
  folderNamePath,
  type FolderOut,
  type ItemCategoryOut,
  type ItemListRow,
  type ItemOut,
  type ItemType,
  type TreeNode,
} from '#/lib/itemMaster'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'
import {
  itemTypeLabel,
  STATUS_FILTER_OPTIONS,
  TYPE_FILTER_OPTIONS,
} from './constants'
import { FolderForm } from './FolderForm'
import { FolderNav } from './FolderNav'
import { ItemCategoryForm } from './ItemCategoryForm'
import { ItemForm } from './ItemForm'
import { MoveForm } from './MoveForm'

type ItemDrawer =
  | null
  | { mode: 'create'; folderId: string | null }
  | { mode: 'edit'; id: string }

type FolderDialog =
  | null
  | { type: 'create-folder'; parentId: string | null }
  | { type: 'edit-folder'; id: string }
  | { type: 'move-folder'; id: string }

type FolderEditorDialog = Exclude<FolderDialog, null> & {
  type: 'create-folder' | 'edit-folder'
}

type TypeFilter = 'all' | ItemType
type StatusFilter = 'all' | 'enabled' | 'disabled'
/** `all` = every item; `root` = folderId null; otherwise folder mongo id (direct children). */
type FolderFilter = 'all' | 'root' | string
/** `all` = every item; `none` = no category; otherwise category mongo id. */
type CategoryFilter = 'all' | 'none' | string
type BrowseTab = 'items' | 'categories'

const FOLDER_ROOT = '__root__'

function folderMeta(
  tree: TreeNode[],
  id: string,
): { code: string; name: string } | null {
  const node = findNode(tree, id)
  if (!node || node.type !== 'folder') return null
  return { code: node.code, name: node.name }
}

function FolderDialogEditor({
  tree,
  folderDialog,
  saving,
  setSaving,
  onCancel,
  onCreated,
  onUpdated,
}: {
  tree: TreeNode[]
  folderDialog: FolderEditorDialog
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onCreated: (id: string) => Promise<void>
  onUpdated: () => Promise<void>
}) {
  const editing =
    folderDialog.type === 'edit-folder'
      ? folderMeta(tree, folderDialog.id)
      : null
  const parentLabel =
    folderDialog.type === 'create-folder'
      ? folderNamePath(tree, folderDialog.parentId)
      : undefined

  return (
    <FolderForm
      key={`${folderDialog.type}-${folderDialog.type === 'edit-folder' ? folderDialog.id : folderDialog.parentId}`}
      mode={folderDialog.type === 'create-folder' ? 'create' : 'edit'}
      title={
        folderDialog.type === 'create-folder' ? 'New folder' : 'Rename folder'
      }
      hideTitle
      parentLabel={parentLabel}
      displayCode={editing?.code ?? ''}
      initialName={editing?.name ?? ''}
      saving={saving}
      setSaving={setSaving}
      onCancel={onCancel}
      onSubmit={async (name) => {
        if (folderDialog.type === 'create-folder') {
          const response = await apiFetch<FolderOut>('/folders', {
            method: 'POST',
            body: JSON.stringify({
              name,
              parentId: folderDialog.parentId,
            }),
          })
          if (!response.success || !response.data) {
            throw new Error(response.message || 'Create failed')
          }
          toast.success(`Folder created (${response.data.code})`)
          await onCreated(response.data.id)
          return
        }
        const response = await apiFetch<FolderOut>(
          `/folders/${folderDialog.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ name }),
          },
        )
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Update failed')
        }
        toast.success('Folder updated')
        await onUpdated()
      }}
    />
  )
}

export default function ItemMasterForm() {
  const { can } = useAuth()
  const canManage = can('itemMaster.manage')

  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [itemDrawer, setItemDrawer] = useState<ItemDrawer>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialog>(null)
  const [moveItemId, setMoveItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingDisable, setPendingDisable] = useState<ItemListRow | null>(null)
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<{
    id: string
    name: string
    code: string
  } | null>(null)
  const [deleteFolderForce, setDeleteFolderForce] = useState(false)
  const [deletingFolder, setDeletingFolder] = useState(false)
  const [toggling, setToggling] = useState(false)

  const [itemQuery, setItemQuery] = useState('')
  const debouncedItemQuery = useDebouncedValue(itemQuery, 250)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [browseTab, setBrowseTab] = useState<BrowseTab>('items')
  const [categories, setCategories] = useState<ItemCategoryOut[]>([])
  const [itemPage, setItemPage] = useState(1)
  const bulkFileRef = useRef<HTMLInputElement>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<Array<{
    row: number
    message: string
  }> | null>(null)
  const [editorFolderId, setEditorFolderId] = useState<string | null>(null)

  const folderOptions = useMemo(() => flattenFolders(tree), [tree])
  const folderNameOptions = useMemo(
    () => flattenFolderNameOptions(tree),
    [tree],
  )
  const itemRows = useMemo(() => flattenItems(tree), [tree])
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const cat of categories) map.set(cat.id, cat.name)
    return map
  }, [categories])

  const folderFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All folders' },
      { value: 'root', label: 'Root' },
      ...folderOptions.map((f) => ({ value: f.id, label: f.label })),
    ],
    [folderOptions],
  )

  const categoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All categories' },
      { value: 'none', label: 'No category' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  )

  const filteredItems = useMemo(() => {
    const q = debouncedItemQuery.trim().toLowerCase()
    return itemRows.filter((row) => {
      if (folderFilter === 'root' && row.folderId !== null) return false
      if (
        folderFilter !== 'all' &&
        folderFilter !== 'root' &&
        row.folderId !== folderFilter
      ) {
        return false
      }
      if (categoryFilter === 'none' && row.categoryIds.length > 0) return false
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'none' &&
        !row.categoryIds.includes(categoryFilter)
      ) {
        return false
      }
      if (typeFilter !== 'all' && row.itemType !== typeFilter) return false
      if (statusFilter === 'enabled' && !row.isActive) return false
      if (statusFilter === 'disabled' && row.isActive) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.itemId.toLowerCase().includes(q) ||
        row.folderPath.toLowerCase().includes(q)
      )
    })
  }, [
    itemRows,
    folderFilter,
    categoryFilter,
    typeFilter,
    statusFilter,
    debouncedItemQuery,
  ])

  useEffect(() => {
    setItemPage(1)
  }, [
    debouncedItemQuery,
    typeFilter,
    statusFilter,
    folderFilter,
    categoryFilter,
  ])

  const {
    pageItems: itemPageItems,
    totalPages: itemTotalPages,
    page: safeItemPage,
  } = useMemo(
    () => paginate(filteredItems, itemPage, DEFAULT_PAGE_SIZE),
    [filteredItems, itemPage],
  )

  useEffect(() => {
    if (safeItemPage !== itemPage) setItemPage(safeItemPage)
  }, [safeItemPage, itemPage])

  async function loadTree(preserveExpanded = true) {
    setLoading(true)
    try {
      const response = await apiFetch<TreeNode[]>('/tree')
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load tree')
        return
      }
      setTree(response.data)
      if (!preserveExpanded) setExpanded(new Set())
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  async function loadCategories() {
    try {
      const response = await apiFetch<ItemCategoryOut[]>('/item-categories')
      if (!response.success || !response.data) return
      setCategories(response.data)
    } catch {
      /* optional for list labels */
    }
  }

  useEffect(() => {
    void loadTree(false)
    void loadCategories()
  }, [])

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectFolderFilter(id: string) {
    setFolderFilter(id)
    setExpanded((prev) => new Set(prev).add(id))
  }

  function createFolderParentId(): string | null {
    if (folderFilter === 'all' || folderFilter === 'root') return null
    return folderFilter
  }

  function createItemFolderId(): string | null {
    return createFolderParentId()
  }

  const selectedFolderNode =
    folderFilter !== 'all' && folderFilter !== 'root'
      ? findNode(tree, folderFilter)
      : null
  const selectedFolder =
    selectedFolderNode?.type === 'folder' ? selectedFolderNode : null

  async function confirmDeleteFolder() {
    if (!canManage || !pendingDeleteFolder) return
    setDeletingFolder(true)
    try {
      const qs = deleteFolderForce ? '?force=true' : ''
      const response = await apiFetch(
        `/folders/${pendingDeleteFolder.id}${qs}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Delete failed')
        return
      }
      toast.success(
        deleteFolderForce
          ? 'Folder deleted; items moved to Orphan'
          : 'Folder deleted',
      )
      setPendingDeleteFolder(null)
      setDeleteFolderForce(false)
      if (folderFilter === pendingDeleteFolder.id) setFolderFilter('all')
      await loadTree()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeletingFolder(false)
    }
  }

  const setItemActive = useCallback(
    async (item: ItemListRow, next: boolean) => {
      setToggling(true)
      try {
        const response = await apiFetch<ItemOut>(`/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        })
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to update item')
          return
        }
        toast.success(next ? 'Item enabled' : 'Item disabled')
        await loadTree()
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        setToggling(false)
        setPendingDisable(null)
      }
    },
    [],
  )

  const onToggleActive = useCallback(
    (item: ItemListRow) => {
      if (item.isActive) {
        setPendingDisable(item)
        return
      }
      void setItemActive(item, true)
    },
    [setItemActive],
  )

  const editingItem =
    itemDrawer?.mode === 'edit'
      ? (itemRows.find((r) => r.id === itemDrawer.id) ?? null)
      : null

  useEffect(() => {
    if (itemDrawer?.mode === 'create') {
      setEditorFolderId(itemDrawer.folderId)
      return
    }
    if (itemDrawer?.mode === 'edit') {
      setEditorFolderId(editingItem?.folderId ?? null)
    }
  }, [itemDrawer, editingItem?.folderId])

  const itemColumns = useMemo<ListTableColumn<ItemListRow>[]>(
    () => [
      {
        header: 'Item ID',
        icon: Hash,
        widthClassName: 'w-32',
        cellClassName: 'truncate font-mono text-sm whitespace-nowrap',
        cell: (item) => (
          <span className="block truncate" title={item.itemId}>
            {item.itemId}
          </span>
        ),
      },
      {
        header: 'Name',
        icon: Package,
        widthClassName: 'min-w-[14rem]',
        cellClassName: 'min-w-0 font-medium',
        cell: (item) => (
          <span className="block truncate" title={item.name}>
            {item.name}
          </span>
        ),
      },
      {
        header: 'Type',
        icon: Shapes,
        widthClassName: 'w-28',
        cellClassName: 'whitespace-nowrap',
        cell: (item) => itemTypeLabel(item.itemType),
      },
      {
        header: 'Category',
        icon: Tag,
        widthClassName: 'min-w-[10rem] max-w-[12rem]',
        cellClassName: cn(hintClassName, 'min-w-0 whitespace-nowrap'),
        cell: (item) => {
          const names = item.categoryIds
            .map((id) => categoryNameById.get(id))
            .filter((n): n is string => Boolean(n))
          const label = names.length > 0 ? names.join(', ') : '—'
          return (
            <span className="block truncate" title={label}>
              {label}
            </span>
          )
        },
      },
      {
        header: 'Folder',
        icon: Folder,
        widthClassName: 'min-w-[10rem] max-w-[14rem]',
        cellClassName: cn(hintClassName, 'min-w-0'),
        cell: (item) => (
          <span className="block truncate" title={item.folderPath || 'Root'}>
            {item.folderPath || '—'}
          </span>
        ),
      },
      {
        header: 'Status',
        icon: ToggleRight,
        widthClassName: 'w-28',
        cell: (item) => <StatusPill active={item.isActive} />,
      },
      {
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-28 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (item) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              title="Edit"
              onClick={() => setItemDrawer({ mode: 'edit', id: item.id })}
            >
              <Pencil />
            </Button>
            {canManage ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move"
                  title="Move"
                  onClick={() => setMoveItemId(item.id)}
                >
                  <FolderInput />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={toggling}
                  aria-label={item.isActive ? 'Disable' : 'Enable'}
                  title={item.isActive ? 'Disable' : 'Enable'}
                  className={
                    item.isActive
                      ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                      : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }
                  onClick={() => onToggleActive(item)}
                >
                  {item.isActive ? <Ban /> : <CircleCheck />}
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canManage, onToggleActive, categoryNameById, toggling],
  )

  async function closeItemDrawerAndReload() {
    setItemDrawer(null)
    await Promise.all([loadTree(), loadCategories()])
  }

  async function downloadBulkTemplate() {
    if (!canManage || bulkBusy) return
    setBulkBusy(true)
    try {
      await apiDownload('/items/bulk/template', 'item-master-template.xlsx')
      toast.success('Template downloaded')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setBulkBusy(false)
    }
  }

  async function onBulkFileSelected(file: File | null) {
    if (!canManage || !file || bulkBusy) return
    setBulkBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await apiUpload<{ created: number }>('/items/bulk', form)
      if (!response.success) {
        const errors = (
          response.data as {
            errors?: Array<{ row: number; message: string }>
          } | null
        )?.errors
        if (errors?.length) {
          setBulkErrors(errors)
        } else {
          toast.error(response.message || 'Upload failed')
        }
        return
      }
      toast.success(
        response.message || `Created ${response.data?.created ?? 0} item(s)`,
      )
      await loadTree()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBulkBusy(false)
      if (bulkFileRef.current) bulkFileRef.current.value = ''
    }
  }

  const filtersActive =
    Boolean(debouncedItemQuery.trim()) ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    folderFilter !== 'all' ||
    categoryFilter !== 'all'

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={pageTitleClassName}>Item Master Data</h1>
            <p className={`mt-1 ${hintClassName}`}>
              Browse items by folder. Filter by type, category, or status
              {canManage ? ', or create and edit' : ''}.
            </p>
          </div>
          {canManage && browseTab === 'items' ? (
            <div className="flex flex-wrap gap-2">
              <input
                ref={bulkFileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) =>
                  void onBulkFileSelected(e.target.files?.[0] ?? null)
                }
              />
              <Button
                type="button"
                variant="outline"
                className={buttonOutlineClassName}
                disabled={bulkBusy}
                onClick={() => void downloadBulkTemplate()}
              >
                <Download className="size-4" aria-hidden />
                Download template
              </Button>
              <Button
                type="button"
                variant="outline"
                className={buttonOutlineClassName}
                disabled={bulkBusy}
                onClick={() => bulkFileRef.current?.click()}
              >
                <Upload className="size-4" aria-hidden />
                Upload Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                className={buttonOutlineClassName}
                onClick={() =>
                  setFolderDialog({
                    type: 'create-folder',
                    parentId: createFolderParentId(),
                  })
                }
              >
                <FolderPlus className="size-4" aria-hidden />
                New folder
              </Button>
              <Button
                type="button"
                className={buttonClassName}
                onClick={() =>
                  setItemDrawer({
                    mode: 'create',
                    folderId: createItemFolderId(),
                  })
                }
              >
                <Plus className="size-4" aria-hidden />
                New item
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <Tabs
        value={browseTab}
        onValueChange={(value) => {
          if (value === 'items' || value === 'categories') {
            setBrowseTab(value)
            if (value === 'items') {
              void loadTree()
              void loadCategories()
            }
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="pt-3">
          <ItemCategoryForm />
        </TabsContent>
        <TabsContent value="items" className="pt-3">
          <div className="grid min-h-[32rem] gap-4 lg:h-[calc(100dvh-11rem)] lg:min-h-[32rem] lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-stretch">
            <aside
              className={cn(
                cardClassName,
                'hidden min-h-0 flex-col overflow-hidden lg:flex',
              )}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-(--line) bg-(--paper) px-3 py-2.5">
                <button
                  type="button"
                  className={cn(
                    'rounded-sm px-2 py-1 text-sm transition',
                    folderFilter === 'all'
                      ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                      : 'text-(--muted) hover:bg-(--surface) hover:text-(--ink)',
                  )}
                  onClick={() => setFolderFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-sm transition',
                    folderFilter === 'root'
                      ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                      : 'text-(--muted) hover:bg-(--surface) hover:text-(--ink)',
                  )}
                  onClick={() => setFolderFilter('root')}
                >
                  <Folder className="size-3.5" aria-hidden />
                  Root
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2">
                {loading ? (
                  <p className={cn(hintClassName, 'px-2 py-4')}>Loading…</p>
                ) : (
                  <FolderNav
                    nodes={tree}
                    expanded={expanded}
                    selectedFolderId={
                      folderFilter !== 'all' && folderFilter !== 'root'
                        ? folderFilter
                        : null
                    }
                    onToggle={toggleFolder}
                    onSelectFolder={selectFolderFilter}
                  />
                )}
              </div>
              {canManage && selectedFolder ? (
                <div className="flex flex-wrap gap-1 border-t border-(--line) px-2 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      setFolderDialog({
                        type: 'edit-folder',
                        id: selectedFolder.id,
                      })
                    }
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() =>
                      setFolderDialog({
                        type: 'move-folder',
                        id: selectedFolder.id,
                      })
                    }
                  >
                    <FolderInput className="size-3.5" aria-hidden />
                    Move
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-red-700"
                    onClick={() => {
                      setDeleteFolderForce(false)
                      setPendingDeleteFolder({
                        id: selectedFolder.id,
                        name: selectedFolder.name,
                        code: selectedFolder.code,
                      })
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </Button>
                </div>
              ) : null}
            </aside>

            <div
              className={cn(
                cardClassName,
                'flex min-h-0 min-w-0 flex-col overflow-hidden px-4 py-4',
              )}
            >
              <div className="min-h-0 flex-1 overflow-auto">
                <ListTable
                  filters={
                    <>
                      <ListSearchInput
                        value={itemQuery}
                        onChange={setItemQuery}
                        placeholder="Filter names…"
                        aria-label="Filter items"
                        className="min-w-0 max-w-none flex-1"
                      />
                      <Combobox
                        value={typeFilter}
                        onValueChange={(value) => {
                          if (
                            value === 'all' ||
                            value === 'material' ||
                            value === 'labour'
                          ) {
                            setTypeFilter(value)
                          }
                        }}
                        options={[...TYPE_FILTER_OPTIONS]}
                        placeholder="All types"
                        searchPlaceholder="Search type…"
                        emptyText="No type found."
                        aria-label="Type filter"
                        className="w-[8.5rem] shrink-0"
                      />
                      <Combobox
                        value={categoryFilter}
                        onValueChange={setCategoryFilter}
                        options={categoryFilterOptions}
                        placeholder="All categories"
                        searchPlaceholder="Search category…"
                        emptyText="No category found."
                        aria-label="Category filter"
                        className="w-[10rem] shrink-0"
                      />
                      <Combobox
                        value={statusFilter}
                        onValueChange={(value) => {
                          if (
                            value === 'all' ||
                            value === 'enabled' ||
                            value === 'disabled'
                          ) {
                            setStatusFilter(value)
                          }
                        }}
                        options={[...STATUS_FILTER_OPTIONS]}
                        placeholder="All statuses"
                        searchPlaceholder="Search status…"
                        emptyText="No status found."
                        aria-label="Status filter"
                        className="w-[9rem] shrink-0"
                      />
                      <Combobox
                        value={folderFilter}
                        onValueChange={setFolderFilter}
                        options={folderFilterOptions}
                        placeholder="All folders"
                        searchPlaceholder="Search folders…"
                        emptyText="No folder found."
                        aria-label="Folder filter"
                        className="w-[10rem] shrink-0 lg:hidden"
                      />
                    </>
                  }
                  loading={loading}
                  loadingLabel="Loading items…"
                  empty={
                    filtersActive
                      ? 'No items match the current filters.'
                      : 'No items yet.'
                  }
                  columns={itemColumns}
                  rows={itemPageItems}
                  rowKey={(item) => item.id}
                  minWidthClassName="min-w-[720px] table-fixed"
                  pagination={{
                    page: safeItemPage,
                    totalPages: itemTotalPages,
                    totalItems: filteredItems.length,
                    pageSize: DEFAULT_PAGE_SIZE,
                    onPageChange: setItemPage,
                  }}
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={folderDialog !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setFolderDialog(null)
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="space-y-1.5 border-b border-(--line) px-6 py-4 text-left">
            <DialogTitle>
              {folderDialog?.type === 'create-folder'
                ? 'New folder'
                : folderDialog?.type === 'edit-folder'
                  ? 'Rename folder'
                  : folderDialog?.type === 'move-folder'
                    ? 'Move folder'
                    : 'Folder'}
            </DialogTitle>
            <DialogDescription>
              {folderDialog?.type === 'create-folder'
                ? 'Name the folder. Its code is generated automatically.'
                : folderDialog?.type === 'edit-folder'
                  ? 'Update the folder name. The code stays the same.'
                  : folderDialog?.type === 'move-folder'
                    ? 'Choose a new parent for this folder.'
                    : 'Manage folder.'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            {folderDialog?.type === 'create-folder' ||
            folderDialog?.type === 'edit-folder' ? (
              <FolderDialogEditor
                tree={tree}
                folderDialog={folderDialog}
                saving={saving}
                setSaving={setSaving}
                onCancel={() => setFolderDialog(null)}
                onCreated={async (id) => {
                  setFolderDialog(null)
                  setFolderFilter(id)
                  await loadTree()
                }}
                onUpdated={async () => {
                  setFolderDialog(null)
                  await loadTree()
                }}
              />
            ) : folderDialog?.type === 'move-folder' ? (
              <MoveForm
                title="Move folder"
                excludeFolderId={folderDialog.id}
                folderOptions={folderOptions}
                saving={saving}
                setSaving={setSaving}
                onCancel={() => setFolderDialog(null)}
                onSubmit={async (newParentId) => {
                  const response = await apiFetch<FolderOut>(
                    `/folders/${folderDialog.id}/move`,
                    {
                      method: 'POST',
                      body: JSON.stringify({ newParentId }),
                    },
                  )
                  if (!response.success || !response.data) {
                    throw new Error(response.message || 'Move failed')
                  }
                  toast.success('Folder moved')
                  setFolderDialog(null)
                  await loadTree()
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveItemId !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setMoveItemId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move item</DialogTitle>
          </DialogHeader>
          {moveItemId ? (
            <MoveForm
              title="Move item"
              folderOptions={folderOptions}
              saving={saving}
              setSaving={setSaving}
              onCancel={() => setMoveItemId(null)}
              onSubmit={async (newFolderId) => {
                const response = await apiFetch<ItemOut>(
                  `/items/${moveItemId}/move`,
                  {
                    method: 'POST',
                    body: JSON.stringify({ newFolderId }),
                  },
                )
                if (!response.success || !response.data) {
                  throw new Error(response.message || 'Move failed')
                }
                toast.success('Item moved')
                setMoveItemId(null)
                await loadTree()
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteFolder !== null}
        onOpenChange={(open) => {
          if (!open && !deletingFolder) {
            setPendingDeleteFolder(null)
            setDeleteFolderForce(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteFolder
                ? `“${pendingDeleteFolder.name}” (${pendingDeleteFolder.code}) must be empty to delete normally.`
                : 'This folder must be empty to delete normally.'}{' '}
              With override, all items in this folder and its subfolders move to
              the root Orphan folder (created if needed), then the folder tree
              is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 rounded-md border border-(--line) px-3 py-2 text-sm">
            <Checkbox
              checked={deleteFolderForce}
              disabled={deletingFolder}
              onCheckedChange={(checked) =>
                setDeleteFolderForce(checked === true)
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">I want to delete this folder</span>
              <span className={cn('mt-0.5 block', hintClassName)}>
                Force: move items to Orphan, then delete the folder.
              </span>
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingFolder}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletingFolder}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteFolder()
              }}
            >
              {deletingFolder ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDisableDialog
        open={pendingDisable !== null}
        title="Disable item?"
        description={
          pendingDisable
            ? `“${pendingDisable.name}” (${pendingDisable.itemId}) will be disabled and can be enabled again later.`
            : 'This item will be disabled and can be enabled again later.'
        }
        busy={toggling}
        onOpenChange={(open) => {
          if (!open) setPendingDisable(null)
        }}
        onConfirm={() => {
          if (pendingDisable) void setItemActive(pendingDisable, false)
        }}
      />

      <Dialog
        open={bulkErrors !== null}
        onOpenChange={(open) => {
          if (!open) setBulkErrors(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload errors</DialogTitle>
            <DialogDescription>
              No items were created. Fix these rows and upload again.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
            {(bulkErrors ?? []).map((err) => (
              <li key={`${err.row}-${err.message}`}>
                <span className="font-medium">Row {err.row}:</span>{' '}
                <span className={hintClassName}>{err.message}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className={buttonOutlineClassName}
              onClick={() => setBulkErrors(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet
        open={itemDrawer !== null}
        onOpenChange={(open) => {
          if (!open) setItemDrawer(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>
              {itemDrawer?.mode === 'edit' ? 'Edit item' : 'New item'}
            </SheetTitle>
            <SheetDescription>
              {itemDrawer?.mode === 'edit'
                ? 'Update item details, folder, vendors, units, and tarifs.'
                : 'Fill in the details for the new item.'}
            </SheetDescription>
          </SheetHeader>
          {itemDrawer ? (
            <div className="space-y-6 px-4 pb-4">
              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <Folder className="size-3.5 text-(--muted)" aria-hidden />
                  Location
                </span>
                {canManage ? (
                  <Combobox
                    value={editorFolderId ?? FOLDER_ROOT}
                    onValueChange={(value) =>
                      setEditorFolderId(value === FOLDER_ROOT ? null : value)
                    }
                    options={[
                      { value: FOLDER_ROOT, label: 'Root' },
                      ...folderNameOptions.map((opt) => ({
                        value: opt.id,
                        label: opt.label,
                      })),
                    ]}
                    placeholder="Select folder…"
                    searchPlaceholder="Search folders…"
                    emptyText="No folder found."
                    className="w-full min-w-0"
                    aria-label="Item folder"
                  />
                ) : (
                  <p className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-(--line) bg-(--surface) px-3 py-1.5 text-sm font-medium">
                    <span className="min-w-0 truncate">
                      {folderNamePath(tree, editorFolderId)}
                    </span>
                  </p>
                )}
              </div>

              <ItemForm
                key={
                  itemDrawer.mode === 'edit'
                    ? itemDrawer.id
                    : `create-${itemDrawer.folderId ?? 'root'}`
                }
                title={itemDrawer.mode === 'edit' ? 'Edit item' : 'New item'}
                itemId={itemDrawer.mode === 'edit' ? itemDrawer.id : undefined}
                initialName={editingItem?.name ?? ''}
                initialDescription={editingItem?.description ?? ''}
                initialItemType={editingItem?.itemType ?? 'material'}
                initialCategoryIds={editingItem?.categoryIds ?? []}
                showItemId={editingItem?.itemId}
                saving={saving}
                setSaving={setSaving}
                onCancel={() => setItemDrawer(null)}
                onSubmit={async (
                  name,
                  description,
                  itemType,
                  categoryIds,
                  uoms,
                  tarifs,
                  vendorIds,
                ) => {
                  if (itemDrawer.mode === 'create') {
                    const response = await apiFetch<ItemOut>('/items', {
                      method: 'POST',
                      body: JSON.stringify({
                        name,
                        description,
                        itemType,
                        folderId: editorFolderId,
                        categoryIds,
                        vendorIds,
                        uoms,
                        tarifs,
                      }),
                    })
                    if (!response.success || !response.data) {
                      throw new Error(response.message || 'Create failed')
                    }
                    toast.success('Item created')
                    await closeItemDrawerAndReload()
                    return
                  }
                  const response = await apiFetch<ItemOut>(
                    `/items/${itemDrawer.id}`,
                    {
                      method: 'PATCH',
                      body: JSON.stringify({
                        name,
                        description,
                        itemType,
                        categoryIds,
                        vendorIds,
                        uoms,
                        tarifs,
                      }),
                    },
                  )
                  if (!response.success || !response.data) {
                    throw new Error(response.message || 'Update failed')
                  }
                  const previousFolderId = editingItem?.folderId ?? null
                  if (editorFolderId !== previousFolderId) {
                    const moved = await apiFetch<ItemOut>(
                      `/items/${itemDrawer.id}/move`,
                      {
                        method: 'POST',
                        body: JSON.stringify({ newFolderId: editorFolderId }),
                      },
                    )
                    if (!moved.success || !moved.data) {
                      throw new Error(moved.message || 'Move failed')
                    }
                  }
                  toast.success('Item updated')
                  await closeItemDrawerAndReload()
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
