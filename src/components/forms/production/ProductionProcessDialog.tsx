import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { RupiahInput } from '#/components/ui/rupiah-input'
import { apiFetch } from '#/lib/api'
import type { ProjectRabLabourItem } from '#/lib/project'
import type {
  ProductionItemProgress,
  ProductionLabourExecutor,
  ProductionLabourRole,
  ProductionProcessLineInput,
  ProductionProjectProgress,
} from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  metaTextClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Row = {
  /** Existing RAB line key, or a local id for a new stage. */
  id: string
  isNew: boolean
  name: string
  role: ProductionLabourRole
  executor: ProductionLabourExecutor
  weight: string
  /** Live SPKs on this stage: role / executor fixed, can't be removed. */
  locked: boolean
  doneQty: string
  labourItemId: string
  labourUomId: string
  totalQty: string
  unitPrice: string
}

type Props = {
  projectId: string
  item: ProductionItemProgress | null
  onOpenChange: (open: boolean) => void
  onSaved: (progress: ProductionProjectProgress) => void
}

const ROLE_OPTIONS = [
  { value: 'making', label: 'Making' },
  { value: 'install', label: 'Install' },
]
const EXECUTOR_OPTIONS = [
  { value: 'inhouse', label: 'Inhouse' },
  { value: 'vendor', label: 'Vendor' },
]

function rowsOf(item: ProductionItemProgress): Row[] {
  return item.stages.map((st) => ({
    id: st.key,
    isNew: false,
    name: st.name,
    role: st.role,
    executor: st.executor,
    weight: st.weightPercent != null ? String(st.weightPercent) : '',
    locked: st.orderCount > 0,
    doneQty: st.doneQty,
    labourItemId: st.labourItemId,
    labourUomId: st.labourUomId,
    totalQty: '',
    unitPrice: '',
  }))
}

let newRowSeq = 0

