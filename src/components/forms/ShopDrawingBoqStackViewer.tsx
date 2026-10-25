import * as React from 'react'
import { ListSearchInput } from '#/components/forms/shared/ListTable'
import { Combobox } from '#/components/ui/combobox'
import type {
  ProjectShopDrawingBoq,
  ProjectShopDrawingBoqItemSummary,
  ProjectShopDrawingBoqLine,
  ProjectShopDrawingBoqMaterial,
  ProjectShopDrawingBoqMountingType,
} from '#/lib/project'
import type { ItemCategoryOut } from '#/lib/itemMaster'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type CategoryFilter = 'all' | string

type Props = {
  summary: ProjectShopDrawingBoqItemSummary[]
  overview: ProjectShopDrawingBoq[]
  materials?: ProjectShopDrawingBoqMaterial[]
  categories?: ItemCategoryOut[]
  className?: string
}

type SheetCell = {
  text: string
  materialItemId: string
}

type SheetRow = {
  key: string
  shopDrawing: string
  version: string
  bases: SheetCell[]
  finishings: SheetCell[]
  assembly: SheetCell[]
  lighting: SheetCell[]
  mounting: SheetCell[]
  other: SheetCell[]
  emptyMessage?: string
}

const MOUNTING_LABEL: Record<ProjectShopDrawingBoqMountingType, string> = {
  mounted: 'Mounted',
  hanging: 'Hanging',
  pylon: 'Pylon',
  blade: 'Blade',
  freestanding: 'Freestanding',
  other: 'Other',
}

function lineMaterial(line: ProjectShopDrawingBoqLine): string {
  const name = line.materialName?.trim()
  const code = line.materialCode?.trim()
  if (name && code) return `${code} — ${name}`
  return name || code || '—'
}

function formatTotal(line: ProjectShopDrawingBoqLine): string {
  const total = line.totalQty?.trim() || line.qtyPerUnit?.trim() || ''
  const uom = line.uomSymbol?.trim() || ''
  return [total, uom].filter(Boolean).join(' ')
}

function formatLine(line: ProjectShopDrawingBoqLine): string {
  const material = lineMaterial(line)
  const total = formatTotal(line)
  return total ? `${material} · ${total}` : material
}

function toCells(lines: ProjectShopDrawingBoqLine[]): SheetCell[] {
  return lines.map((line) => ({
    text: formatLine(line),
    materialItemId: line.materialItemId,
  }))
}

function formatFinishings(
  finishings: Array<{
    finishingOrder: number
    placement: 'top' | 'bottom'
    lines: ProjectShopDrawingBoqLine[]
  }>,
  placement: 'top' | 'bottom',
  coreIndex: number,
  startLayer: number,
): { cells: SheetCell[]; nextLayer: number } {
  const list =
    placement === 'top'
      ? [...finishings]
          .filter((f) => f.placement === 'top')
          .sort((a, b) => b.finishingOrder - a.finishingOrder)
      : [...finishings]
          .filter((f) => f.placement === 'bottom')
          .sort((a, b) => a.finishingOrder - b.finishingOrder)

  const parts: SheetCell[] = []
  let layer = startLayer
  for (const finishing of list) {
    layer += 1
    const num = `${coreIndex}.${layer}`
    for (const line of finishing.lines) {
      parts.push({
        text: `${num} ${formatLine(line)}`,
        materialItemId: line.materialItemId,
      })
    }
  }
  return { cells: parts, nextLayer: layer }
}

function emptyRow(
  key: string,
  shopDrawing: string,
  version: string,
  message: string,
): SheetRow {
  return {
    key,
    shopDrawing,
    version,
    bases: [],
    finishings: [],
    assembly: [],
    lighting: [],
    mounting: [],
    other: [],
    emptyMessage: message,
  }
}

