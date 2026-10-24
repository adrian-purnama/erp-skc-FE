import type { ProjectShopDrawingBoqFinishPlacement } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type SandwichPreviewLine = {
  materialItemId: string
}

type SandwichPreviewFinishing = {
  placement: ProjectShopDrawingBoqFinishPlacement
  finishingOrder: number
  lines: SandwichPreviewLine[]
}

type SandwichPreviewBase = {
  key: string
  line: SandwichPreviewLine
  finishings: SandwichPreviewFinishing[]
}

type SandwichPreviewPart = {
  key: string
  label: string
  bases: SandwichPreviewBase[]
}

type SandwichPreviewMaterial = {
  id: string
  name: string
}

type StackRow =
  | { kind: 'finish'; key: string; label: string; baseKey: string }
  | {
      kind: 'base'
      key: string
      partLabel: string
      materialLabel: string
      tone: number
    }

type Props = {
  parts: SandwichPreviewPart[]
  materials: SandwichPreviewMaterial[]
  activeBaseKey?: string | null
  className?: string
}

function materialName(
  materials: SandwichPreviewMaterial[],
  materialItemId: string,
): string {
  if (!materialItemId) return '—'
  return materials.find((m) => m.id === materialItemId)?.name ?? '—'
}

function lineNames(
  materials: SandwichPreviewMaterial[],
  lines: SandwichPreviewLine[],
): string {
  const names = lines
    .map((l) => materialName(materials, l.materialItemId))
    .filter((n) => n && n !== '—')
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names[0]} +${names.length - 1}`
}

function finishingLabel(
  finishing: SandwichPreviewFinishing,
  materials: SandwichPreviewMaterial[],
): string {
  const fromLines = lineNames(materials, finishing.lines)
  if (fromLines) return fromLines
  return finishing.placement === 'top' ? 'Layer above' : 'Layer below'
}

function expandPart(
  part: SandwichPreviewPart,
  materials: SandwichPreviewMaterial[],
  tone: number,
): StackRow[] {
  const partLabel = part.label.trim() || 'Core'
  const rows: StackRow[] = []
  part.bases.forEach((base, baseIndex) => {
    const top = [...base.finishings]
      .filter((f) => f.placement === 'top')
      .sort((a, b) => b.finishingOrder - a.finishingOrder)
    const bottom = [...base.finishings]
      .filter((f) => f.placement === 'bottom')
      .sort((a, b) => a.finishingOrder - b.finishingOrder)

    for (const f of top) {
      rows.push({
        kind: 'finish',
        key: `${base.key}-t-${f.finishingOrder}`,
        label: finishingLabel(f, materials),
        baseKey: base.key,
      })
    }
    rows.push({
      kind: 'base',
      key: base.key,
      partLabel:
        part.bases.length > 1
          ? `${partLabel} · ${baseIndex + 1}`
          : partLabel,
      materialLabel: materialName(materials, base.line.materialItemId),
      tone,
    })
    for (const f of bottom) {
      rows.push({
        kind: 'finish',
        key: `${base.key}-b-${f.finishingOrder}`,
        label: finishingLabel(f, materials),
        baseKey: base.key,
      })
    }
  })
  return rows
}

function buildRows(
  parts: SandwichPreviewPart[],
  materials: SandwichPreviewMaterial[],
): StackRow[] {
  const rows: StackRow[] = []
  parts.forEach((part, index) => {
    rows.push(...expandPart(part, materials, index % 2))
  })
  return rows
}

const BASE_TONES = [
  'bg-[#e8dfd0] border-[#c9b89a]',
  'bg-[#d7e6d9] border-[#a8c4ad]',
] as const

export default function ShopDrawingBoqSandwichPreview({
  parts,
  materials,
  activeBaseKey,
  className,
}: Props) {
  const rows = buildRows(parts, materials)
  const hasBases = parts.some((p) => p.bases.length > 0)

  if (!hasBases) {
    return (
      <p className={cn('text-sm', hintClassName, className)}>
        Add a core to see the stack preview.
      </p>
    )
  }

  return (
    <div className={cn('space-y-1', className)} aria-label="BOQ stack preview">
      <p className="mb-3 text-[11px] tracking-wide text-(--muted)">
        Preview · outside → core → outside
      </p>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const active =
            row.kind === 'base'
              ? row.key === activeBaseKey
              : row.baseKey === activeBaseKey

          if (row.kind === 'finish') {
            return (
              <div key={row.key} className="flex items-stretch gap-3">
                <div
                  className={cn(
                    'w-[45%] min-w-[5rem] rounded-sm border border-[#e0b8a8] bg-[#f3ddd2] px-2 py-1.5',
                    active && 'ring-1 ring-(--ink)/25',
                  )}
                />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="hidden h-px w-3 shrink-0 border-t border-dashed border-(--muted) sm:block"
                    aria-hidden
                  />
                  <span className="truncate text-sm">{row.label}</span>
                </div>
              </div>
            )
          }

          return (
            <div key={row.key} className="flex items-stretch gap-3">
              <div
                className={cn(
                  'w-[45%] min-w-[5rem] rounded-sm border px-2 py-4',
                  BASE_TONES[row.tone] ?? BASE_TONES[0],
                  active && 'ring-1 ring-(--ink)/35',
                )}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="hidden h-px w-3 shrink-0 border-t border-dashed border-(--muted) sm:block"
                  aria-hidden
                />
                <span className="truncate text-sm">
                  <span className="font-medium">{row.partLabel}</span>
                  {row.materialLabel && row.materialLabel !== '—' ? (
                    <>
                      {' · '}
                      <span>{row.materialLabel}</span>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
