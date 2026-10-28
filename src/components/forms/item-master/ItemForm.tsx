import { useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import {
  Banknote,
  CircleCheck,
  Hash,
  Layers,
  Link2,
  LoaderCircle,
  Package,
  Plus,
  Ruler,
  Save,
  Tags,
  Trash2,
  Unlink,
  X,
} from 'lucide-react'
import type { UomItem } from '#/components/forms/UomForm'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import { RupiahInput, rupiahDigits } from '#/components/ui/rupiah-input'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import {
  ITEM_TYPES,
  pickCurrentTarif,
  todayYmdLocal,
  type ItemCategoryOut,
  type ItemOut,
  type ItemTarifRow,
  type ItemType,
  type ItemUomRow,
} from '#/lib/itemMaster'
import type { VendorListItem } from '#/lib/vendor'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'
import { ITEM_TYPE_OPTIONS } from './constants'

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
      // Tarif is whole rupiah; drop any stored ".00".
      amount: rupiahDigits(t.amount.split('.')[0] ?? ''),
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

type CategoryFormRow = {
  key: string
  categoryId: string
}

function emptyCategoryRow(): CategoryFormRow {
  return {
    key: `category-${Math.random().toString(36).slice(2, 9)}`,
    categoryId: '',
  }
}

function rowsFromCategoryIds(ids: string[]): CategoryFormRow[] {
  if (ids.length === 0) return []
  return ids.map((id, i) => ({
    key: id || `category-${i}`,
    categoryId: id,
  }))
}

function toCategoryIdsPayload(rows: CategoryFormRow[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const id = row.categoryId.trim()
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

export function ItemForm({
  title,
  itemId,
  initialName,
  initialDescription,
  initialItemType,
  initialCategoryIds = [],
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
  initialItemType: ItemType
  initialCategoryIds?: string[]
  showItemId?: string
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (
    name: string,
    description: string,
    itemType: ItemType,
    categoryIds: string[],
    uoms: ItemUomRow[],
    tarifs: ItemTarifRow[],
    vendorIds: string[],
  ) => Promise<void>
}) {
  const { can } = useAuth()
  const canViewVendors = can('vendor.view')
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [itemType, setItemType] = useState<ItemType>(initialItemType)
  const [categoryRows, setCategoryRows] = useState<CategoryFormRow[]>(() =>
    rowsFromCategoryIds(initialCategoryIds),
  )
  const [categoryCatalog, setCategoryCatalog] = useState<ItemCategoryOut[]>([])
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
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<ItemCategoryOut[]>('/item-categories')
        if (!cancelled && response.success && response.data) {
          setCategoryCatalog(response.data)
        }
      } catch {
        /* catalog optional */
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
        setItemType(response.data.itemType ?? 'material')
        setCategoryRows(rowsFromCategoryIds(response.data.categoryIds ?? []))
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

  const uomById = useMemo(
    () => new Map(uomCatalog.map((u) => [u.id, u])),
    [uomCatalog],
  )

  /** RAB totals are rounded in the base UOM (or in an unrelated UOM itself). */
  function roundingText(uomId: string): string {
    const uom = uomById.get(uomId)
    if (!uom) return ''
    const decimals = uom.decimals ?? 4
    const mode = uom.rounding ?? 'up'
    const how =
      mode === 'up' ? 'rounds up' : mode === 'down' ? 'rounds down' : 'rounds'
    return ` · RAB ${how} to ${decimals === 0 ? 'whole' : `${decimals} dp`}`
  }

  function helperText(row: UomFormRow): string {
    if (row.isBase) {
      return `Base unit (${symbolById.get(row.uomId) ?? '…'})${roundingText(row.uomId)}`
    }
    if (!row.related) return `Not related to base${roundingText(row.uomId)}`
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
        itemType,
        toCategoryIdsPayload(categoryRows),
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
      <div className="block space-y-1.5">
        <span className="text-sm font-medium">Type</span>
        <Combobox
          value={itemType}
          onValueChange={(value) => {
            if ((ITEM_TYPES as readonly string[]).includes(value)) {
              setItemType(value as ItemType)
            }
          }}
          options={ITEM_TYPE_OPTIONS}
          placeholder="Select type"
          searchPlaceholder="Search type…"
          emptyText="No types."
          className="w-full"
          aria-label="Item type"
        />
      </div>
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
              <Tags className="size-3.5 text-(--muted)" aria-hidden />
              Categories
            </span>
            <p className={cn(hintClassName, 'text-xs')}>
              Optional. Add one or more categories for filtering later.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={buttonOutlineClassName}
            onClick={() =>
              setCategoryRows((rows) => [...rows, emptyCategoryRow()])
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        </div>
        {categoryRows.length === 0 ? (
          <p className={cn(hintClassName, 'text-xs')}>
            No categories linked. Add one to classify this item.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[18rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-(--line) text-left text-xs text-(--muted)">
                  <th className="px-2.5 py-2 font-medium">Category</th>
                  <th className="w-10 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((row, index) => {
                  const taken = new Set(
                    categoryRows
                      .filter((_, i) => i !== index)
                      .map((r) => r.categoryId)
                      .filter(Boolean),
                  )
                  const options = categoryCatalog.filter(
                    (c) => c.id === row.categoryId || !taken.has(c.id),
                  )
                  return (
                    <tr
                      key={row.key}
                      className="border-b border-(--line) last:border-b-0"
                    >
                      <td className="px-2.5 py-2 align-middle">
                        <Combobox
                          value={row.categoryId}
                          onValueChange={(value) =>
                            setCategoryRows((rows) =>
                              rows.map((r, i) =>
                                i === index ? { ...r, categoryId: value } : r,
                              ),
                            )
                          }
                          options={options.map((c) => ({
                            value: c.id,
                            label: c.name,
                          }))}
                          placeholder="Select category"
                          searchPlaceholder="Search categories…"
                          emptyText="No category found."
                          className="w-full max-w-[20rem] sm:w-full"
                          aria-label="Category"
                        />
                      </td>
                      <td className="px-1 py-2 align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 text-red-700"
                          aria-label="Remove category"
                          onClick={() =>
                            setCategoryRows((rows) =>
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
              One base unit is required. Other units convert through it.
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
            <p className={hintClassName}>
              Prices by date. The current price is the latest on or before today
              ({asOfToday}).
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
                          <RupiahInput
                            wrapperClassName="w-40"
                            value={row.amount}
                            onValueChange={(digits) =>
                              setTarifRows((rows) =>
                                rows.map((r, i) =>
                                  i === index ? { ...r, amount: digits } : r,
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
