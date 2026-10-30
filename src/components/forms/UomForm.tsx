import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import toast from 'react-hot-toast'
import {
  ArrowDownUp,
  Ban,
  CircleCheck,
  ListFilter,
  LoaderCircle,
  Pencil,
  Plus,
  Ruler,
  Sigma,
  Tag,
  ToggleRight,
  Trash2,
  Type,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
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
  hintClassName,
  inputClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import {
  FORMULA_PRESETS,
  formulaVariableCount,
  isValidUomFormulaShape,
  previewUomFormula,
  summarizeFormulas,
  type UomVar,
} from '#/lib/uomFormula'
import { cn } from '#/lib/utils'

export type UomItem = {
  id: string
  symbol: string
  category: string
  name: string
  formulas: string[]
  decimals: number
  isActive: boolean
}

type FieldErrors = {
  symbol?: string
  category?: string
  name?: string
  formulas?: string
  decimals?: string
}

const emptyForm = {
  symbol: '',
  category: '',
  name: '',
  formulas: ['v1'] as string[],
  decimals: '4',
}

type Drawer = null | { mode: 'create' } | { mode: 'edit'; id: string }

function formatFormulaDisplay(expr: string): string {
  return expr.replaceAll(' * ', ' × ').replaceAll('*', ' × ')
}

export default function UomForm() {
  const { can } = useAuth()
  const canManage = can('uom.manage')

  const [items, setItems] = useState<UomItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pendingDisable, setPendingDisable] = useState<UomItem | null>(null)
  const [toggling, setToggling] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewValues, setPreviewValues] = useState<
    Partial<Record<UomVar, string>>
  >({ v1: '2', v2: '3', v3: '4' })

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      const c = item.category.trim()
      if (c) set.add(c)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [items])

  const editingId = drawer?.mode === 'edit' ? drawer.id : null

  const activePreviewExpr =
    form.formulas[previewIndex] ?? form.formulas[0] ?? ''
  const previewVarCount = formulaVariableCount(activePreviewExpr)
  const previewResult = useMemo(() => {
    if (!isValidUomFormulaShape(activePreviewExpr)) return null
    const nums: Partial<Record<UomVar, number>> = {}
    for (let n = 1; n <= previewVarCount; n += 1) {
      const key = `v${n}` as UomVar
      const raw = previewValues[key]
      if (raw === undefined || raw.trim() === '') return null
      const num = Number(raw)
      if (Number.isNaN(num)) return null
      nums[key] = num
    }
    return previewUomFormula(activePreviewExpr, nums)
  }, [activePreviewExpr, previewVarCount, previewValues])

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<UomItem[]>('/uom')
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load units')
        return
      }
      setItems(
        response.data.map((row) => ({
          ...row,
          formulas:
            row.formulas && row.formulas.length > 0 ? row.formulas : ['v1'],
        })),
      )
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
    setForm(emptyForm)
    setErrors({})
    setPreviewIndex(0)
  }

  function openCreate() {
    setForm(emptyForm)
    setErrors({})
    setPreviewIndex(0)
    setDrawer({ mode: 'create' })
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!form.symbol.trim()) next.symbol = 'Symbol is required'
    if (!form.category.trim()) next.category = 'Category is required'
    if (!form.name.trim()) next.name = 'Name is required'
    const decimals = Number(form.decimals)
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
      next.decimals = 'Whole number from 0 to 8'
    }
    if (form.formulas.length === 0) {
      next.formulas = 'Add at least one formula'
    } else if (form.formulas.some((f) => !isValidUomFormulaShape(f))) {
      next.formulas = 'Each formula must use v1…v3 with + − × ÷ and ( )'
    }
    return next
  }

  const startEdit = useCallback((item: UomItem) => {
    setForm({
      symbol: item.symbol,
      category: item.category,
      name: item.name,
      formulas:
        item.formulas && item.formulas.length > 0 ? [...item.formulas] : ['v1'],
      decimals: String(item.decimals ?? 4),
    })
    setErrors({})
    setPreviewIndex(0)
    setDrawer({ mode: 'edit', id: item.id })
  }, [])

  function setFormulaAt(index: number, value: string) {
    setForm((prev) => {
      const formulas = [...prev.formulas]
      formulas[index] = value
      return { ...prev, formulas }
    })
    setPreviewIndex(index)
  }

  function addFormula(expression = 'v1') {
    setForm((prev) => {
      if (prev.formulas.some((f) => f.trim() === expression)) return prev
      return { ...prev, formulas: [...prev.formulas, expression] }
    })
    setPreviewIndex(form.formulas.length)
  }

  function removeFormula(index: number) {
    setForm((prev) => {
      if (prev.formulas.length <= 1) return prev
      const formulas = prev.formulas.filter((_, i) => i !== index)
      return { ...prev, formulas }
    })
    setPreviewIndex((i) => Math.max(0, Math.min(i, form.formulas.length - 2)))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const body = {
      symbol: form.symbol.trim(),
      category: form.category.trim(),
      name: form.name.trim(),
      formulas: form.formulas.map((f) => f.trim()),
      decimals: Number(form.decimals),
    }

    setSaving(true)
    try {
      const response = editingId
        ? await apiFetch<UomItem>(`/uom/${editingId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : await apiFetch<UomItem>('/uom', {
            method: 'POST',
            body: JSON.stringify(body),
          })

      if (!response.success || !response.data) {
        const message = response.message || 'Save failed'
        if (/symbol/i.test(message)) {
          setErrors({ symbol: message })
        } else if (/formula/i.test(message)) {
          setErrors({ formulas: message })
        }
        toast.error(message)
        return
      }

      toast.success(editingId ? 'Unit updated' : 'Unit created')
      closeDrawer()
      await loadList()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const setActive = useCallback(async (item: UomItem, next: boolean) => {
    setToggling(true)
    try {
      const response = await apiFetch<UomItem>(`/uom/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: next }),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update unit')
        return
      }
      setItems((rows) =>
        rows.map((row) =>
          row.id === item.id
            ? { ...row, isActive: response.data!.isActive }
            : row,
        ),
      )
      toast.success(next ? 'Unit enabled' : 'Unit disabled')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setToggling(false)
      setPendingDisable(null)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) {
        return false
      }
      if (!q) return true
      return (
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        summarizeFormulas(item.formulas).toLowerCase().includes(q)
      )
    })
  }, [items, debounced, categoryFilter])

  useEffect(() => {
    setPage(1)
  }, [debounced, categoryFilter])

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

  const uomColumns = useMemo<ListTableColumn<UomItem>[]>(
    () => [
      {
        header: 'Symbol',
        icon: Ruler,
        widthClassName: 'w-28',
        cellClassName: 'font-mono text-sm',
        cell: (item) => item.symbol,
      },
      {
        header: 'Category',
        icon: Tag,
        widthClassName: 'w-32',
        cell: (item) => item.category,
      },
      {
        header: 'Name',
        icon: Type,
        widthClassName: 'min-w-[14rem]',
        cell: (item) => item.name,
      },
      {
        header: 'Formula',
        icon: Sigma,
        widthClassName: 'min-w-[10rem] max-w-[16rem]',
        cellClassName: 'truncate font-mono text-xs text-(--muted)',
        cell: (item) => summarizeFormulas(item.formulas ?? ['v1']),
      },
      {
        header: 'Decimals',
        icon: ArrowDownUp,
        align: 'right',
        widthClassName: 'w-28',
        cellClassName: 'text-xs text-(--muted)',
        cell: (item) =>
          (item.decimals ?? 4) === 0 ? 'Whole' : `${item.decimals ?? 4} dp`,
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
                  onClick={() => startEdit(item)}
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
    [canManage, setActive, startEdit, toggling],
  )

  const editorForm = (
    <form onSubmit={onSubmit} className="space-y-5 px-4 pb-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Symbol</span>
          <Input
            className={cn(inputClassName, errors.symbol && 'border-red-500')}
            value={form.symbol}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, symbol: e.target.value }))
            }
            placeholder="e.g. kg"
            autoComplete="off"
            autoFocus
          />
          {errors.symbol ? (
            <span className="text-xs text-red-600">{errors.symbol}</span>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Category</span>
          <Input
            className={cn(inputClassName, errors.category && 'border-red-500')}
            list="uom-category-options"
            value={form.category}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, category: e.target.value }))
            }
            placeholder="Select or type new…"
            autoComplete="off"
          />
          <datalist id="uom-category-options">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          {errors.category ? (
            <span className="text-xs text-red-600">{errors.category}</span>
          ) : (
            <span className={hintClassName}>
              Existing category or type a new one
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Name</span>
          <Input
            className={cn(inputClassName, errors.name && 'border-red-500')}
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g. Kilogram"
            autoComplete="off"
          />
          {errors.name ? (
            <span className="text-xs text-red-600">{errors.name}</span>
          ) : null}
        </label>
      </div>

      <div className="space-y-3 border-t border-(--line) pt-4">
        <div>
          <h3 className="text-sm font-medium">Purchase decimals</h3>
          <p className={`mt-1 ${hintClassName}`}>
            RAB rounds to this unless the item sets its own decimals.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Decimals</span>
            <Input
              type="number"
              min={0}
              max={8}
              step={1}
              className={cn(
                inputClassName,
                errors.decimals && 'border-red-500',
              )}
              value={form.decimals}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, decimals: e.target.value }))
              }
            />
            {errors.decimals ? (
              <span className="text-xs text-red-600">{errors.decimals}</span>
            ) : (
              <span className={hintClassName}>0 = whole units</span>
            )}
          </label>
        </div>
      </div>

      <div className="space-y-3 border-t border-(--line) pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Quantity formulas</h3>
            <p className={`mt-1 ${hintClassName}`}>
              How quantity is built from inputs.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FORMULA_PRESETS.map((preset) => {
              const exists = form.formulas.some(
                (f) => f.trim() === preset.expression,
              )
              return (
                <Button
                  key={preset.expression}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exists}
                  className="h-7 px-2 text-xs"
                  onClick={() => addFormula(preset.expression)}
                >
                  {preset.label}
                  <span className="ml-1 font-mono text-(--muted)">
                    {formatFormulaDisplay(preset.expression)}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>

        <ul className="space-y-2">
          {form.formulas.map((expr, index) => {
            const count = formulaVariableCount(expr)
            const valid = !expr.trim() || isValidUomFormulaShape(expr)
            const selected = index === previewIndex
            return (
              <li
                key={index}
                className={cn(
                  'flex flex-wrap items-center gap-2 rounded-md border px-3 py-2',
                  selected
                    ? 'border-(--ink)/25 bg-(--surface)'
                    : 'border-(--line) bg-white',
                  !valid && 'border-red-400',
                )}
              >
                <button
                  type="button"
                  className="font-mono text-xs text-(--muted) tabular-nums"
                  onClick={() => setPreviewIndex(index)}
                  aria-label={`Preview formula ${index + 1}`}
                >
                  #{index + 1}
                </button>
                <Input
                  className={cn(
                    inputClassName,
                    'min-w-48 flex-1 font-mono text-sm',
                    !valid && 'border-red-500',
                  )}
                  value={expr}
                  onChange={(e) => setFormulaAt(index, e.target.value)}
                  onFocus={() => setPreviewIndex(index)}
                  placeholder="e.g. v1 * v2"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs',
                    count > 0
                      ? 'bg-(--surface) text-(--muted)'
                      : 'bg-red-50 text-red-600',
                  )}
                >
                  {count > 0
                    ? `${count} input${count === 1 ? '' : 's'}`
                    : 'invalid'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-(--muted)"
                  disabled={form.formulas.length <= 1}
                  onClick={() => removeFormula(index)}
                  aria-label={`Remove formula ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addFormula('v1')}
          >
            <Plus className="size-4" aria-hidden />
            Add formula
          </Button>
        </div>

        {errors.formulas ? (
          <span className="text-xs text-red-600">{errors.formulas}</span>
        ) : null}

        {previewVarCount > 0 && isValidUomFormulaShape(activePreviewExpr) ? (
          <div className="rounded-md border border-dashed border-(--line) bg-(--surface)/60 px-3 py-3">
            <p className="text-xs font-medium text-(--muted)">
              Preview{' '}
              <span className="font-mono text-(--ink)">
                {formatFormulaDisplay(activePreviewExpr)}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              {Array.from({ length: previewVarCount }, (_, i) => {
                const key = `v${i + 1}` as UomVar
                return (
                  <label key={key} className="space-y-1">
                    <span className="block text-xs text-(--muted)">{key}</span>
                    <Input
                      type="number"
                      step="any"
                      className={cn(inputClassName, 'w-24 font-mono text-sm')}
                      value={previewValues[key] ?? ''}
                      onChange={(e) =>
                        setPreviewValues((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                )
              })}
              <div className="pb-1.5 text-sm">
                <span className="text-(--muted)">= </span>
                <span className="font-mono font-medium tabular-nums">
                  {previewResult === null ? '—' : previewResult}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : null}
          {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
        </Button>
        <Button type="button" variant="outline" onClick={closeDrawer}>
          Cancel
        </Button>
      </div>
    </form>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Unit of Measure</h1>
        <p className={`mt-2 ${hintClassName}`}>
          {canManage
            ? 'Units and how quantity is calculated. Symbol must be unique.'
            : 'View-only. You need uom.manage to edit.'}
        </p>
      </div>

      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {filtered.length} {filtered.length === 1 ? 'unit' : 'units'}
            </span>
          )
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search…',
          'aria-label': 'Search units',
        }}
        toolbarActions={[
          {
            key: 'category',
            label: 'Category',
            icon: ListFilter,
            active: categoryFilter !== 'all',
            popover: (
              <>
                <p className="text-xs font-medium text-(--muted)">Category</p>
                <Combobox
                  value={categoryFilter}
                  onValueChange={setCategoryFilter}
                  options={[
                    { value: 'all', label: 'All categories' },
                    ...categories.map((category) => ({
                      value: category,
                      label: category,
                    })),
                  ]}
                  placeholder="All categories"
                  searchPlaceholder="Search category…"
                  emptyText="No category found."
                  className="w-full"
                  aria-label="Category filter"
                />
              </>
            ),
          },
        ]}
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
        loadingLabel="Loading units…"
        empty={
          debounced.trim() || categoryFilter !== 'all'
            ? 'No units match the current filters.'
            : 'No units yet.'
        }
        columns={uomColumns}
        rows={pageItems}
        rowKey={(item) => item.id}
        minWidthClassName="min-w-[720px]"
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
        title="Disable unit?"
        description={
          pendingDisable
            ? `“${pendingDisable.symbol}” will be disabled and can be enabled again later.`
            : 'This unit will be disabled and can be enabled again later.'
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
          className="w-full overflow-y-auto sm:max-w-3xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer?.mode === 'edit' ? 'Edit unit' : 'New unit'}
            </SheetTitle>
            <SheetDescription>
              Identity fields, then how quantity is built from inputs.
            </SheetDescription>
          </SheetHeader>
          {drawer && canManage ? editorForm : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