function buildRows(
  summary: ProjectShopDrawingBoqItemSummary[],
  overview: ProjectShopDrawingBoq[],
): SheetRow[] {
  const boqByItem = new Map(
    overview.map((b) => [b.shopDrawingItemId, b] as const),
  )
  const rows: SheetRow[] = []

  for (const item of summary) {
    const current = item.versions.find((v) => v.isCurrent)
    const boq = boqByItem.get(item.itemId)

    if (!boq) {
      if (current) {
        rows.push(
          emptyRow(
            `empty-${item.itemId}`,
            item.name,
            `v${current.version}`,
            'No BOQ on current version.',
          ),
        )
      } else {
        rows.push(
          emptyRow(
            `empty-${item.itemId}`,
            item.name,
            '—',
            'No current file version.',
          ),
        )
      }
      continue
    }

    const assembly = toCells(boq.main.assembly.lines)
    const lighting = toCells(boq.lighting.lines)
    const mountingMaterials = toCells(boq.mounting.lines)
    const mountingLabel = MOUNTING_LABEL[boq.mounting.type] ?? boq.mounting.type
    const mounting =
      mountingMaterials.length > 0 || boq.mounting.type
        ? [
            ...(mountingLabel
              ? [{ text: mountingLabel, materialItemId: '' }]
              : []),
            ...mountingMaterials,
          ]
        : []
    const other = toCells(boq.other.lines)

    const bases = boq.main.parts.flatMap((part) => part.bases)
    const baseLines: SheetCell[] = []
    const finishingLines: SheetCell[] = []

    bases.forEach((base, index) => {
      const coreIndex = index + 1
      baseLines.push({
        text: `${coreIndex} ${formatLine(base)}`,
        materialItemId: base.materialItemId,
      })
      const above = formatFinishings(base.finishings, 'top', coreIndex, 0)
      const below = formatFinishings(
        base.finishings,
        'bottom',
        coreIndex,
        above.nextLayer,
      )
      finishingLines.push(...above.cells, ...below.cells)
    })

    rows.push({
      key: `item-${item.itemId}`,
      shopDrawing: item.name,
      version: `v${boq.fileVersion}`,
      bases: baseLines,
      finishings: finishingLines,
      assembly,
      lighting,
      mounting,
      other,
      emptyMessage:
        baseLines.length === 0 &&
        assembly.length === 0 &&
        lighting.length === 0 &&
        mountingMaterials.length === 0 &&
        other.length === 0
          ? 'BOQ is empty.'
          : undefined,
    })
  }

  return rows
}

function materialMatchesCategory(
  materialItemId: string,
  categoryFilter: CategoryFilter,
  categoryIdsByMaterialId: Map<string, string[]>,
): boolean {
  if (categoryFilter === 'all') return true
  if (!materialItemId) return false
  const ids = categoryIdsByMaterialId.get(materialItemId) ?? []
  return ids.includes(categoryFilter)
}

function filterCells(
  cells: SheetCell[],
  categoryFilter: CategoryFilter,
  categoryIdsByMaterialId: Map<string, string[]>,
): SheetCell[] {
  if (categoryFilter === 'all') return cells
  return cells.filter((cell) =>
    materialMatchesCategory(
      cell.materialItemId,
      categoryFilter,
      categoryIdsByMaterialId,
    ),
  )
}

function filterRow(
  row: SheetRow,
  categoryFilter: CategoryFilter,
  categoryIdsByMaterialId: Map<string, string[]>,
): SheetRow {
  if (categoryFilter === 'all' || row.emptyMessage) return row
  const bases = filterCells(row.bases, categoryFilter, categoryIdsByMaterialId)
  const finishings = filterCells(
    row.finishings,
    categoryFilter,
    categoryIdsByMaterialId,
  )
  const assembly = filterCells(
    row.assembly,
    categoryFilter,
    categoryIdsByMaterialId,
  )
  const lighting = filterCells(
    row.lighting,
    categoryFilter,
    categoryIdsByMaterialId,
  )
  const mounting = filterCells(
    row.mounting,
    categoryFilter,
    categoryIdsByMaterialId,
  )
  const other = filterCells(row.other, categoryFilter, categoryIdsByMaterialId)
  const hasAny =
    bases.length > 0 ||
    finishings.length > 0 ||
    assembly.length > 0 ||
    lighting.length > 0 ||
    mounting.length > 0 ||
    other.length > 0
  return {
    ...row,
    bases,
    finishings,
    assembly,
    lighting,
    mounting,
    other,
    emptyMessage: hasAny ? undefined : 'No materials in this category.',
  }
}

