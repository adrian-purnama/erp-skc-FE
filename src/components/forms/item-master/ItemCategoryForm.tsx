import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle, Pencil, Tag, Trash2 } from 'lucide-react'
import ListTable, {
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
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
import { Input } from '#/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type { ItemCategoryOut } from '#/lib/itemMaster'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type FieldErrors = {
  name?: string
}

type Drawer = null | { mode: 'create' } | { mode: 'edit'; id: string }

export function ItemCategoryForm() {
  const { can } = useAuth()
  const canManage = can('itemMaster.manage')

  const [items, setItems] = useState<ItemCategoryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<ItemCategoryOut | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<ItemCategoryOut[]>('/item-categories')
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load categories')
        return
      }
      setItems(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  function closeDrawer() {
    setDrawer(null)
    setName('')
    setErrors({})
  }

  function openCreate() {
    setName('')
    setErrors({})
    setDrawer({ mode: 'create' })
  }

  function openEdit(item: ItemCategoryOut) {
    setName(item.name)
    setErrors({})
    setDrawer({ mode: 'edit', id: item.id })
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Name is required'
    return next
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !drawer) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = { name: name.trim() }
    const editingId = drawer.mode === 'edit' ? drawer.id : null
    setSaving(true)
    try {
      const response = editingId
        ? await apiFetch<ItemCategoryOut>(`/item-categories/${editingId}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await apiFetch<ItemCategoryOut>('/item-categories', {
            method: 'POST',
            body: JSON.stringify(body),
          })

      if (!response.success || !response.data) {
        const message = response.message || 'Save failed'
        if (/categor|name|exist/i.test(message)) {
          setErrors({ name: message })
        }
        toast.error(message)
        return
      }

      toast.success(editingId ? 'Category updated' : 'Category created')
      closeDrawer()
      await loadList()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || !canManage) return
    setDeleting(true)
    try {
      const response = await apiFetch<null>(
        `/item-categories/${pendingDelete.id}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Delete failed')
        return
      }
      toast.success('Category deleted')
      if (drawer?.mode === 'edit' && drawer.id === pendingDelete.id) {
        closeDrawer()
      }
      setPendingDelete(null)
      await loadList()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, debounced])

  useEffect(() => {
    setPage(1)
  }, [debounced])

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

  const columns = useMemo<ListTableColumn<ItemCategoryOut>[]>(
    () => [
      {
        header: 'Name',
        icon: Tag,
        widthClassName: 'min-w-[14rem]',
        cellClassName: 'min-w-0 font-medium',
        cell: (item) => (
          <span className="block truncate" title={item.name}>
            {item.name}
          </span>
        ),
      },
      {
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-48 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (item) =>
          canManage ? (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openEdit(item)}
              >
                <Pencil />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setPendingDelete(item)}
              >
                <Trash2 />
                Delete
              </Button>
            </div>
          ) : null,
      },
    ],
    [canManage],
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionTitleClassName}>Categories</h2>
        <p className={`mt-1 ${hintClassName}`}>
          Add or remove categories used to classify items.
        </p>
      </div>

      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {filtered.length}{' '}
              {filtered.length === 1 ? 'category' : 'categories'}
            </span>
          )
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search…',
          'aria-label': 'Search categories',
        }}
        addAction={
          canManage
            ? {
                label: 'Add',
                onClick: openCreate,
              }
            : undefined
        }
        loading={loading}
        loadingLabel="Loading categories…"
        empty={
          debounced.trim()
            ? 'No categories match the filter.'
            : 'No categories yet.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(item) => item.id}
        minWidthClassName="min-w-[420px]"
        pagination={{
          page: safePage,
          totalPages,
          totalItems: filtered.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Delete “${pendingDelete.name}”? Items using this category will be unassigned.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                'bg-red-700 text-white hover:bg-red-800',
                deleting && 'pointer-events-none opacity-60',
              )}
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={drawer !== null}
        onOpenChange={(open) => {
          if (!open) closeDrawer()
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer?.mode === 'edit' ? 'Edit category' : 'New category'}
            </SheetTitle>
            <SheetDescription>
              Categories classify items in the item master.
            </SheetDescription>
          </SheetHeader>
          {drawer ? (
            <form
              onSubmit={onSubmit}
              className="space-y-6 px-4 pb-4"
              noValidate
            >
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Name</span>
                <Input
                  className={cn(
                    inputClassName,
                    errors.name && 'border-red-500',
                  )}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Category name"
                  autoComplete="off"
                  autoFocus
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? (
                  <p className="text-xs text-red-700">{errors.name}</p>
                ) : null}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className={cn(
                    buttonClassName,
                    'inline-flex items-center gap-2',
                  )}
                >
                  {saving ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {drawer.mode === 'edit' ? 'Save' : 'Create'}
                </button>
                <button
                  type="button"
                  className={buttonOutlineClassName}
                  onClick={closeDrawer}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
