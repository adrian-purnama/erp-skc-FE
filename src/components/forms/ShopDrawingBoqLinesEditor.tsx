import * as React from 'react'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Input } from '#/components/ui/input'
import type { ItemCategoryOut } from '#/lib/itemMaster'
import type { ProjectShopDrawingBoqMaterial } from '#/lib/project'
import {
  formulaVariableCount,
  previewUomFormula,
  type UomVar,
} from '#/lib/uomFormula'
import { cn } from '#/lib/utils'
import { hintClassName } from '#/lib/ui-classes'

export type DraftInputs = {
  v1: string
  v2?: string
  v3?: string
}

export type DraftLine = {
  key: string
  materialItemId: string
  itemUomId: string
  formula: string
  inputs: DraftInputs
  spec?: string
}

export function newLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyLine(): DraftLine {
  return {
    key: newLineKey(),
    materialItemId: '',
    itemUomId: '',
    formula: 'v1',
    inputs: { v1: '' },
  }
}

export function emptyInputsFor(formula: string): DraftInputs {
  const count = formulaVariableCount(formula)
  const inputs: DraftInputs = { v1: '' }
  if (count >= 2) inputs.v2 = ''
  if (count >= 3) inputs.v3 = ''
  return inputs
}

export function computedQtyDisplay(line: DraftLine): string {
  const count = formulaVariableCount(line.formula)
  if (count === 0) return '—'
  const values: Partial<Record<UomVar, number>> = {}
  for (let n = 1; n <= count; n += 1) {
    const key = `v${n}` as UomVar
    const raw = line.inputs[key]
    if (raw === undefined || raw.trim() === '') return '—'
    const num = Number(raw)
    if (!Number.isFinite(num)) return '—'
    values[key] = num
  }
  const result = previewUomFormula(line.formula, values)
  return result === null ? '—' : String(result)
}

export function isLineComplete(line: DraftLine): boolean {
  if (!line.materialItemId || !line.itemUomId) return false
  return computedQtyDisplay(line) !== '—'
}

function formatFormulaLabel(expr: string): string {
  return expr.replaceAll(' * ', ' × ').replaceAll('*', ' × ')
}

function multiplyDisplay(qtyPerUnit: string, makeQty: string): string {
  const a = Number(qtyPerUnit)
  const b = Number(makeQty)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '—'
  const product = a * b
  if (!Number.isFinite(product)) return '—'
  return String(product)
}

function formatTotalWithUom(
  qtyPerUnit: string,
  makeQty: string,
  symbol: string | undefined,
): string {
  const total = multiplyDisplay(qtyPerUnit, makeQty)
  if (total === '—') return '—'
  return symbol ? `${total} ${symbol}` : total
}

function qtyInputsSummary(line: DraftLine): string {
  const count = formulaVariableCount(line.formula)
  if (count <= 0) return '—'
  const parts: string[] = []
  for (let n = 1; n <= count; n += 1) {
    const raw = line.inputs[`v${n}` as UomVar]
    if (raw === undefined || raw.trim() === '') return '—'
    parts.push(raw.trim())
  }
  return parts.join(' × ')
}

function formulaOptionsFor(
  liveFormulas: string[] | undefined,
  storedFormula: string,
): string[] {
  const live = liveFormulas && liveFormulas.length > 0 ? liveFormulas : ['v1']
  if (storedFormula && !live.includes(storedFormula)) {
    return [storedFormula, ...live]
  }
  return live
}

type Props = {
  lines: DraftLine[]
  onChange: (lines: DraftLine[]) => void
  materials: ProjectShopDrawingBoqMaterial[]
  categories?: ItemCategoryOut[]
  makeQty: string
  canManage: boolean
  disabled?: boolean
  showSpec?: boolean
  allowEmpty?: boolean
  /** Cap how many material lines can be added (e.g. 1 for a base core). */
  maxLines?: number
  /** Tighter padding, hide # column — for sandwich stacks. */
  compact?: boolean
  /**
   * First N lines are frozen (RAB locked): view-only, cannot remove.
   * New lines after the prefix remain editable.
   */
  frozenPrefixCount?: number
}

