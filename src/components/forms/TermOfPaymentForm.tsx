import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import toast from 'react-hot-toast'
import {
  Ban,
  CalendarRange,
  CircleCheck,
  LoaderCircle,
  Pencil,
  ToggleRight,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
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
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type TermOfPaymentItem = {
  id: string
  termOfPayment: string
  isActive: boolean
}

type FieldErrors = {
  termOfPayment?: string
}

type Drawer = null | { mode: 'create' } | { mode: 'edit'; id: string }

export default function TermOfPaymentForm() {
  const { can } = useAuth()
  const canManage = can('termOfPayment.manage')

  const [items, setItems] = useState<TermOfPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [termOfPayment, setTermOfPayment] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [pendingDisable, setPendingDisable] =
    useState<TermOfPaymentItem | null>(null)
  const [toggling, setToggling] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<TermOfPaymentItem[]>('/term-of-payment')
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load terms of payment')
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

  function openCreate() {
    setTermOfPayment('')
    setErrors({})
    setDrawer({ mode: 'create' })
  }

  function openEdit(item: TermOfPaymentItem) {
    setTermOfPayment(item.termOfPayment)
    setErrors({})
    setDrawer({ mode: 'edit', id: item.id })
  }

  function closeDrawer() {
    setDrawer(null)
    setTermOfPayment('')
    setErrors({})
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!termOfPayment.trim()) {
      next.termOfPayment = 'Term of payment is required'
    }
    return next
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !drawer) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = { termOfPayment: termOfPayment.trim() }
    const editingId = drawer.mode === 'edit' ? drawer.id : null

    setSaving(true)
    try {
      const response = editingId
        ? await apiFetch<TermOfPaymentItem>(`/term-of-payment/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiFetch<TermOfPaymentItem>('/term-of-payment', {
            method: 'POST',
            body: JSON.stringify(body),
          })

      if (!response.success || !response.data) {
        const message = response.message || 'Save failed'
        if (/term/i.test(message)) {
          setErrors({ termOfPayment: message })
        }
        toast.error(message)
        return
      }

      toast.success(editingId ? 'Term updated' : 'Term created')
      closeDrawer()
      await loadList()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const setActive = useCallback(
    async (item: TermOfPaymentItem, next: boolean) => {
      setToggling(true)
      try {
        const response = await apiFetch<TermOfPaymentItem>(
          `/term-of-payment/${item.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({ isActive: next }),
          },
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to update term')
          return
        }
        setItems((rows) =>
          rows.map((row) =>
            row.id === item.id
              ? { ...row, isActive: response.data!.isActive }
              : row,
          ),
        )
        toast.success(next ? 'Term enabled' : 'Term disabled')
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        setToggling(false)
        setPendingDisable(null)
      }
    },
    [],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.termOfPayment.toLowerCase().includes(q))
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

  const columns = useMemo<ListTableColumn<TermOfPaymentItem>[]>(
    () => [
      {
        header: 'Term of payment',
        icon: CalendarRange,
        widthClassName: 'min-w-[14rem]',
        cell: (item) => item.termOfPayment,
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
        widthClassName: 'w-56 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (item) => (
          <div className="flex items-center justify-end gap-1.5">
            {canManage ? (
              <>
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
                  disabled={toggling}
                  className={
                    item.isActive
                      ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'
                      : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                  }
                  onClick={() => {
                    if (item.isActive) {
                      setPendingDisable(item)
                      return
                    }
                    void setActive(item, true)
                  }}
                >
                  {item.isActive ? <Ban /> : <CircleCheck />}
                  {item.isActive ? 'Disable' : 'Enable'}
                </Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canManage, setActive, toggling],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Terms of Payment</h1>
        <p className={`mt-2 ${hintClassName}`}>
          {canManage
            ? 'Create or edit payment terms. Name must be unique.'
            : 'View-only. Ask an admin if you need to edit.'}
        </p>
      </div>

      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {filtered.length} {filtered.length === 1 ? 'term' : 'terms'}
            </span>
          )
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search…',
          'aria-label': 'Search terms of payment',
        }}
        addAction={
          canManage
            ? {
                label: 'Add',
                onClick: openCreate,
              }
            : undefined
        }
        isRowMuted={(item) => !item.isActive}
        loading={loading}
        loadingLabel="Loading terms…"
        empty={
          debounced.trim()
            ? 'No terms match the current filter.'
            : 'No terms yet.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(item) => item.id}
        pagination={{
          page: safePage,
          totalPages,
          totalItems: filtered.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      <ConfirmDisableDialog
        open={pendingDisable !== null}
        title="Disable term?"
        description={
          pendingDisable
            ? `“${pendingDisable.termOfPayment}” will be disabled and can be enabled again later.`
            : 'This term will be disabled and can be enabled again later.'
        }
        busy={toggling}
        onOpenChange={(open) => {
          if (!open) setPendingDisable(null)
        }}
        onConfirm={() => {
          if (pendingDisable) void setActive(pendingDisable, false)
        }}
      />

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
              {drawer?.mode === 'edit' ? 'Edit term' : 'New term'}
            </SheetTitle>
            <SheetDescription>
              {drawer?.mode === 'edit'
                ? 'Update this payment term without leaving the list.'
                : 'e.g. Net 30, COD, 50% DP'}
            </SheetDescription>
          </SheetHeader>
          {drawer ? (
            <form
              onSubmit={onSubmit}
              className="space-y-6 px-4 pb-4"
              noValidate
            >
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Term of payment</span>
                <Input
                  className={cn(
                    inputClassName,
                    errors.termOfPayment && 'border-red-500',
                  )}
                  value={termOfPayment}
                  onChange={(e) => setTermOfPayment(e.target.value)}
                  placeholder="e.g. Net 30"
                  autoComplete="off"
                  autoFocus
                />
                {errors.termOfPayment ? (
                  <span className="text-xs text-red-600">
                    {errors.termOfPayment}
                  </span>
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