/** One item's stages: making and install tracks, each in order with weights totalling 100. */
export default function ProductionProcessDialog({
  projectId,
  item,
  onOpenChange,
  onSaved,
}: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [labourItems, setLabourItems] = useState<ProjectRabLabourItem[] | null>(
    null,
  )

  useEffect(() => {
    if (!item) return
    setRows(rowsOf(item))
    setReason('')
  }, [item])

  const needsLabourItems = rows.some((r) => r.isNew)
  useEffect(() => {
    if (!needsLabourItems || labourItems !== null) return
    void apiFetch<ProjectRabLabourItem[]>(
      `/production/projects/${projectId}/labour-items`,
    )
      .then((res) => {
        if (res.success) setLabourItems(res.data)
        else toast.error(res.message || 'Failed to load labour items')
      })
      .catch(() => toast.error('Unable to reach the server'))
  }, [needsLabourItems, labourItems, projectId])

  const making = rows.filter((r) => r.role === 'making')
  const install = rows.filter((r) => r.role === 'install')
  const removed = useMemo(
    () =>
      (item?.stages ?? []).filter(
        (st) => !rows.some((r) => !r.isNew && r.id === st.key),
      ),
    [item, rows],
  )

  function patch(id: string, next: Partial<Row>) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }

  /** Move a row up / down within its own track. */
  function move(id: string, dir: -1 | 1) {
    setRows((list) => {
      const row = list.find((r) => r.id === id)
      if (!row) return list
      const track = list.filter((r) => r.role === row.role)
      const i = track.indexOf(row)
      const j = i + dir
      if (j < 0 || j >= track.length) return list
      const swapped = [...track]
      ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
      const other = list.filter((r) => r.role !== row.role)
      return row.role === 'making'
        ? [...swapped, ...other]
        : [...other, ...swapped]
    })
  }

  function setRole(id: string, role: ProductionLabourRole) {
    setRows((list) => {
      const row = list.find((r) => r.id === id)
      if (!row || row.role === role) return list
      // Joins the end of the other track.
      const rest = list.filter((r) => r.id !== id)
      const moved = { ...row, role }
      const m = rest.filter((r) => r.role === 'making')
      const ins = rest.filter((r) => r.role === 'install')
      return role === 'making' ? [...m, moved, ...ins] : [...m, ...ins, moved]
    })
  }

  function addStage(role: ProductionLabourRole) {
    newRowSeq += 1
    const row: Row = {
      id: `new-${newRowSeq}`,
      isNew: true,
      name: '',
      role,
      executor: 'inhouse',
      weight: '',
      locked: false,
      doneQty: '0',
      labourItemId: '',
      labourUomId: '',
      totalQty: item?.makeQty ?? '1',
      unitPrice: '',
    }
    setRows((list) => {
      const m = list.filter((r) => r.role === 'making')
      const ins = list.filter((r) => r.role === 'install')
      return role === 'making' ? [...m, row, ...ins] : [...m, ...ins, row]
    })
  }

  function sum(track: Row[]): number {
    return track.reduce((s, r) => s + (Number(r.weight) || 0), 0)
  }

  async function save() {
    if (!item) return
    const lines: ProductionProcessLineInput[] = []
    for (const track of [making, install]) {
      track.forEach((r, i) => {
        const base = {
          role: r.role,
          executor: r.executor,
          sequence: i + 1,
          weightPercent: Number(r.weight),
        }
        lines.push(
          r.isNew
            ? {
                ...base,
                labourItemId: r.labourItemId,
                labourUomId: r.labourUomId,
                totalQty: r.totalQty,
                unitPrice: r.unitPrice,
              }
            : { ...base, key: r.id },
        )
      })
    }
    setSaving(true)
    try {
      const res = await apiFetch<ProductionProjectProgress>(
        `/production/projects/${projectId}/items/${item.itemId}/process`,
        { method: 'PUT', body: JSON.stringify({ reason, lines }) },
      )
      if (!res.success) {
        toast.error(res.message || 'Failed to save the process')
        return
      }
      toast.success('Process saved and recorded in RAB activity')
      onSaved(res.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const labourOptions = (labourItems ?? []).map((l) => ({
    value: l.id,
    label: l.itemId ? `${l.itemId} · ${l.name}` : l.name,
  }))

  function renderTrack(title: string, role: ProductionLabourRole, list: Row[]) {
    const total = sum(list)
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className={metaTextClassName}>
            {title}
            {list.length > 0 ? (
              <span
                className={cn(
                  'ml-2 tabular-nums normal-case',
                  total === 100 ? 'text-emerald-700' : 'text-amber-700',
                )}
              >
                {total}% of 100%
              </span>
            ) : null}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={saving}
            onClick={() => addStage(role)}
          >
            <Plus className="size-3.5" aria-hidden />
            Add {role === 'making' ? 'stage' : 'install step'}
          </Button>
        </div>
        {list.length === 0 ? (
          <p className={cn('text-xs', hintClassName)}>
            {role === 'making'
              ? 'Add at least one making stage.'
              : 'No install steps. Optional.'}
          </p>
        ) : (
          <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
            {list.map((r, i) => (
              <li key={r.id} className="space-y-2 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-xs tabular-nums text-(--muted)">
                    {i + 1}.
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    {r.isNew ? (
                      <span className="text-xs text-(--muted)">New</span>
                    ) : (
                      <span className="truncate font-medium">{r.name}</span>
                    )}
                    {r.locked ? (
                      <Lock
                        className="size-3 shrink-0 text-(--muted)"
                        aria-label="Has SPKs: role and done-by are fixed"
                      />
                    ) : null}
                    {Number(r.doneQty) > 0 ? (
                      <span className="text-xs tabular-nums text-(--muted)">
                        · {r.doneQty} done
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0"
                      disabled={saving || i === 0}
                      aria-label="Move up"
                      onClick={() => move(r.id, -1)}
                    >
                      <ArrowUp className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0"
                      disabled={saving || i === list.length - 1}
                      aria-label="Move down"
                      onClick={() => move(r.id, 1)}
                    >
                      <ArrowDown className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      className="h-7 w-16 text-xs tabular-nums"
                      value={r.weight}
                      disabled={saving}
                      aria-label={`Weight for ${r.name || 'new stage'}`}
                      onChange={(e) => patch(r.id, { weight: e.target.value })}
                    />
                    <span className="text-xs text-(--muted)">%</span>
                  </div>
                  <Combobox
                    value={r.role}
                    onValueChange={(v) =>
                      setRole(r.id, v as ProductionLabourRole)
                    }
                    options={ROLE_OPTIONS}
                    disabled={saving || r.locked}
                    aria-label="Making or install"
                    className="h-7 w-28 text-xs"
                  />
                  <Combobox
                    value={r.executor}
                    onValueChange={(v) =>
                      patch(r.id, { executor: v as ProductionLabourExecutor })
                    }
                    options={EXECUTOR_OPTIONS}
                    disabled={saving || r.locked}
                    aria-label="Done by"
                    className="h-7 w-28 text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    disabled={saving || r.locked}
                    aria-label="Remove stage"
                    onClick={() =>
                      setRows((l) => l.filter((x) => x.id !== r.id))
                    }
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                {r.isNew ? (
                  <NewStageFields
                    row={r}
                    disabled={saving}
                    labourItems={labourItems}
                    labourOptions={labourOptions}
                    onPatch={(next) => patch(r.id, next)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onOpenChange(false)
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Process · {item?.label}</DialogTitle>
          <DialogDescription>
            Each stage is its own SPK. Stages run in order, and each
            track&apos;s weights must total 100%. Saving records a RAB change.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {renderTrack('Making', 'making', making)}
          {renderTrack('Install', 'install', install)}
          {removed.length > 0 ? (
            <p className={cn('text-xs', hintClassName)}>
              Removing from the RAB: {removed.map((s) => s.name).join(', ')}
            </p>
          ) : null}
          <label className="block space-y-1">
            <span className="text-sm font-medium">Reason</span>
            <textarea
              value={reason}
              disabled={saving}
              rows={2}
              placeholder="Why the process changes (shown in RAB activity)"
              onChange={(e) => setReason(e.target.value)}
              className={dialogInputClassName}
            />
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !reason.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save process'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Labour item, UOM, RAB qty and unit price for a stage new to the RAB. */
function NewStageFields({
  row,
  disabled,
  labourItems,
  labourOptions,
  onPatch,
}: {
  row: Row
  disabled: boolean
  labourItems: ProjectRabLabourItem[] | null
  labourOptions: Array<{ value: string; label: string }>
  onPatch: (next: Partial<Row>) => void
}) {
  const picked = labourItems?.find((l) => l.id === row.labourItemId)
  const uomOptions = (picked?.uoms ?? []).map((u) => ({
    value: u.id,
    label: u.symbol || u.name,
  }))
  return (
    <div className="grid gap-2 pl-7 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_9rem]">
      <Combobox
        value={row.labourItemId}
        onValueChange={(v) => {
          const next = labourItems?.find((l) => l.id === v)
          const base =
            next?.uoms.find((u) => u.uomId === next.baseUomId) ?? next?.uoms[0]
          onPatch({
            labourItemId: v,
            labourUomId: base?.id ?? '',
            name: next?.name ?? '',
          })
        }}
        options={labourOptions}
        placeholder={labourItems === null ? 'Loading…' : 'Labour item'}
        searchPlaceholder="Search labour…"
        emptyText="No labour item found."
        disabled={disabled || labourItems === null}
        aria-label="Labour item"
        className="h-8 text-xs"
      />
      <Combobox
        value={row.labourUomId}
        onValueChange={(v) => onPatch({ labourUomId: v })}
        options={uomOptions}
        placeholder="UOM"
        disabled={disabled || !picked}
        aria-label="UOM"
        className="h-8 text-xs"
      />
      <Input
        inputMode="decimal"
        className="h-8 text-xs tabular-nums"
        value={row.totalQty}
        disabled={disabled}
        aria-label="RAB qty"
        placeholder="Qty"
        onChange={(e) => onPatch({ totalQty: e.target.value })}
      />
      <RupiahInput
        className="h-8 text-xs"
        value={row.unitPrice}
        disabled={disabled}
        aria-label="Unit price"
        placeholder="Unit price"
        onValueChange={(digits) => onPatch({ unitPrice: digits })}
      />
    </div>
  )
}
