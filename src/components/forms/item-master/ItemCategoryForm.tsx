import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import toast from 'react-hot-toast'
import {
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import ListTable, {
  ListSearchInput,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type { ItemCategoryOut } from '#/lib/itemMaster'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type FieldErrors = {
  name?: string
}

export function ItemCategoryForm() {
  const { can } = useAuth()
  const canManage = can('itemMaster.manage')
  const formRef = useRef<HTMLFormElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<ItemCategoryOut[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [pendingDelete, setPendingDelete] = useState<ItemCategoryOut | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)

  async function loadList() {
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
  }

  useEffect(() => {
    void loadList()
  }, [])

  function resetForm() {
    setEditingId(null)
    setName('')
    setErrors({})
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'Name is required'
    return next
  }

  const startEdit = useCallback((item: ItemCategoryOut) => {
    setEditingId(item.id)
    setName(item.name)
    setErrors({})
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      nameRef.current?.focus()
    })
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = { name: name.trim() }
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
      resetForm()
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
      if (editingId === pendingDelete.id) resetForm()
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
        cellClassName: 'min-w-0 font-medium',
        cell: (item) => (
          <span className="block truncate" title={item.name}>
            {item.name}
          </span>
        ),
      },
      {
        header: '',
        cellClassName: 'w-[1%] whitespace-nowrap text-right',
        cell: (item) =>
          canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="size-8 shrink-0 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => startEdit(item)}>
                  <Pencil className="size-4" aria-hidden />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-700 focus:text-red-700"
                  onClick={() => setPendingDelete(item)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [canManage, startEdit],
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className={sectionTitleClassName}>Categories</h2>
        <p className={`mt-1 ${hintClassName}`}>
          Add or remove categories used to classify items.
        </p>
      </div>

      {canManage ? (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="flex flex-wrap items-end gap-3"
          noValidate
        >
          <label className="min-w-[12rem] flex-1 space-y-1.5">
            <span className="text-sm font-medium">
              {editingId ? 'Rename category' : 'New category'}
            </span>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-xs text-red-700">{errors.name}</p>
            ) : null}
          </label>
          <div className="flex gap-2">
            {editingId ? (
              <Button
                type="button"
                variant="outline"
                className={buttonOutlineClassName}
                disabled={saving}
                onClick={resetForm}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              className={buttonClassName}
              disabled={saving}
            >
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : editingId ? null : (
                <Plus className="size-4" aria-hidden />
              )}
              {editingId ? 'Save' : 'Add'}
            </Button>
          </div>
        </form>
      ) : null}

      <ListTable
        filters={
          <ListSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter categories…"
            aria-label="Filter categories"
            className="min-w-0 max-w-none flex-1"
          />
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
        minWidthClassName="min-w-[320px]"
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
    </div>
  )
}