function countMatches(text: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const hay = text.toLowerCase()
  let count = 0
  let from = 0
  while (from < hay.length) {
    const i = hay.indexOf(q, from)
    if (i === -1) break
    count += 1
    from = i + q.length
  }
  return count
}

function highlightText(text: string, query: string): React.ReactNode {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let start = 0
  let hit = 0
  let i = lower.indexOf(needle, start)
  while (i !== -1) {
    if (i > start) parts.push(text.slice(start, i))
    parts.push(
      <mark
        key={`h-${hit}`}
        className="rounded-sm bg-[#ffe08a] px-0.5 text-inherit"
      >
        {text.slice(i, i + needle.length)}
      </mark>,
    )
    hit += 1
    start = i + needle.length
    i = lower.indexOf(needle, start)
  }
  if (start < text.length) parts.push(text.slice(start))
  return parts.length > 0 ? parts : text
}

/** Side-by-side cells for assembly / lighting / mounting / other. */
function StackCell({ lines, query }: { lines: SheetCell[]; query: string }) {
  if (lines.length === 0) {
    return <span className="text-(--muted)">—</span>
  }
  const q = query.trim()
  return (
    <div className="flex flex-row flex-nowrap items-stretch gap-0">
      {lines.map((line, index) => {
        const matched = q.length > 0 && countMatches(line.text, q) > 0
        return (
          <div
            key={`${index}-${line.text}`}
            className={cn(
              'min-w-[9rem] max-w-[14rem] shrink-0 break-words px-1.5 py-0.5 text-xs',
              index > 0 && 'border-l border-(--line)',
              matched && 'bg-[#fff6d6]',
            )}
          >
            {highlightText(line.text, q)}
          </div>
        )
      })}
    </div>
  )
}

function SlotCell({
  cell,
  query,
  className,
}: {
  cell: SheetCell | undefined
  query: string
  className?: string
}) {
  if (!cell) {
    return (
      <td className={cn(cellBorder, 'text-xs text-(--muted)', className)}>
        —
      </td>
    )
  }
  const q = query.trim()
  const matched = q.length > 0 && countMatches(cell.text, q) > 0
  return (
    <td
      className={cn(
        cellBorder,
        'min-w-[10rem] max-w-[16rem] text-xs',
        matched && 'bg-[#fff6d6]',
        className,
      )}
    >
      <div className="break-words">{highlightText(cell.text, q)}</div>
    </td>
  )
}

function finishingHeaderLabel(rows: SheetRow[], index: number): string {
  for (const row of rows) {
    const cell = row.finishings[index]
    if (!cell) continue
    const num = cell.text.trim().split(/\s+/)[0]
    if (num && /^\d+\.\d+$/.test(num)) return num
  }
  return `Layer ${index + 1}`
}

function rowMatchCount(row: SheetRow, query: string): number {
  const q = query.trim()
  if (!q) return 0
  if (row.emptyMessage) return countMatches(row.emptyMessage, q)
  const fields = [
    row.shopDrawing,
    ...row.bases.map((c) => c.text),
    ...row.finishings.map((c) => c.text),
    ...row.assembly.map((c) => c.text),
    ...row.lighting.map((c) => c.text),
    ...row.mounting.map((c) => c.text),
    ...row.other.map((c) => c.text),
  ]
  return fields.reduce((sum, text) => sum + countMatches(text, q), 0)
}

