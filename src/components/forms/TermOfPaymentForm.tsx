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
  Ban,
  CircleCheck,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
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
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  hintClassName,
  pageTitleClassName,
  sectionTitleClassName,
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

export default function TermOfPaymentForm() {
  const { can } = useAuth()
  const canManage = can('termOfPayment.manage')
  const formRef = useRef<HTMLFormElement>(null)
  const termRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<TermOfPaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [termOfPayment, setTermOfPayment] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [pendingDisable, setPendingDisable] =
    useState<TermOfPaymentItem | null>(null)
  const [toggling, setToggling] = useState(false)

  const editingItem = useMemo(
    () => (editingId ? items.find((item) => item.id === editingId) : null),
    [editingId, items],
  )

  async function loadList() {
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
  }

  useEffect(() => {
    void loadList()
  }, [])

  function resetForm() {
    setEditingId(null)
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

  const startEdit = useCallback((item: TermOfPaymentItem) => {
    setEditingId(item.id)
    setTermOfPayment(item.termOfPayment)
    setErrors({})
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      termRef.current?.focus()
    })
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = { termOfPayment: termOfPayment.trim() }

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
      resetForm()
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
    return items.filter((item) =>
      item.termOfPayment.toLowerCase().includes(q),
    )
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

  const columns = useMemo<ListTableColumn<TermOfPaymentItem>[]>(
    () => [
      {
        header: 'Term of payment',
        cell: (item) => item.termOfPayment,
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
              {canManage ? (
                <>
                  <DropdownMenuItem onClick={() => startEdit(item)}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (item.isActive) {
                        setPendingDisable(item)
                        return
                      }
                      void setActive(item, true)
                    }}
                  >
                    {item.isActive ? (
                      <Ban className="size-4" aria-hidden />
                    ) : (
                      <CircleCheck className="size-4" aria-hidden />
                    )}
                    {item.isActive ? 'Disable' : 'Enable'}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled>View only</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canManage, setActive, startEdit],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>
          Terms of Payment
        </h1>
        <p className={`mt-2 ${hintClassName}`}>
          {canManage
            ? 'Create or edit payment terms. Name must be unique.'
            : 'View-only. Ask an admin if you need to edit.'}
        </p>
      </div>

      {canManage ? (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="space-y-5 rounded-md border border-(--line) bg-white px-4 py-5"
          noValidate
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className={sectionTitleClassName}>
                {editingId ? 'Edit term' : 'New term'}
              </h2>
              <p className={`mt-1 ${hintClassName}`}>
                {editingId && editingItem
                  ? `Editing ${editingItem.termOfPayment}`
                  : 'e.g. Net 30, COD, 50% DP'}
              </p>
            </div>
            {editingId ? (
              <StatusPill active={editingItem?.isActive !== false} />
            ) : null}
          </div>

          <label className="block max-w-md space-y-1.5">
            <span className="text-sm font-medium">Term of payment</span>
            <Input
              ref={termRef}
              className={cn(
                'border-(--line)',
                errors.termOfPayment && 'border-red-500',
              )}
              value={termOfPayment}
              onChange={(e) => setTermOfPayment(e.target.value)}
              placeholder="e.g. Net 30"
              autoComplete="off"
            />
            {errors.termOfPayment ? (
              <span className="text-xs text-red-600">
                {errors.termOfPayment}
              </span>
            ) : null}
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : editingId ? null : (
                <Plus className="size-4" aria-hidden />
              )}
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Add term'}
            </Button>
            {editingId ? (
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      <ListTable
        filters={
          <ListSearchInput
            value={query}
            onChange={setQuery}
            placeholder="Filter terms…"
            aria-label="Filter terms of payment"
          />
        }
        loading={loading}
        loadingLabel="Loading terms…"
        empty="No terms match the current filter."
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
    </div>
  )
}
