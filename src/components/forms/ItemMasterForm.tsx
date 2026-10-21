import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  Ban,
  Banknote,
  ChevronDown,
  CircleCheck,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Hash,
  Layers,
  Link2,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Ruler,
  Save,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
import type { UomItem } from '#/components/forms/UomForm'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Combobox } from '#/components/ui/combobox'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import {
  findNode,
  flattenFolders,
  flattenItems,
  pickCurrentTarif,
  todayYmdLocal,
  type FolderOut,
  type ItemListRow,
  type ItemOut,
  type ItemTarifRow,
  type ItemUomRow,
  type TreeFolderNode,
  type TreeItemNode,
  type TreeNode,
} from '#/lib/itemMaster'
import type { VendorListItem } from '#/lib/vendor'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Selection =
  | { kind: 'root' }
  | { kind: 'folder'; id: string }
  | { kind: 'item'; id: string }

type PanelMode =
  | { type: 'idle' }
  | { type: 'create-folder'; parentId: string | null }
  | { type: 'edit-folder'; id: string }
  | { type: 'move-folder'; id: string }
  | { type: 'create-item'; folderId: string | null }
  | { type: 'edit-item'; id: string }
  | { type: 'move-item'; id: string }

export default function ItemMasterForm() {
  const { can } = useAuth()
  const canManage = can('itemMaster.manage')

  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<Selection>({ kind: 'root' })
  const [panel, setPanel] = useState<PanelMode>({ type: 'idle' })
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
  const [itemPage, setItemPage] = useState(1)
  const [selectionDetail, setSelectionDetail] = useState<ItemOut | null>(null)
  const [selectionDetailLoading, setSelectionDetailLoading] = useState(false)

  const folderOptions = useMemo(() => flattenFolders(tree), [tree])
  const itemRows = useMemo(() => flattenItems(tree), [tree])
  const selectedItemRow = useMemo(() => {
    if (selection.kind !== 'item') return null
    return itemRows.find((row) => row.id === selection.id) ?? null
  }, [itemRows, selection])

  const filteredItems = useMemo(() => {
    const q = debouncedItemQuery.trim().toLowerCase()
    if (!q) return itemRows
    return itemRows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.itemId.toLowerCase().includes(q) ||
        row.folderPath.toLowerCase().includes(q),
    )
  }, [itemRows, debouncedItemQuery])

  useEffect(() => {
    setItemPage(1)
  }, [debouncedItemQuery])

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
      if (!preserveExpanded) {
        setExpanded(new Set())
      }
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTree(false)
  }, [])

  useEffect(() => {
    if (selection.kind !== 'item') {
      setSelectionDetail(null)
      setSelectionDetailLoading(false)
      return
    }
    let cancelled = false
    setSelectionDetailLoading(true)
    void (async () => {
      try {
        const response = await apiFetch<ItemOut>(`/items/${selection.id}`)
        if (cancelled) return
        if (response.success && response.data) {
          setSelectionDetail(response.data)
        } else {
          setSelectionDetail(null)
        }
      } catch {
        if (!cancelled) setSelectionDetail(null)
      } finally {
        if (!cancelled) setSelectionDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selection])

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectRoot() {
    setSelection({ kind: 'root' })
    setPanel({ type: 'idle' })
  }

  function selectFolder(id: string) {
    setSelection({ kind: 'folder', id })
    setPanel({ type: 'idle' })
    setExpanded((prev) => new Set(prev).add(id))
  }

  function selectItem(id: string) {
    setSelection({ kind: 'item', id })
    setPanel({ type: 'idle' })
  }

  const selectedNode =
    selection.kind === 'root' ? null : findNode(tree, selection.id)

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
      selectRoot()
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

  const itemColumns = useMemo<ListTableColumn<ItemListRow>[]>(
    () => [
      {
        header: 'Item ID',
        cellClassName: 'font-mono text-sm',
        cell: (item) => item.itemId,
      },
      {
        header: 'Name',
        cellClassName: 'font-medium',
        cell: (item) => item.name,
      },
      {
        header: 'Folder',
        cellClassName: hintClassName,
        cell: (item) => item.folderPath || '—',
      },
      {
        header: 'Status',
        cell: (item) => <StatusPill active={item.isActive} />,
      },
      {
        header: '',
        cellClassName: 'text-right',
        cell: (item) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  selectItem(item.id)
                  setPanel({ type: 'edit-item', id: item.id })
                }}
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      selectItem(item.id)
                      setPanel({ type: 'move-item', id: item.id })
                    }}
                  >
                    <FolderInput className="size-4" aria-hidden />
                    Move
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onToggleActive(item)}>
                    {item.isActive ? (
                      <Ban className="size-4" aria-hidden />
                    ) : (
                      <CircleCheck className="size-4" aria-hidden />
                    )}
                    {item.isActive ? 'Disable' : 'Enable'}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canManage, onToggleActive],
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-sm text-(--muted)">
          Master Data / Item Master Data
        </p>
        <h1 className="text-2xl font-medium tracking-tight">
          Item Master Data
        </h1>
        <p className={`mt-2 ${hintClassName}`}>
          Browse folders and items. Expand folders to navigate the tree
          {canManage
            ? '; create, edit, move, or enable/disable from the panel or table'
            : ''}
          .
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className={cn(cardClassName, 'flex max-h-[min(70dvh,36rem)] flex-col overflow-hidden sm:max-h-none')}>
          <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-(--line) bg-(--paper) px-3 py-2">
            <button
              type="button"
              className={cn(
                'rounded-sm px-2 py-1 text-sm transition',
                selection.kind === 'root'
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                  : 'text-(--muted) hover:bg-(--surface) hover:text-(--ink)',
              )}
              onClick={selectRoot}
            >
              Root
            </button>
            {canManage ? (
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New folder at root"
                  title="New folder at root"
                  onClick={() =>
                    setPanel({ type: 'create-folder', parentId: null })
                  }
                >
                  <FolderPlus className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New item at root"
                  title="New item at root"
                  onClick={() =>
                    setPanel({ type: 'create-item', folderId: null })
                  }
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-2 max-h-[min(50dvh,22rem)] sm:max-h-[min(60vh,32rem)]">
            {loading ? (
              <div className={`flex items-center gap-2 px-2 py-4 ${hintClassName}`}>
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Loading tree…
              </div>
            ) : tree.length === 0 ? (
              <p className={`px-3 py-6 text-center ${hintClassName}`}>
                No folders or items yet.
              </p>
            ) : (
              <TreeList
                nodes={tree}
                depth={0}
                expanded={expanded}
                selection={selection}
                onToggle={toggleFolder}
                onSelectFolder={selectFolder}
                onSelectItem={selectItem}
              />
            )}
          </div>
        </section>

        <section className="max-h-[min(70dvh,36rem)] space-y-4 overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible">
          <div className={cn(cardClassName, 'space-y-4 px-4 py-4')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Selection</h2>
              {selection.kind === 'root' ? (
                <span className="inline-flex items-center gap-1 text-xs text-(--muted)">
                  <Layers className="size-3.5" aria-hidden />
                  Root
                </span>
              ) : selectedNode?.type === 'folder' ? (
                <span className="inline-flex items-center gap-1 text-xs text-(--muted)">
                  <Folder className="size-3.5" aria-hidden />
                  Folder
                </span>
              ) : selectedNode?.type === 'item' ? (
                <span className="inline-flex items-center gap-1 text-xs text-(--muted)">
                  <Package className="size-3.5" aria-hidden />
                  Item
                </span>
              ) : null}
            </div>

            {selection.kind === 'root' ? (
              <div className="space-y-3">
                <p className={hintClassName}>
                  Top level of the item master. Create folders to organize items,
                  or add items directly here.
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border border-(--line) px-3 py-2">
                    <dt className="text-xs text-(--muted)">Folders</dt>
                    <dd className="font-medium tabular-nums">
                      {tree.filter((n) => n.type === 'folder').length}
                    </dd>
                  </div>
                  <div className="rounded-md border border-(--line) px-3 py-2">
                    <dt className="text-xs text-(--muted)">Root items</dt>
                    <dd className="font-medium tabular-nums">
                      {tree.filter((n) => n.type === 'item').length}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : selectedNode?.type === 'folder' ? (
              <FolderSelection
                node={selectedNode}
                canManage={canManage}
                onCreateSubfolder={() =>
                  setPanel({
                    type: 'create-folder',
                    parentId: selectedNode.id,
                  })
                }
                onCreateItem={() =>
                  setPanel({
                    type: 'create-item',
                    folderId: selectedNode.id,
                  })
                }
                onEdit={() =>
                  setPanel({ type: 'edit-folder', id: selectedNode.id })
                }
                onMove={() =>
                  setPanel({ type: 'move-folder', id: selectedNode.id })
                }
                onDelete={() => {
                  setDeleteFolderForce(false)
                  setPendingDeleteFolder({
                    id: selectedNode.id,
                    name: selectedNode.name,
                    code: selectedNode.code,
                  })
                }}
              />
            ) : selectedNode?.type === 'item' ? (
              <ItemSelection
                node={selectedNode}
                folderPath={selectedItemRow?.folderPath ?? 'Root'}
                detail={selectionDetail}
                detailLoading={selectionDetailLoading}
                canManage={canManage}
                toggling={toggling}
                onEdit={() =>
                  setPanel({ type: 'edit-item', id: selectedNode.id })
                }
                onMove={() =>
                  setPanel({ type: 'move-item', id: selectedNode.id })
                }
                onToggleActive={() =>
                  onToggleActive({
                    id: selectedNode.id,
                    itemId: selectedNode.itemId,
                    name: selectedNode.name,
                    description: selectedNode.description,
                    folderId: selectedItemRow?.folderId ?? null,
                    folderPath: selectedItemRow?.folderPath ?? '',
                    isActive: selectedNode.isActive,
                  })
                }
              />
            ) : (
              <p className={hintClassName}>Selected node no longer exists.</p>
            )}
          </div>

          {canManage && panel.type !== 'idle' ? (
            <ActionPanel
              panel={panel}
              folderOptions={folderOptions}
              selectedNode={selectedNode}
              saving={saving}
              setSaving={setSaving}
              onCancel={() => setPanel({ type: 'idle' })}
              onDone={async (nextSelection?: Selection) => {
                setPanel({ type: 'idle' })
                if (nextSelection) setSelection(nextSelection)
                await loadTree()
              }}
            />
          ) : null}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium tracking-tight">All items</h2>
        <ListTable
          filters={
            <ListSearchInput
              value={itemQuery}
              onChange={setItemQuery}
              placeholder="Filter names…"
              aria-label="Filter items"
              className="max-w-md flex-none"
            />
          }
          loading={loading}
          loadingLabel="Loading items…"
          empty={
            debouncedItemQuery.trim()
              ? `No items match “${debouncedItemQuery.trim()}”.`
              : 'No items yet.'
          }
          columns={itemColumns}
          rows={itemPageItems}
          rowKey={(item) => item.id}
          minWidthClassName="min-w-[640px]"
          pagination={{
            page: safeItemPage,
            totalPages: itemTotalPages,
            totalItems: filteredItems.length,
            pageSize: DEFAULT_PAGE_SIZE,
            onPageChange: setItemPage,
          }}
        />
      </section>

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
              the root Orphan folder (created if needed), then the folder tree is
              removed.
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
                Override: move all items to Orphan, then delete the folder tree.
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
    </div>
  )
}

function TreeList({
  nodes,
  depth,
  expanded,
  selection,
  onToggle,
  onSelectFolder,
  onSelectItem,
}: {
  nodes: TreeNode[]
  depth: number
  expanded: Set<string>
  selection: Selection
  onToggle: (id: string) => void
  onSelectFolder: (id: string) => void
  onSelectItem: (id: string) => void
}) {
  return (
    <ul
      className={cn(
        'm-0 flex list-none flex-col gap-0.5 p-0',
        depth > 0 && 'ml-3 border-l border-(--line) pl-1.5',
      )}
    >
      {nodes.map((node) => {
        if (node.type === 'folder') {
          const open = expanded.has(node.id)
          const selected =
            selection.kind === 'folder' && selection.id === node.id
          return (
            <li key={node.id}>
              <div className="flex items-stretch gap-0.5">
                <button
                  type="button"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-(--muted) hover:bg-(--surface) hover:text-(--ink)"
                  aria-label={open ? 'Collapse folder' : 'Expand folder'}
                  aria-expanded={open}
                  onClick={() => onToggle(node.id)}
                >
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform duration-150',
                      open ? 'rotate-0' : '-rotate-90',
                    )}
                    aria-hidden
                  />
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition',
                    selected
                      ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                      : 'hover:bg-(--surface)',
                  )}
                  onClick={() => onSelectFolder(node.id)}
                >
                  <Folder
                    className={cn(
                      'size-4 shrink-0',
                      selected ? 'text-(--accent)' : 'text-(--muted)',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">
                    <span className="font-mono">{node.code}</span>
                    <span className={selected ? 'text-(--accent)/70' : 'text-(--muted)'}>
                      {' '}
                      —{' '}
                    </span>
                    {node.name}
                  </span>
                </button>
              </div>
              {open ? (
                <TreeList
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  selection={selection}
                  onToggle={onToggle}
                  onSelectFolder={onSelectFolder}
                  onSelectItem={onSelectItem}
                />
              ) : null}
            </li>
          )
        }

        const selected = selection.kind === 'item' && selection.id === node.id
        return (
          <li key={node.id}>
            <button
              type="button"
              className={cn(
                'ml-8 flex w-[calc(100%-2rem)] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition',
                selected
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-(--accent)'
                  : 'text-(--muted) hover:bg-(--surface) hover:text-(--ink)',
              )}
              onClick={() => onSelectItem(node.id)}
            >
              <FileText className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                <span
                  className={cn(
                    'font-mono',
                    selected ? 'text-(--accent)' : 'text-(--ink)',
                  )}
                >
                  {node.itemId}
                </span>
                <span> — {node.name}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ActionPanel({
  panel,
  folderOptions,
  selectedNode,
  saving,
  setSaving,
  onCancel,
  onDone,
}: {
  panel: Exclude<PanelMode, { type: 'idle' }>
  folderOptions: Array<{ id: string; label: string }>
  selectedNode: TreeNode | null
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onDone: (next?: Selection) => Promise<void>
}) {
  if (panel.type === 'create-folder' || panel.type === 'edit-folder') {
    const editing =
      panel.type === 'edit-folder' && selectedNode?.type === 'folder'
        ? selectedNode
        : null
    return (
      <FolderForm
        mode={panel.type === 'create-folder' ? 'create' : 'edit'}
        title={panel.type === 'create-folder' ? 'New folder' : 'Edit folder'}
        displayCode={editing?.code ?? ''}
        initialName={editing?.name ?? ''}
        saving={saving}
        setSaving={setSaving}
        onCancel={onCancel}
        onSubmit={async (name) => {
          if (panel.type === 'create-folder') {
            const response = await apiFetch<FolderOut>('/folders', {
              method: 'POST',
              body: JSON.stringify({
                name,
                parentId: panel.parentId,
              }),
            })
            if (!response.success || !response.data) {
              throw new Error(response.message || 'Create failed')
            }
            toast.success(
              `Folder created (${response.data.code})`,
            )
            await onDone({ kind: 'folder', id: response.data.id })
            return
          }
          const response = await apiFetch<FolderOut>(`/folders/${panel.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
          })
          if (!response.success || !response.data) {
            throw new Error(response.message || 'Update failed')
          }
          toast.success('Folder updated')
          await onDone({ kind: 'folder', id: panel.id })
        }}
      />
    )
  }

  if (panel.type === 'move-folder') {
    return (
      <MoveForm
        title="Move folder"
        excludeFolderId={panel.id}
        folderOptions={folderOptions}
        saving={saving}
        setSaving={setSaving}
        onCancel={onCancel}
        onSubmit={async (newParentId) => {
          const response = await apiFetch<FolderOut>(
            `/folders/${panel.id}/move`,
            {
              method: 'POST',
              body: JSON.stringify({ newParentId }),
            },
          )
          if (!response.success || !response.data) {
            throw new Error(response.message || 'Move failed')
          }
          toast.success('Folder moved')
          await onDone({ kind: 'folder', id: panel.id })
        }}
      />
    )
  }

  if (panel.type === 'create-item' || panel.type === 'edit-item') {
    const editing =
      panel.type === 'edit-item' && selectedNode?.type === 'item'
        ? selectedNode
        : null
    return (
      <ItemForm
        title={panel.type === 'create-item' ? 'New item' : 'Edit item'}
        itemId={panel.type === 'edit-item' ? panel.id : undefined}
        initialName={editing?.name ?? ''}
        initialDescription={editing?.description ?? ''}
        showItemId={editing?.itemId}
        saving={saving}
        setSaving={setSaving}
        onCancel={onCancel}
        onSubmit={async (name, description, uoms, tarifs, vendorIds) => {
          if (panel.type === 'create-item') {
            const response = await apiFetch<ItemOut>('/items', {
              method: 'POST',
              body: JSON.stringify({
                name,
                description,
                folderId: panel.folderId,
                vendorIds,
                uoms,
                tarifs,
              }),
            })
            if (!response.success || !response.data) {
              throw new Error(response.message || 'Create failed')
            }
            toast.success('Item created')
            await onDone({ kind: 'item', id: response.data.id })
            return
          }
          const response = await apiFetch<ItemOut>(`/items/${panel.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              name,
              description,
              vendorIds,
              uoms,
              tarifs,
            }),
          })
          if (!response.success || !response.data) {
            throw new Error(response.message || 'Update failed')
          }
          toast.success('Item updated')
          await onDone({ kind: 'item', id: panel.id })
        }}
      />
    )
  }

  return (
    <MoveForm
      title="Move item"
      folderOptions={folderOptions}
      saving={saving}
      setSaving={setSaving}
      onCancel={onCancel}
      onSubmit={async (newFolderId) => {
        const response = await apiFetch<ItemOut>(`/items/${panel.id}/move`, {
          method: 'POST',
          body: JSON.stringify({ newFolderId }),
        })
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Move failed')
        }
        toast.success('Item moved')
        await onDone({ kind: 'item', id: panel.id })
      }}
    />
  )
}

function FolderSelection({
  node,
  canManage,
  onCreateSubfolder,
  onCreateItem,
  onEdit,
  onMove,
  onDelete,
}: {
  node: TreeFolderNode
  canManage: boolean
  onCreateSubfolder: () => void
  onCreateItem: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const childFolders = node.children.filter((c) => c.type === 'folder').length
  const childItems = node.children.filter((c) => c.type === 'item').length

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="text-base font-medium leading-snug">{node.name}</p>
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-(--muted)">
          <Hash className="size-3.5 shrink-0" aria-hidden />
          {node.code}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-(--line) px-3 py-2">
          <dt className="flex items-center gap-1 text-xs text-(--muted)">
            <Folder className="size-3" aria-hidden />
            Subfolders
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">{childFolders}</dd>
        </div>
        <div className="rounded-md border border-(--line) px-3 py-2">
          <dt className="flex items-center gap-1 text-xs text-(--muted)">
            <Package className="size-3" aria-hidden />
            Items
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums">{childItems}</dd>
        </div>
      </dl>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-(--line) pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onCreateSubfolder}
          >
            <FolderPlus className="size-3.5" aria-hidden />
            Subfolder
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onCreateItem}
          >
            <Plus className="size-3.5" aria-hidden />
            Item
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onMove}
          >
            <FolderInput className="size-3.5" aria-hidden />
            Move
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-700"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ItemSelection({
  node,
  folderPath,
  detail,
  detailLoading,
  canManage,
  toggling,
  onEdit,
  onMove,
  onToggleActive,
}: {
  node: TreeItemNode
  folderPath: string
  detail: ItemOut | null
  detailLoading: boolean
  canManage: boolean
  toggling: boolean
  onEdit: () => void
  onMove: () => void
  onToggleActive: () => void
}) {
  const uoms = detail?.uoms ?? []
  const tarifs = detail?.tarifs ?? []
  const currentTarif = detail?.currentTarif ?? null
  const base = uoms.find((u) => u.isBase)
  const relatedCount = uoms.filter(
    (u) => !u.isBase && u.conversionFactor != null,
  ).length
  const standaloneCount = uoms.filter(
    (u) => !u.isBase && u.conversionFactor == null,
  ).length

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-medium leading-snug">{node.name}</p>
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-(--muted)">
            <Hash className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{node.itemId}</span>
          </p>
        </div>
        <StatusPill active={node.isActive} />
      </div>

      {node.description && node.description !== '-' ? (
        <p className={cn(hintClassName, 'leading-relaxed')}>
          {node.description}
        </p>
      ) : (
        <p className={cn(hintClassName, 'italic')}>No description</p>
      )}

      <div className="flex items-center gap-1.5 text-xs text-(--muted)">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{folderPath}</span>
      </div>

      <div className="rounded-md border border-(--line) px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Banknote className="size-3.5" aria-hidden />
          Tarif
        </div>
        {detailLoading ? (
          <p className={cn(hintClassName, 'flex items-center gap-1.5 text-xs')}>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Loading tarif…
          </p>
        ) : (
          <div className="space-y-2">
            <div className="text-xs">
              <dt className="text-(--muted)">Current</dt>
              <dd className="mt-0.5 font-mono font-medium tabular-nums">
                {currentTarif
                  ? `${currentTarif.amount} (from ${currentTarif.effectiveDate})`
                  : '—'}
              </dd>
            </div>
            {tarifs.length > 0 ? (
              <ul className="space-y-1 border-t border-(--line) pt-2">
                {tarifs.map((t) => {
                  const isCurrent =
                    currentTarif != null &&
                    t.effectiveDate === currentTarif.effectiveDate &&
                    t.amount === currentTarif.amount
                  return (
                    <li
                      key={t.id ?? t.effectiveDate}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-1.5 py-1 font-mono text-[11px]',
                        isCurrent && 'bg-(--surface)',
                      )}
                    >
                      <span className="text-(--muted)">{t.effectiveDate}</span>
                      <span className="tabular-nums">
                        {t.amount}
                        {isCurrent ? (
                          <span className="ml-1.5 text-[10px] font-sans text-emerald-700">
                            Current
                          </span>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={cn(hintClassName, 'text-xs')}>
                No tarif rows yet. Edit the item to add effective-dated prices.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-md border border-(--line) px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
          <Ruler className="size-3.5" aria-hidden />
          Units of measurement
        </div>
        {detailLoading ? (
          <p className={cn(hintClassName, 'flex items-center gap-1.5 text-xs')}>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Loading units…
          </p>
        ) : uoms.length === 0 ? (
          <p className={cn(hintClassName, 'text-xs')}>
            No units configured yet. Edit the item to add a base UOM.
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-(--muted)">Base</dt>
              <dd className="mt-0.5 font-mono font-medium">
                {base?.symbol || '—'}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-(--muted)">
                <Link2 className="size-3" aria-hidden />
                Related
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">{relatedCount}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-(--muted)">
                <Unlink className="size-3" aria-hidden />
                Standalone
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {standaloneCount}
              </dd>
            </div>
          </dl>
        )}
        {uoms.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5 border-t border-(--line) pt-2">
            {uoms.map((u) => (
              <li
                key={u.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border border-(--line) px-1.5 py-0.5 font-mono text-[11px]',
                  u.isBase && 'bg-(--surface)',
                )}
                title={
                  u.isBase
                    ? 'Base unit'
                    : u.conversionFactor != null
                      ? `1 ${u.symbol} = ${u.conversionFactor} ${base?.symbol ?? 'base'}`
                      : 'Not related to base'
                }
              >
                {u.isBase ? (
                  <CircleCheck className="size-3 text-emerald-600" aria-hidden />
                ) : u.conversionFactor != null ? (
                  <Link2 className="size-3 text-(--muted)" aria-hidden />
                ) : (
                  <Unlink className="size-3 text-(--muted)" aria-hidden />
                )}
                {u.symbol}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-(--line) pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            onClick={onMove}
          >
            <FolderInput className="size-3.5" aria-hidden />
            Move
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={buttonOutlineClassName}
            disabled={toggling}
            onClick={onToggleActive}
          >
            {node.isActive ? (
              <Ban className="size-3.5" aria-hidden />
            ) : (
              <CircleCheck className="size-3.5" aria-hidden />
            )}
            {node.isActive ? 'Disable' : 'Enable'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function FolderForm({
  mode,
  title,
  displayCode,
  initialName,
  saving,
  setSaving,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  title: string
  displayCode: string
  initialName: string
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSubmit(name.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(cardClassName, 'space-y-3 px-4 py-4')}
      noValidate
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {mode === 'create' ? (
        <p className={hintClassName}>
          Code is generated from the name and kept unique among siblings.
        </p>
      ) : displayCode ? (
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-(--muted)">
          <Hash className="size-3.5 shrink-0" aria-hidden />
          {displayCode}
        </p>
      ) : null}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <input
          className={inputClassName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </label>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className={buttonClassName}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonOutlineClassName}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

type UomFormRow = {
  key: string
  id?: string
  uomId: string
  isBase: boolean
  related: boolean
  factor: string
}

function emptyUomRow(isBase = false): UomFormRow {
  return {
    key: `new-${Math.random().toString(36).slice(2, 9)}`,
    uomId: '',
    isBase,
    related: isBase,
    factor: isBase ? '1' : '',
  }
}

function rowsFromItemUoms(uoms: ItemUomRow[]): UomFormRow[] {
  if (uoms.length === 0) return [emptyUomRow(true)]
  return uoms.map((u, i) => ({
    key: u.id ?? `row-${i}`,
    id: u.id,
    uomId: u.uomId,
    isBase: u.isBase,
    related: u.isBase || u.conversionFactor != null,
    factor: u.isBase ? '1' : (u.conversionFactor ?? ''),
  }))
}

function validateUomRows(rows: UomFormRow[]): string | null {
  if (rows.length === 0) return 'At least one UOM is required'
  const bases = rows.filter((r) => r.isBase)
  if (bases.length !== 1) return 'Exactly one base UOM is required'
  const seen = new Set<string>()
  for (const row of rows) {
    if (!row.uomId) return 'Each row needs a UOM'
    if (seen.has(row.uomId)) return 'Duplicate UOM'
    seen.add(row.uomId)
    if (row.isBase) continue
    if (row.related) {
      const n = Number(row.factor)
      if (!row.factor.trim() || !Number.isFinite(n) || n <= 0) {
        return 'Related UOM factor must be greater than 0'
      }
    }
  }
  return null
}

function toUomPayload(rows: UomFormRow[]): ItemUomRow[] {
  return rows.map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    uomId: row.uomId,
    isBase: row.isBase,
    conversionFactor: row.isBase
      ? '1'
      : row.related
        ? row.factor.trim()
        : null,
    sortOrder: index,
  }))
}

type TarifFormRow = {
  key: string
  id?: string
  effectiveDate: string
  amount: string
}

function emptyTarifRow(): TarifFormRow {
  return {
    key: `tarif-${Math.random().toString(36).slice(2, 9)}`,
    effectiveDate: todayYmdLocal(),
    amount: '',
  }
}

function rowsFromItemTarifs(tarifs: ItemTarifRow[]): TarifFormRow[] {
  if (tarifs.length === 0) return []
  return [...tarifs]
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
    .map((t, i) => ({
      key: t.id ?? `tarif-${i}`,
      id: t.id,
      effectiveDate: t.effectiveDate,
      amount: t.amount,
    }))
}

type VendorFormRow = {
  key: string
  vendorId: string
}

function emptyVendorRow(): VendorFormRow {
  return {
    key: `vendor-${Math.random().toString(36).slice(2, 9)}`,
    vendorId: '',
  }
}

function rowsFromVendorIds(ids: string[]): VendorFormRow[] {
  if (ids.length === 0) return []
  return ids.map((id, i) => ({
    key: id || `vendor-${i}`,
    vendorId: id,
  }))
}

function toVendorIdsPayload(rows: VendorFormRow[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const id = row.vendorId.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function validateTarifRows(rows: TarifFormRow[]): string | null {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.effectiveDate.trim())) {
      return 'Each tarif needs a valid effective date (YYYY-MM-DD)'
    }
    if (seen.has(row.effectiveDate.trim())) {
      return 'Duplicate effective date on tarif'
    }
    seen.add(row.effectiveDate.trim())
    const n = Number(row.amount.trim())
    if (!row.amount.trim() || !Number.isFinite(n) || n < 0) {
      return 'Tarif amount must be zero or greater'
    }
  }
  return null
}

function toTarifPayload(rows: TarifFormRow[]): ItemTarifRow[] {
  return rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    effectiveDate: row.effectiveDate.trim(),
    amount: row.amount.trim(),
  }))
}

/** Rescale factors in the form when the base radio moves to another related row. */
function switchBaseRow(rows: UomFormRow[], newBaseIndex: number): UomFormRow[] {
  const currentBase = rows.find((r) => r.isBase)
  const next = rows[newBaseIndex]
  if (!next) return rows
  if (currentBase && rows.indexOf(currentBase) === newBaseIndex) {
    return rows.map((r, i) =>
      i === newBaseIndex
        ? { ...r, isBase: true, related: true, factor: '1' }
        : r,
    )
  }

  const fBRaw =
    next.isBase || (next.related && next.factor.trim())
      ? next.isBase
        ? '1'
        : next.factor.trim()
      : ''
  const fB = Number(fBRaw)
  if (!fBRaw || !Number.isFinite(fB) || fB <= 0) {
    // New base was not related — promote without rescale; others stay as-is.
    return rows.map((r, i) => {
      if (i === newBaseIndex) {
        return { ...r, isBase: true, related: true, factor: '1' }
      }
      if (r.isBase) {
        return { ...r, isBase: false, related: true, factor: r.factor || '1' }
      }
      return { ...r, isBase: false }
    })
  }

  return rows.map((r, i) => {
    if (i === newBaseIndex) {
      return { ...r, isBase: true, related: true, factor: '1' }
    }
    if (r.isBase) {
      const newFactor = 1 / fB
      return {
        ...r,
        isBase: false,
        related: true,
        factor: trimFactor(String(newFactor)),
      }
    }
    if (!r.related || !r.factor.trim()) {
      return { ...r, isBase: false }
    }
    const fX = Number(r.factor)
    if (!Number.isFinite(fX) || fX <= 0) {
      return { ...r, isBase: false }
    }
    return {
      ...r,
      isBase: false,
      factor: trimFactor(String(fX / fB)),
    }
  })
}

function trimFactor(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  // Keep up to 8 decimal places, strip trailing zeros.
  return n
    .toFixed(8)
    .replace(/\.?0+$/, '')
}

function ItemForm({
  title,
  itemId,
  initialName,
  initialDescription,
  showItemId,
  saving,
  setSaving,
  onCancel,
  onSubmit,
}: {
  title: string
  itemId?: string
  initialName: string
  initialDescription: string
  showItemId?: string
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (
    name: string,
    description: string,
    uoms: ItemUomRow[],
    tarifs: ItemTarifRow[],
    vendorIds: string[],
  ) => Promise<void>
}) {
  const { can } = useAuth()
  const canViewVendors = can('vendor.view')
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [uomRows, setUomRows] = useState<UomFormRow[]>([emptyUomRow(true)])
  const [tarifRows, setTarifRows] = useState<TarifFormRow[]>([])
  const [uomCatalog, setUomCatalog] = useState<UomItem[]>([])
  const [vendorCatalog, setVendorCatalog] = useState<VendorListItem[]>([])
  const [vendorRows, setVendorRows] = useState<VendorFormRow[]>([])
  const [vendorsLoadFailed, setVendorsLoadFailed] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(Boolean(itemId))
  const [error, setError] = useState('')
  const asOfToday = todayYmdLocal()
  const currentTarifKey = useMemo(() => {
    const current = pickCurrentTarif(
      tarifRows.map((r) => ({
        effectiveDate: r.effectiveDate,
        amount: r.amount,
      })),
      asOfToday,
    )
    if (!current) return null
    return `${current.effectiveDate}|${current.amount}`
  }, [tarifRows, asOfToday])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<UomItem[]>('/uom')
        if (!cancelled && response.success && response.data) {
          setUomCatalog(response.data.filter((u) => u.isActive !== false))
        }
      } catch {
        /* catalog optional for display */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!canViewVendors) {
      setVendorsLoadFailed(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<VendorListItem[]>('/vendor/active')
        if (cancelled) return
        if (!response.success || !response.data) {
          setVendorsLoadFailed(true)
          return
        }
        setVendorCatalog(response.data)
        setVendorsLoadFailed(false)
      } catch {
        if (!cancelled) setVendorsLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canViewVendors])

  useEffect(() => {
    if (!itemId) {
      setLoadingDetail(false)
      return
    }
    let cancelled = false
    setLoadingDetail(true)
    void (async () => {
      try {
        const response = await apiFetch<ItemOut>(`/items/${itemId}`)
        if (cancelled) return
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to load item')
          return
        }
        setName(response.data.name)
        setDescription(response.data.description)
        setVendorRows(rowsFromVendorIds(response.data.vendorIds ?? []))
        setUomRows(rowsFromItemUoms(response.data.uoms ?? []))
        setTarifRows(rowsFromItemTarifs(response.data.tarifs ?? []))
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load item')
        }
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemId])

  const symbolById = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of uomCatalog) map.set(u.id, u.symbol)
    return map
  }, [uomCatalog])

  const baseSymbol = useMemo(() => {
    const base = uomRows.find((r) => r.isBase)
    return base?.uomId ? (symbolById.get(base.uomId) ?? '?') : '?'
  }, [uomRows, symbolById])

  function helperText(row: UomFormRow): string {
    if (row.isBase) return `Base unit (${symbolById.get(row.uomId) ?? '…'})`
    if (!row.related) return 'Not related to base'
    const sym = row.uomId ? (symbolById.get(row.uomId) ?? '…') : '…'
    const factor = row.factor.trim() || '…'
    return `1 ${sym} = ${factor} ${baseSymbol}`
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const uomError = validateUomRows(uomRows)
    if (uomError) {
      setError(uomError)
      return
    }
    const tarifError = validateTarifRows(tarifRows)
    if (tarifError) {
      setError(tarifError)
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSubmit(
        name.trim(),
        description.trim(),
        toUomPayload(uomRows),
        toTarifPayload(tarifRows),
        toVendorIdsPayload(vendorRows),
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loadingDetail) {
    return (
      <div className={cn(cardClassName, 'flex items-center gap-2 px-4 py-6')}>
        <LoaderCircle className="size-4 animate-spin" />
        <span className="text-sm">Loading item…</span>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(cardClassName, 'space-y-4 px-4 py-4')}
      noValidate
    >
      <div className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Package className="size-3.5 text-(--muted)" aria-hidden />
          {title}
        </h2>
        {showItemId ? (
          <p className="inline-flex items-center gap-1.5 font-mono text-xs text-(--muted)">
            <Hash className="size-3.5" aria-hidden />
            {showItemId}
          </p>
        ) : (
          <p className={hintClassName}>Item ID is generated on save.</p>
        )}
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Name</span>
        <input
          className={inputClassName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Description</span>
        <textarea
          className={cn(inputClassName, 'min-h-20')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="space-y-3 border-t border-(--line) pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Layers className="size-3.5 text-(--muted)" aria-hidden />
              Vendors
            </span>
            <p className={cn(hintClassName, 'text-xs')}>
              Optional. Add one or more active vendors for this item.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={buttonOutlineClassName}
            disabled={vendorsLoadFailed}
            onClick={() =>
              setVendorRows((rows) => [...rows, emptyVendorRow()])
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        {vendorsLoadFailed && !canViewVendors ? (
          <p className={hintClassName}>You need vendor.view to pick vendors.</p>
        ) : vendorsLoadFailed ? (
          <p className={hintClassName}>Could not load active vendors.</p>
        ) : vendorRows.length === 0 ? (
          <p className={cn(hintClassName, 'text-xs')}>
            No vendors linked. Add one to associate suppliers with this item.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[18rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--line) text-left text-xs text-(--muted)">
                  <th className="px-2.5 py-2 font-medium">Vendor</th>
                  <th className="w-10 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {vendorRows.map((row, index) => {
                  const taken = new Set(
                    vendorRows
                      .filter((_, i) => i !== index)
                      .map((r) => r.vendorId)
                      .filter(Boolean),
                  )
                  const options = vendorCatalog.filter(
                    (v) => v.id === row.vendorId || !taken.has(v.id),
                  )
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-(--line) last:border-b-0"
                    >
                      <td className="px-2.5 py-2 align-middle">
                        <Combobox
                          value={row.vendorId}
                          onValueChange={(value) =>
                            setVendorRows((rows) =>
                              rows.map((r, i) =>
                                i === index ? { ...r, vendorId: value } : r,
                              ),
                            )
                          }
                          options={options.map((v) => ({
                            value: v.id,
                            label: v.name,
                          }))}
                          placeholder="Select vendor"
                          searchPlaceholder="Search vendors…"
                          emptyText="No vendor found."
                          className="w-full max-w-[20rem] sm:w-full"
                          aria-label="Vendor"
                        />
                      </td>
                      <td className="px-1 py-2 align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-red-700"
                          aria-label="Remove vendor"
                          onClick={() =>
                            setVendorRows((rows) =>
                              rows.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-(--line) pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Ruler className="size-3.5 text-(--muted)" aria-hidden />
              Units of Measurement
            </span>
            <p className={cn(hintClassName, 'text-xs')}>
              One base unit required. Related units convert through the base.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={buttonOutlineClassName}
            onClick={() => setUomRows((rows) => [...rows, emptyUomRow(false)])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-(--line)">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--line) text-left text-xs text-(--muted)">
                <th className="px-2.5 py-2 font-medium">UOM</th>
                <th className="w-16 px-2 py-2 font-medium">Base</th>
                <th className="w-20 px-2 py-2 font-medium">Related</th>
                <th className="w-24 px-2 py-2 font-medium">Factor</th>
                <th className="w-10 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {uomRows.map((row, index) => {
                const taken = new Set(
                  uomRows
                    .filter((_, i) => i !== index)
                    .map((r) => r.uomId)
                    .filter(Boolean),
                )
                const options = uomCatalog.filter(
                  (u) => u.id === row.uomId || !taken.has(u.id),
                )
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      'border-b border-(--line) last:border-b-0',
                      row.isBase && 'bg-(--surface)',
                    )}
                  >
                    <td className="px-2.5 py-2 align-top">
                      <Combobox
                        value={row.uomId}
                        onValueChange={(value) =>
                          setUomRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, uomId: value } : r,
                            ),
                          )
                        }
                        options={options.map((u) => ({
                          value: u.id,
                          label: `${u.symbol} — ${u.name}`,
                        }))}
                        placeholder="Select UOM"
                        searchPlaceholder="Search UOM…"
                        emptyText="No UOM found."
                        className="w-full max-w-[14rem] sm:w-full"
                        aria-label="Unit of measure"
                      />
                      <p
                        className={cn(
                          hintClassName,
                          'mt-1 flex items-center gap-1 text-[11px]',
                        )}
                      >
                        {row.isBase ? (
                          <CircleCheck
                            className="size-3 text-emerald-600"
                            aria-hidden
                          />
                        ) : row.related ? (
                          <Link2 className="size-3" aria-hidden />
                        ) : (
                          <Unlink className="size-3" aria-hidden />
                        )}
                        {helperText(row)}
                      </p>
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="radio"
                        name="item-base-uom"
                        className="accent-emerald-600"
                        checked={row.isBase}
                        disabled={!row.isBase && !row.related}
                        title={
                          !row.isBase && !row.related
                            ? 'Turn on Related before setting as base'
                            : 'Base unit'
                        }
                        aria-label="Base unit"
                        onChange={() =>
                          setUomRows((rows) => switchBaseRow(rows, index))
                        }
                      />
                    </td>
                    <td className="px-2 py-2 align-middle">
                      {row.isBase ? (
                        <span className="text-xs text-(--muted)">—</span>
                      ) : (
                        <Checkbox
                          checked={row.related}
                          aria-label="Related to base"
                          onCheckedChange={(checked) =>
                            setUomRows((rows) =>
                              rows.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      related: checked === true,
                                      factor:
                                        checked === true ? r.factor || '' : '',
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="px-2 py-2 align-middle">
                      <input
                        className={cn(
                          inputClassName,
                          'w-20 tabular-nums',
                          (row.isBase || !row.related) && 'opacity-60',
                        )}
                        inputMode="decimal"
                        placeholder={row.related || row.isBase ? '1' : '—'}
                        disabled={row.isBase || !row.related}
                        value={
                          row.isBase ? '1' : row.related ? row.factor : ''
                        }
                        onChange={(e) =>
                          setUomRows((rows) =>
                            rows.map((r, i) =>
                              i === index
                                ? { ...r, factor: e.target.value }
                                : r,
                            ),
                          )
                        }
                        aria-label="Conversion factor"
                      />
                    </td>
                    <td className="px-1 py-2 align-middle">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-red-700"
                        disabled={uomRows.length <= 1}
                        aria-label="Remove unit"
                        onClick={() =>
                          setUomRows((rows) => {
                            const next = rows.filter((_, i) => i !== index)
                            if (next.length === 0) return [emptyUomRow(true)]
                            if (!next.some((r) => r.isBase)) {
                              next[0] = {
                                ...next[0]!,
                                isBase: true,
                                related: true,
                                factor: '1',
                              }
                            }
                            return next
                          })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 border-t border-(--line) pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Banknote className="size-3.5 text-(--muted)" aria-hidden />
              Tarif
            </span>
            <p className={cn(hintClassName, 'text-xs')}>
              Effective-dated prices. Current row is the latest date on or
              before today ({asOfToday}).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={buttonOutlineClassName}
            onClick={() =>
              setTarifRows((rows) => [emptyTarifRow(), ...rows])
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        {tarifRows.length === 0 ? (
          <p className={cn(hintClassName, 'text-xs')}>
            No tarif rows. Add one to set a price from an effective date.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[22rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--line) text-left text-xs text-(--muted)">
                  <th className="px-2.5 py-2 font-medium">Effective date</th>
                  <th className="px-2.5 py-2 font-medium">Amount</th>
                  <th className="w-20 px-2 py-2 font-medium">Status</th>
                  <th className="w-10 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...tarifRows]
                  .map((row, index) => ({ row, index }))
                  .sort((a, b) =>
                    b.row.effectiveDate.localeCompare(a.row.effectiveDate),
                  )
                  .map(({ row, index }) => {
                    const isCurrent =
                      currentTarifKey ===
                      `${row.effectiveDate}|${row.amount}`
                    return (
                      <tr
                        key={row.key}
                        className={cn(
                          'border-b border-(--line) last:border-b-0',
                          isCurrent && 'bg-(--surface)',
                        )}
                      >
                        <td className="px-2.5 py-2 align-middle">
                          <input
                            type="date"
                            className={cn(inputClassName, 'w-40')}
                            value={row.effectiveDate}
                            onChange={(e) =>
                              setTarifRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        effectiveDate: e.target.value,
                                      }
                                    : r,
                                ),
                              )
                            }
                            aria-label="Effective date"
                          />
                        </td>
                        <td className="px-2.5 py-2 align-middle">
                          <input
                            className={cn(
                              inputClassName,
                              'w-28 tabular-nums',
                            )}
                            inputMode="decimal"
                            placeholder="0"
                            value={row.amount}
                            onChange={(e) =>
                              setTarifRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? { ...r, amount: e.target.value }
                                    : r,
                                ),
                              )
                            }
                            aria-label="Tarif amount"
                          />
                        </td>
                        <td className="px-2 py-2 align-middle text-xs">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700">
                              <CircleCheck
                                className="size-3"
                                aria-hidden
                              />
                              Current
                            </span>
                          ) : row.effectiveDate > asOfToday ? (
                            <span className="text-(--muted)">Future</span>
                          ) : (
                            <span className="text-(--muted)">History</span>
                          )}
                        </td>
                        <td className="px-1 py-2 align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-red-700"
                            aria-label="Remove tarif"
                            onClick={() =>
                              setTarifRows((rows) =>
                                rows.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2 border-t border-(--line) pt-3">
        <Button type="submit" disabled={saving} className={buttonClassName}>
          {saving ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Save className="size-3.5" aria-hidden />
          )}
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonOutlineClassName}
          onClick={onCancel}
        >
          <X className="size-3.5" aria-hidden />
          Cancel
        </Button>
      </div>
    </form>
  )
}

const MOVE_ROOT = '__root__'

function MoveForm({
  title,
  folderOptions,
  excludeFolderId,
  saving,
  setSaving,
  onCancel,
  onSubmit,
}: {
  title: string
  folderOptions: Array<{ id: string; label: string }>
  excludeFolderId?: string
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (parentId: string | null) => Promise<void>
}) {
  const [parentId, setParentId] = useState(MOVE_ROOT)
  const options = folderOptions.filter((f) => f.id !== excludeFolderId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(parentId === MOVE_ROOT ? null : parentId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(cardClassName, 'w-full max-w-xl space-y-3 px-4 py-4')}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">New parent</span>
        <Combobox
          value={parentId}
          onValueChange={setParentId}
          options={[
            { value: MOVE_ROOT, label: 'Root' },
            ...options.map((opt) => ({
              value: opt.id,
              label: opt.label,
            })),
          ]}
          placeholder="Select parent…"
          searchPlaceholder="Search folders…"
          emptyText="No folder found."
          className="w-full min-w-0"
          aria-label="New parent"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className={buttonClassName}>
          {saving ? 'Moving…' : 'Move'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonOutlineClassName}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
