import type { ProjectShopDrawingBoqFinishPlacement } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type StackViewerLine = {
  materialItemId: string
}

export type StackViewerFinishing = {
  placement: ProjectShopDrawingBoqFinishPlacement
  finishingOrder: number
  lines: StackViewerLine[]
}

export type StackViewerBase = {
  key: string
  line: StackViewerLine
  finishings: StackViewerFinishing[]
}

export type StackViewerPart = {
  key: string
  label: string
  bases: StackViewerBase[]
}

export type StackViewerMaterial = {
  id: string
  name: string
}

type StackRow =
  | { kind: 'finish'; key: string; label: string }
  | {
      kind: 'base'
      key: string
      partLabel: string
      materialLabel: string
      tone: number
    }

type Props = {
  parts: StackViewerPart[]
  materials: StackViewerMaterial[]
  className?: string
}

function materialName(
  materials: StackViewerMaterial[],
  materialItemId: string,
): string {
  if (!materialItemId) return '—'
  return materials.find((m) => m.id === materialItemId)?.name ?? '—'
}

function lineNames(
  materials: StackViewerMaterial[],
  lines: StackViewerLine[],
): string {
  const names = lines
    .map((l) => materialName(materials, l.materialItemId))
    .filter((n) => n && n !== '—')
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]!
  return `${names[0]} +${names.length - 1}`
}

function finishingLabel(
  finishing: StackViewerFinishing,
  materials: StackViewerMaterial[],
): string {
  const fromLines = lineNames(materials, finishing.lines)
  if (fromLines) return fromLines
  return finishing.placement === 'top' ? 'Finishing atas' : 'Finishing bawah'
}

function expandPart(
  part: StackViewerPart,
  materials: StackViewerMaterial[],
  tone: number,
): StackRow[] {
  const partLabel = part.label.trim()
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
      })
    }
    const materialLabel = materialName(materials, base.line.materialItemId)
    rows.push({
      kind: 'base',
      key: base.key,
      partLabel: partLabel
        ? part.bases.length > 1
          ? `${partLabel} · ${baseIndex + 1}`
          : partLabel
        : '',
      materialLabel,
      tone,
    })
    for (const f of bottom) {
      rows.push({
        kind: 'finish',
        key: `${base.key}-b-${f.finishingOrder}`,
        label: finishingLabel(f, materials),
      })
    }
  })
  return rows
}

function buildRows(
  parts: StackViewerPart[],
  materials: StackViewerMaterial[],
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

export default function ShopDrawingBoqStackViewer({
  parts,
  materials,
  className,
}: Props) {
  const rows = buildRows(parts, materials)

  if (parts.length === 0) {
    return (
      <p className={cn('text-sm', hintClassName, className)}>
        Add bases to see the stack preview.
      </p>
    )
  }

  return (
    <div className={cn('space-y-1', className)} aria-label="BOQ stack preview">
      <p className="mb-3 text-[11px] tracking-wide text-(--muted)">Preview</p>
      <div className="space-y-1.5">
        {rows.map((row) => {
          if (row.kind === 'finish') {
            return (
              <div key={row.key} className="flex items-stretch gap-3">
                <div className="w-[55%] min-w-[8rem] rounded-sm border border-[#e0b8a8] bg-[#f3ddd2] px-2 py-1.5" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="hidden h-px w-4 shrink-0 border-t border-dashed border-(--muted) sm:block"
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
                  'w-[55%] min-w-[8rem] rounded-sm border px-2 py-4',
                  BASE_TONES[row.tone] ?? BASE_TONES[0],
                )}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className="hidden h-px w-4 shrink-0 border-t border-dashed border-(--muted) sm:block"
                  aria-hidden
                />
                <span className="truncate text-sm">
                  {row.partLabel ? (
                    <>
                      <span className="font-medium">{row.partLabel}</span>
                      {row.materialLabel && row.materialLabel !== '—' ? (
                        <>
                          {' · '}
                          <span>{row.materialLabel}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="font-medium">
                      {row.materialLabel && row.materialLabel !== '—'
                        ? row.materialLabel
                        : 'Base'}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
