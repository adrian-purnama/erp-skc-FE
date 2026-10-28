import type { ProjectRabChangeBoqMaterialDiff } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'
import { changeKindBadgeClass } from './costingStatus'

/** "Changed" split by direction, so a reduced material reads as Decreased. */
function materialChangeLabel(d: ProjectRabChangeBoqMaterialDiff): string {
  if (d.kind === 'added') return 'Added'
  if (d.kind === 'removed') return 'Removed'
  const before = Number(d.oldTotalQty)
  const after = Number(d.newTotalQty)
  if (Number.isFinite(before) && Number.isFinite(after)) {
    if (after > before) return 'Increased'
    if (after < before) return 'Decreased'
  }
  return 'Changed'
}

function qtyText(d: ProjectRabChangeBoqMaterialDiff): string {
  const uom = d.uomSymbol ? ` ${d.uomSymbol}` : ''
  if (d.kind === 'added') return `${d.newTotalQty ?? '—'}${uom}`
  if (d.kind === 'removed') return `was ${d.oldTotalQty ?? '—'}${uom}`
  return `${d.oldTotalQty ?? '—'} → ${d.newTotalQty ?? '—'}${uom}`
}

/** Materials added to, changed in, or removed from shop drawings by one RAB change. */
export function RabSdMaterialChanges({
  materials,
}: {
  materials: ProjectRabChangeBoqMaterialDiff[]
}) {
  const sorted = [...materials].sort(
    (a, b) =>
      a.shopDrawingItemName.localeCompare(b.shopDrawingItemName, undefined, {
        numeric: true,
      }) || (a.materialName ?? '').localeCompare(b.materialName ?? ''),
  )
  return (
    <ul className="space-y-0">
      {sorted.map((d) => (
        <li
          key={`${d.shopDrawingFileId}:${d.key}`}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-(--line) py-1.5 text-sm last:border-b-0"
        >
          <span
            className={cn(
              'inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
              changeKindBadgeClass(d.kind),
            )}
          >
            {materialChangeLabel(d)}
          </span>
          <span className="font-medium">{d.materialName ?? d.key}</span>
          <span className={cn('text-xs', hintClassName)}>
            in {d.shopDrawingItemName}
            {d.fileVersion !== null ? ` v${d.fileVersion}` : ''}
          </span>
          <span
            className={cn(
              'ml-auto text-xs tabular-nums',
              d.kind === 'removed' && 'line-through',
            )}
          >
            {qtyText(d)}
          </span>
        </li>
      ))}
    </ul>
  )
}
