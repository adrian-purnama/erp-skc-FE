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
  Trash2,
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
import { Combobox } from '#/components/ui/combobox'
import { Input } from '#/components/ui/input'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { hintClassName } from '#/lib/ui-classes'
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
  isActive: boolean
}

type FieldErrors = {
  symbol?: string
  category?: string
  name?: string
  formulas?: string
}

const emptyForm = {
  symbol: '',
  category: '',
  name: '',
  formulas: ['v1'] as string[],
}

function formatFormulaDisplay(expr: string): string {
  return expr.replaceAll(' * ', ' × ').replaceAll('*', ' × ')
}

export default function UomForm() {
  const { can } = useAuth()
  const canManage = can('uom.manage')
  const formRef = useRef<HTMLFormElement>(null)
  const symbolRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<UomItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const editingItem = useMemo(
    () => (editingId ? items.find((item) => item.id === editingId) : null),
    [editingId, items],
  )

  const activePreviewExpr = form.formulas[previewIndex] ?? form.formulas[0] ?? ''
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

  async function loadList() {
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
  }

  useEffect(() => {
    void loadList()
  }, [])

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setPreviewIndex(0)
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (!form.symbol.trim()) next.symbol = 'Symbol is required'
    if (!form.category.trim()) next.category = 'Category is required'
    if (!form.name.trim()) next.name = 'Name is required'
    if (form.formulas.length === 0) {
      next.formulas = 'Add at least one formula'
    } else if (form.formulas.some((f) => !isValidUomFormulaShape(f))) {
      next.formulas = 'Each formula must use v1…v3 with + − × ÷ and ( )'
    }
    return next
  }

  const startEdit = useCallback((item: UomItem) => {
    setEditingId(item.id)
    setForm({
      symbol: item.symbol,
      category: item.category,
      name: item.name,
      formulas:
        item.formulas && item.formulas.length > 0 ? [...item.formulas] : ['v1'],
    })
    setErrors({})
    setPreviewIndex(0)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      symbolRef.current?.focus()
    })
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
      resetForm()
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

  const { pageItems, totalPages, page: safePage } = useMemo(
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
        cellClassName: 'font-mono text-sm',
        cell: (item) => item.symbol,
      },
      {
        header: 'Category',
        cell: (item) => item.category,
      },
      {
        header: 'Name',
        cell: (item) => item.name,
      },
      {
        header: 'Formula',
        cellClassName: 'font-mono text-xs text-(--muted)',
        cell: (item) => summarizeFormulas(item.formulas ?? ['v1']),
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
        <p className="mb-2 text-sm text-(--muted)">
          Master Data / Unit of Measure
        </p>
        <h1 className="text-2xl font-medium tracking-tight">Unit of Measure</h1>
        <p className={`mt-2 ${hintClassName}`}>
          {canManage
            ? 'Create or edit units. Symbol must be unique. Formulas define how quantity is calculated.'
            : 'View-only. You need uom.manage to edit.'}
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
              <h2 className="text-base font-medium tracking-tight">
                {editingId ? 'Edit unit' : 'New unit'}
              </h2>
              <p className={`mt-1 ${hintClassName}`}>
                {editingId && editingItem
                  ? `Editing ${editingItem.symbol}`
                  : 'Identity fields, then how quantity is built from inputs.'}
              </p>
            </div>
            {editingId ? (
              <StatusPill active={editingItem?.isActive !== false} />
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Symbol</span>
              <Input
                ref={symbolRef}
                className={cn(
                  'border-(--line)',
                  errors.symbol && 'border-red-500',
                )}
                value={form.symbol}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, symbol: e.target.value }))
                }
                placeholder="e.g. kg"
                autoComplete="off"
              />
              {errors.symbol ? (
                <span className="text-xs text-red-600">{errors.symbol}</span>
              ) : null}
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Category</span>
              <Input
                className={cn(
                  'border-(--line)',
                  errors.category && 'border-red-500',
                )}
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
                className={cn(
                  'border-(--line)',
                  errors.name && 'border-red-500',
                )}
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
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Quantity formulas</h3>
                <p className={`mt-1 ${hintClassName}`}>
                  How qty is built from inputs. Area often needs both direct and
                  L×W.
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
                        'min-w-48 flex-1 border-(--line) font-mono text-sm',
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
                        <span className="block text-xs text-(--muted)">
                          {key}
                        </span>
                        <Input
                          type="number"
                          step="any"
                          className="w-24 border-(--line) font-mono text-sm"
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
              ) : editingId ? null : (
                <Plus className="size-4" aria-hidden />
              )}
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Add unit'}
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
          <>
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter symbols…"
              aria-label="Filter units"
            />
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
              className="w-full sm:w-[180px]"
              aria-label="Category filter"
            />
          </>
        }
        loading={loading}
        loadingLabel="Loading units…"
        empty="No units match the current filters."
        columns={uomColumns}
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
    </div>
  )
}