export default function ShopDrawingBoqLinesEditor({
  lines,
  onChange,
  materials,
  categories = [],
  makeQty,
  canManage,
  disabled = false,
  showSpec = false,
  allowEmpty = true,
  maxLines,
  compact = false,
  frozenPrefixCount = 0,
}: Props) {
  const cell = compact ? 'px-2 py-1.5' : 'px-3 py-2.5'
  const head = compact ? 'px-2 py-1.5' : 'px-3 py-2'
  const colCount =
    (compact ? 0 : 1) +
    1 +
    (showSpec ? 1 : 0) +
    3 +
    (canManage ? 1 : 0)
  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.itemId} — ${m.name}`,
    categoryIds: m.categoryIds ?? [],
  }))
  const materialCategories = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }))

  function uomsFor(materialItemId: string) {
    return materials.find((m) => m.id === materialItemId)?.uoms ?? []
  }

  function materialMeta(materialItemId: string) {
    return materials.find((m) => m.id === materialItemId) ?? null
  }

  const [editingKey, setEditingKey] = React.useState<string | null>(
    lines.length === 1 && !isLineComplete(lines[0]!) ? lines[0]!.key : null,
  )

  // Keep editingKey valid when lines change externally
  React.useEffect(() => {
    if (editingKey && !lines.some((l) => l.key === editingKey)) {
      setEditingKey(null)
    }
  }, [lines, editingKey])

  return (
    <div>
      <div className="overflow-x-auto">
        <table
          className={cn(
            'w-full border-collapse text-left text-sm',
            compact ? 'min-w-[32rem]' : 'min-w-[40rem]',
          )}
        >
          <thead>
            <tr
              className={cn(
                'border-b border-(--line) text-[11px] tracking-wide text-(--muted)',
                !compact && 'bg-(--surface)',
              )}
            >
              {compact ? null : (
                <th className={cn('w-10 font-medium', head)}>#</th>
              )}
              <th className={cn('font-medium', head)}>Material</th>
              {showSpec ? (
                <th className={cn('w-32 font-medium', head)}>Spec</th>
              ) : null}
              <th className={cn('w-20 font-medium', head)}>UOM</th>
              <th className={cn('w-36 font-medium', head)}>Qty / unit</th>
              <th className={cn('w-28 font-medium', head)}>Total</th>
              {canManage ? (
                <th className={cn('w-16 font-medium', head)}> </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className={cn(cell, 'text-sm', hintClassName)}
                >
                  No materials yet.
                </td>
              </tr>
            ) : null}
            {lines.map((line, index) => {
              const meta = materialMeta(line.materialItemId)
              const lineUoms = uomsFor(line.materialItemId)
              const selectedUom = lineUoms.find((u) => u.id === line.itemUomId)
              const uomSymbol = selectedUom?.symbol
              const uomOptions = lineUoms.map((u) => ({
                value: u.id,
                label: u.symbol || u.name,
              }))
              const modes = formulaOptionsFor(
                selectedUom?.formulas,
                line.formula,
              )
              const varCount = formulaVariableCount(line.formula)
              const qtyPreview = computedQtyDisplay(line)
              const lineFrozen = index < frozenPrefixCount
              const lineEditable = canManage && !lineFrozen
              const editing = editingKey === line.key && lineEditable
              const qtyView =
                varCount <= 1
                  ? qtyPreview
                  : qtyPreview === '—'
                    ? qtyInputsSummary(line)
                    : `${qtyInputsSummary(line)} = ${qtyPreview}`

              return (
                <tr
                  key={line.key}
                  className={cn(
                    'border-b border-(--line) last:border-b-0',
                    editing && 'bg-(--surface)/50',
                    lineFrozen && 'opacity-90',
                  )}
                >
                  {compact ? null : (
                    <td
                      className={cn(
                        cell,
                        'align-top tabular-nums text-(--muted)',
                      )}
                    >
                      {index + 1}
                    </td>
                  )}

                  {editing && lineEditable ? (
                    <>
                      <td
                        className={cn(cell, 'align-top')}
                        colSpan={showSpec ? 4 : 3}
                      >
                        <div
                          className={cn(
                            'flex flex-nowrap items-center gap-2',
                            !compact && 'items-end',
                          )}
                        >
                          <div
                            className={cn(
                              'min-w-0 shrink space-y-1',
                              compact ? 'w-[14rem] max-w-[50%]' : 'w-[18rem]',
                            )}
                          >
                            {compact ? null : (
                              <p className="text-[11px] text-(--muted)">
                                Material
                              </p>
                            )}
                            <Combobox
                              value={line.materialItemId}
                              onValueChange={(value) => {
                                const uoms = uomsFor(value)
                                const base =
                                  uoms.find((u) => u.isBase) ?? uoms[0]
                                const formulas =
                                  base?.formulas && base.formulas.length > 0
                                    ? base.formulas
                                    : ['v1']
                                const formula = formulas[0] ?? 'v1'
                                onChange(
                                  lines.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          materialItemId: value,
                                          itemUomId: base?.id ?? '',
                                          formula,
                                          inputs: emptyInputsFor(formula),
                                        }
                                      : row,
                                  ),
                                )
                              }}
                              options={materialOptions}
                              categories={
                                materialCategories.length > 0
                                  ? materialCategories
                                  : undefined
                              }
                              placeholder="Select material"
                              searchPlaceholder="Search materials…"
                              emptyText="No materials."
                              className="w-full sm:w-full"
                              contentClassName="w-[min(28rem,calc(100vw-2rem))] min-w-[min(28rem,calc(100vw-2rem))]"
                              aria-label={`Material line ${index + 1}`}
                            />
                          </div>
                          <div className="w-24 shrink-0 space-y-1">
                            {compact ? null : (
                              <p className="text-[11px] text-(--muted)">UOM</p>
                            )}
                            <Combobox
                              value={line.itemUomId}
                              onValueChange={(value) => {
                                const uom = lineUoms.find((u) => u.id === value)
                                const formulas =
                                  uom?.formulas && uom.formulas.length > 0
                                    ? uom.formulas
                                    : ['v1']
                                const formula = formulas[0] ?? 'v1'
                                onChange(
                                  lines.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          itemUomId: value,
                                          formula,
                                          inputs: emptyInputsFor(formula),
                                        }
                                      : row,
                                  ),
                                )
                              }}
                              options={uomOptions}
                              placeholder="UOM"
                              searchPlaceholder="Search UOM…"
                              emptyText="No UOM."
                              className="w-full sm:w-full"
                              aria-label={`UOM line ${index + 1}`}
                            />
                          </div>
                          {showSpec ? (
                            <div className="w-36 shrink-0 space-y-1">
                              {compact ? null : (
                                <p className="text-[11px] text-(--muted)">
                                  Spec / dimension
                                </p>
                              )}
                              <Input
                                value={line.spec ?? ''}
                                onChange={(e) =>
                                  onChange(
                                    lines.map((row, i) =>
                                      i === index
                                        ? { ...row, spec: e.target.value }
                                        : row,
                                    ),
                                  )
                                }
                                disabled={disabled}
                                placeholder="Jenis + ukuran"
                                className="h-9"
                              />
                            </div>
                          ) : null}
                          <div className="min-w-0 shrink-0 space-y-1">
                            {compact ? null : (
                              <p className="text-[11px] text-(--muted)">Qty</p>
                            )}
                            {modes.length > 1 ? (
                              <div className="flex flex-wrap gap-1">
                                {modes.map((expr) => {
                                  const active = line.formula === expr
                                  return (
                                    <button
                                      key={expr}
                                      type="button"
                                      className={cn(
                                        'rounded border px-2 py-0.5 font-mono text-xs',
                                        active
                                          ? 'border-(--ink) bg-(--ink) text-white'
                                          : 'border-(--line) text-(--muted) hover:border-(--ink)/40',
                                      )}
                                      onClick={() =>
                                        onChange(
                                          lines.map((row, i) =>
                                            i === index
                                              ? {
                                                  ...row,
                                                  formula: expr,
                                                  inputs: emptyInputsFor(expr),
                                                }
                                              : row,
                                          ),
                                        )
                                      }
                                    >
                                      {formatFormulaLabel(expr)}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                            {varCount <= 1 ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  value={line.inputs.v1}
                                  onChange={(e) =>
                                    onChange(
                                      lines.map((row, i) =>
                                        i === index
                                          ? {
                                              ...row,
                                              inputs: { v1: e.target.value },
                                            }
                                          : row,
                                      ),
                                    )
                                  }
                                  disabled={disabled}
                                  inputMode="decimal"
                                  placeholder="Qty"
                                  className="h-9 w-20"
                                />
                                {uomSymbol ? (
                                  <span className="shrink-0 text-sm text-(--muted)">
                                    {uomSymbol}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-nowrap items-center gap-1.5">
                                {Array.from({ length: varCount }, (_, n) => {
                                  const key = `v${n + 1}` as UomVar
                                  return (
                                    <div
                                      key={key}
                                      className="flex items-center gap-1.5"
                                    >
                                      {n > 0 ? (
                                        <span className="text-(--muted)">×</span>
                                      ) : null}
                                      <Input
                                        value={line.inputs[key] ?? ''}
                                        onChange={(e) =>
                                          onChange(
                                            lines.map((row, i) =>
                                              i === index
                                                ? {
                                                    ...row,
                                                    inputs: {
                                                      ...row.inputs,
                                                      [key]: e.target.value,
                                                    },
                                                  }
                                                : row,
                                            ),
                                          )
                                        }
                                        disabled={disabled}
                                        inputMode="decimal"
                                        className="h-9 w-16"
                                      />
                                    </div>
                                  )
                                })}
                                <span className="shrink-0 pl-0.5 text-sm tabular-nums text-(--muted)">
                                  = {qtyPreview}
                                  {uomSymbol ? ` ${uomSymbol}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={cn(cell, 'align-top tabular-nums')}>
                        {formatTotalWithUom(qtyPreview, makeQty, uomSymbol)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cn(cell, 'align-top')}>
                        <button
                          type="button"
                          className={cn(
                            'block w-full text-left',
                            lineEditable && 'hover:opacity-80',
                          )}
                          disabled={!lineEditable || disabled}
                          onClick={() => setEditingKey(line.key)}
                        >
                          <span className="font-medium">
                            {meta?.name ?? '—'}
                          </span>
                          {meta?.itemId ? (
                            <span className="mt-0.5 block font-mono text-xs text-(--muted)">
                              {meta.itemId}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      {showSpec ? (
                        <td
                          className={cn(cell, 'align-top text-sm text-(--muted)')}
                        >
                          {line.spec?.trim() || '—'}
                        </td>
                      ) : null}
                      <td className={cn(cell, 'align-top font-mono text-sm')}>
                        {uomSymbol ?? '—'}
                      </td>
                      <td className={cn(cell, 'align-top tabular-nums')}>
                        {qtyView}
                      </td>
                      <td className={cn(cell, 'align-top tabular-nums')}>
                        {formatTotalWithUom(qtyPreview, makeQty, uomSymbol)}
                      </td>
                    </>
                  )}

                  {canManage ? (
                    <td className={cn(compact ? 'px-1 py-1' : 'px-1 py-2', 'align-top')}>
                      {lineFrozen ? (
                        <span
                          className={cn('px-1 text-[10px]', hintClassName)}
                          title="Frozen after RAB lock"
                        >
                          Locked
                        </span>
                      ) : (
                        <div className="flex items-center justify-end gap-0.5">
                          {editing ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={disabled || !isLineComplete(line)}
                              onClick={() => setEditingKey(null)}
                            >
                              <Check className="size-3.5" aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={disabled}
                              onClick={() => setEditingKey(line.key)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            disabled={
                              disabled ||
                              (!allowEmpty && lines.length <= 1)
                            }
                            onClick={() => {
                              onChange(lines.filter((_, i) => i !== index))
                              if (editingKey === line.key) setEditingKey(null)
                            }}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {canManage && (maxLines === undefined || lines.length < maxLines) ? (
        <div className="border-t border-(--line) px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2"
            disabled={disabled}
            onClick={() => {
              const next = emptyLine()
              onChange([...lines, next])
              setEditingKey(next.key)
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            {compact ? 'Add material' : 'Add line'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