const cellBorder = 'border border-(--line) px-2 py-1.5'
const stickyShop =
  'sticky left-0 z-10 min-w-[9rem] max-w-[12rem] border border-(--line) px-2 py-1.5 font-medium'
const headCell = cn(cellBorder, 'bg-(--surface) font-medium')

export default function ShopDrawingBoqStackViewer({
  summary,
  overview,
  materials = [],
  categories = [],
  className,
}: Props) {
  const categoryIdsByMaterialId = React.useMemo(() => {
    const map = new Map<string, string[]>()
    for (const m of materials) {
      map.set(m.id, m.categoryIds ?? [])
    }
    return map
  }, [materials])

  const categoryOptions = React.useMemo(
    () => [
      { value: 'all', label: 'All categories' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  )

  const rawRows = React.useMemo(
    () => buildRows(summary, overview),
    [summary, overview],
  )
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] =
    React.useState<CategoryFilter>('all')

  const rows = React.useMemo(
    () =>
      rawRows.map((row) =>
        filterRow(row, categoryFilter, categoryIdsByMaterialId),
      ),
    [rawRows, categoryFilter, categoryIdsByMaterialId],
  )

  const maxBases = React.useMemo(
    () => Math.max(0, ...rows.map((r) => r.bases.length)),
    [rows],
  )
  const maxFinishings = React.useMemo(
    () => Math.max(0, ...rows.map((r) => r.finishings.length)),
    [rows],
  )
  const dataColCount = Math.max(1, maxBases) + Math.max(1, maxFinishings) + 4
  const matchTotal = React.useMemo(
    () => rows.reduce((sum, row) => sum + rowMatchCount(row, query), 0),
    [rows, query],
  )
  const q = query.trim()
  const filtersActive = Boolean(q) || categoryFilter !== 'all'

  if (summary.length === 0) {
    return (
      <p className={cn('text-sm', hintClassName, className)}>
        No Shop Drawing items to show.
      </p>
    )
  }

  return (
    <div
      className={cn('grid w-full min-w-0 gap-3', className)}
      aria-label="BOQ overview sheet"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <ListSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Find material…"
          aria-label="Find material in overview"
          className="max-w-sm flex-1"
        />
        <Combobox
          value={categoryFilter}
          onValueChange={setCategoryFilter}
          options={categoryOptions}
          placeholder="All categories"
          searchPlaceholder="Search category…"
          emptyText="No category found."
          aria-label="Category filter"
          className="w-[10rem] shrink-0"
        />
        {filtersActive ? (
          <p
            className={cn('text-xs tabular-nums', hintClassName)}
            aria-live="polite"
          >
            {q
              ? matchTotal === 0
                ? 'No matches'
                : `${matchTotal} match${matchTotal === 1 ? '' : 'es'}`
              : 'Filtered by category'}
          </p>
        ) : (
          <p className={cn('text-xs', hintClassName)}>
            Search highlights where a material is used
          </p>
        )}
      </div>
      <div
        className="min-w-0 overflow-auto overscroll-contain border border-(--line) bg-white"
        style={{ maxHeight: 'min(70vh, 40rem)' }}
      >
        <table className="w-max border-collapse border border-(--line) text-left text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="text-[11px] tracking-wide text-(--muted)">
              <th
                className={cn(stickyShop, 'z-30 bg-(--surface) font-medium')}
                rowSpan={2}
              >
                Shop Drawing
              </th>
              <th className={cn(headCell, 'min-w-[3rem]')} rowSpan={2}>
                Ver
              </th>
              <th
                className={cn(headCell, 'text-center')}
                colSpan={Math.max(1, maxBases)}
              >
                Base material
              </th>
              <th
                className={cn(headCell, 'text-center')}
                colSpan={Math.max(1, maxFinishings)}
              >
                Finishing
              </th>
              <th className={cn(headCell, 'min-w-[9rem]')} rowSpan={2}>
                Assembly
              </th>
              <th className={cn(headCell, 'min-w-[9rem]')} rowSpan={2}>
                Lighting
              </th>
              <th className={cn(headCell, 'min-w-[9rem]')} rowSpan={2}>
                Mounting
              </th>
              <th className={cn(headCell, 'min-w-[9rem]')} rowSpan={2}>
                Other
              </th>
            </tr>
            <tr className="text-[11px] tracking-wide text-(--muted)">
              {maxBases === 0 ? (
                <th className={cn(headCell, 'min-w-[10rem]')}>—</th>
              ) : (
                Array.from({ length: maxBases }, (_, i) => (
                  <th
                    key={`base-h-${i}`}
                    className={cn(headCell, 'min-w-[10rem]')}
                  >
                    Base {i + 1}
                  </th>
                ))
              )}
              {maxFinishings === 0 ? (
                <th className={cn(headCell, 'min-w-[10rem]')}>—</th>
              ) : (
                Array.from({ length: maxFinishings }, (_, i) => (
                  <th
                    key={`fin-h-${i}`}
                    className={cn(headCell, 'min-w-[10rem]')}
                  >
                    {finishingHeaderLabel(rows, i)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected = selectedKey === row.key
              const hits = q.length > 0 ? rowMatchCount(row, q) : 0
              const hasFindHit = hits > 0
              const fill = selected
                ? 'bg-[#dceafc]'
                : hasFindHit
                  ? 'bg-[#fffaf0]'
                  : 'bg-white group-hover:bg-[#f3f7fb]'
              return (
                <tr
                  key={row.key}
                  className={cn(
                    'group cursor-pointer align-top',
                    q.length > 0 && !hasFindHit && 'opacity-40',
                  )}
                  aria-selected={selected}
                  data-find-hit={hasFindHit || undefined}
                  onClick={() =>
                    setSelectedKey((prev) =>
                      prev === row.key ? null : row.key,
                    )
                  }
                >
                  <td className={cn(stickyShop, fill)}>
                    <span className="block truncate" title={row.shopDrawing}>
                      {highlightText(row.shopDrawing, q)}
                    </span>
                  </td>
                  <td className={cn(cellBorder, 'text-(--muted)', fill)}>
                    {row.version}
                  </td>
                  {row.emptyMessage ? (
                    <td
                      colSpan={dataColCount}
                      className={cn(cellBorder, 'text-xs', hintClassName, fill)}
                    >
                      {highlightText(row.emptyMessage, q)}
                    </td>
                  ) : (
                    <>
                      {maxBases === 0 ? (
                        <SlotCell cell={undefined} query={q} className={fill} />
                      ) : (
                        Array.from({ length: maxBases }, (_, i) => (
                          <SlotCell
                            key={`${row.key}-b-${i}`}
                            cell={row.bases[i]}
                            query={q}
                            className={fill}
                          />
                        ))
                      )}
                      {maxFinishings === 0 ? (
                        <SlotCell cell={undefined} query={q} className={fill} />
                      ) : (
                        Array.from({ length: maxFinishings }, (_, i) => (
                          <SlotCell
                            key={`${row.key}-f-${i}`}
                            cell={row.finishings[i]}
                            query={q}
                            className={fill}
                          />
                        ))
                      )}
                      <td className={cn(cellBorder, 'text-xs', fill)}>
                        <StackCell lines={row.assembly} query={q} />
                      </td>
                      <td className={cn(cellBorder, 'text-xs', fill)}>
                        <StackCell lines={row.lighting} query={q} />
                      </td>
                      <td className={cn(cellBorder, 'text-xs', fill)}>
                        <StackCell lines={row.mounting} query={q} />
                      </td>
                      <td className={cn(cellBorder, 'text-xs', fill)}>
                        <StackCell lines={row.other} query={q} />
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
