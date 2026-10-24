import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  changeKindBadgeClass,
  changeKindLabel,
  formatCostingWhen,
} from '#/components/forms/costingStatus'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import type {
  ProjectRabChangeDetail,
  ProjectRabChangeSummary,
} from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  /** Changes whenever the RAB moves (lock, commit, discard, open) to refetch. */
  refreshKey: string
}

const STATUS_CLASS: Record<ProjectRabChangeSummary['status'], string> = {
  draft: 'bg-amber-50 text-amber-900 ring-amber-200',
  committed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  discarded: 'bg-(--surface) text-(--muted) ring-(--line)',
}

function rupiah(amount: string | null): string {
  if (amount === null || amount.trim() === '') return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)}`
}

function qty(v: string | null): string {
  return v === null ? '—' : v
}

function versionLabel(v: number | null): string {
  return v === null ? 'none' : `v${v}`
}

function statusLabel(c: ProjectRabChangeSummary): string {
  if (c.status === 'committed') {
    return c.revision !== null ? `Rev ${c.revision}` : 'Committed'
  }
  return c.status === 'draft' ? 'Open' : 'Discarded'
}

/** Every change opened on the locked RAB, newest first, each expandable to its full diff. */
export default function ProjectRabChangeHistory({
  projectId,
  refreshKey,
}: Props) {
  const [rows, setRows] = useState<ProjectRabChangeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<
    Record<string, ProjectRabChangeDetail>
  >({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch<ProjectRabChangeSummary[]>(
        `/project/${projectId}/rab/changes`,
      )
      if (!res.success) {
        setError(res.message || 'Failed to load change history')
        return
      }
      setRows(res.data)
      // Details of an open draft go stale as it is edited; history ones do not.
      setDetails((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([, d]) => d.status !== 'draft'),
        ),
      )
    } catch {
      setError('Unable to reach the server')
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  async function toggle(change: ProjectRabChangeSummary) {
    if (openId === change.id) {
      setOpenId(null)
      return
    }
    setOpenId(change.id)
    if (details[change.id]) return
    setLoadingId(change.id)
    try {
      const res = await apiFetch<ProjectRabChangeDetail>(
        `/project/${projectId}/rab/changes/${change.id}`,
      )
      if (!res.success) {
        toast.error(res.message || 'Failed to load change')
        return
      }
      setDetails((prev) => ({ ...prev, [change.id]: res.data }))
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoadingId(null)
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-red-600">{error}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          Retry
        </Button>
      </div>
    )
  }
  if (!rows) {
    return (
      <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading history…
      </p>
    )
  }
  if (rows.length === 0) {
    return (
      <p className={cn('text-sm', hintClassName)}>
        No changes yet. After the RAB is locked, every opened change is recorded
        here with what it added, removed and repriced.
      </p>
    )
  }

  return (
    <ol className="divide-y divide-(--line) rounded-md border border-(--line)">
      {rows.map((change) => {
        const expanded = openId === change.id
        const detail = details[change.id]
        return (
          <li key={change.id}>
            <button
              type="button"
              onClick={() => void toggle(change)}
              aria-expanded={expanded}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-(--surface)"
            >
              {expanded ? (
                <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                      STATUS_CLASS[change.status],
                    )}
                  >
                    {statusLabel(change)}
                  </span>
                  <span className="truncate font-medium">{change.reason}</span>
                </span>
                <span className={cn('block text-xs', hintClassName)}>
                  Opened by {change.openedBy.name} ·{' '}
                  {formatCostingWhen(change.openedAt)}
                  {change.committedAt && change.committedBy
                    ? ` · committed by ${change.committedBy.name} · ${formatCostingWhen(change.committedAt)}`
                    : ''}
                </span>
              </span>
            </button>
            {expanded ? (
              <div className="border-t border-(--line) bg-(--surface)/50 px-3 py-3 pl-10">
                {loadingId === change.id || !detail ? (
                  <p
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      hintClassName,
                    )}
                  >
                    <LoaderCircle
                      className="size-3.5 animate-spin"
                      aria-hidden
                    />
                    Loading changes…
                  </p>
                ) : (
                  <ChangeDetail detail={detail} />
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function ChangeDetail({ detail }: { detail: ProjectRabChangeDetail }) {
  const before = detail.baselineGrandTotal
  const after = detail.grandTotal
  const delta =
    before !== null && after !== null ? Number(after) - Number(before) : null
  const nothing =
    detail.lineDiff.length === 0 &&
    detail.boqDiff.length === 0 &&
    detail.versionDiff.length === 0 &&
    detail.boqMaterialDiff.length === 0

  return (
    <div className="space-y-4 text-xs">
      <p className="tabular-nums">
        Total {rupiah(before)} →{' '}
        <span className="font-medium">{rupiah(after)}</span>
        {delta !== null && delta !== 0 ? (
          <span className={delta > 0 ? 'text-amber-800' : 'text-emerald-700'}>
            {' '}
            ({delta > 0 ? '+' : '−'}
            {rupiah(String(Math.abs(delta)))})
          </span>
        ) : null}
        {detail.status === 'draft' ? (
          <span className={hintClassName}>
            {' '}
            · still open, values may change
          </span>
        ) : null}
      </p>

      {nothing ? (
        <p className={hintClassName}>No differences recorded.</p>
      ) : null}

      {detail.versionDiff.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">Drawing version switched</h4>
          <ul className="space-y-0.5">
            {detail.versionDiff.map((v) => (
              <li key={v.shopDrawingItemId}>
                {v.shopDrawingItemName}: {versionLabel(v.fromVersion)} →{' '}
                {versionLabel(v.toVersion)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.boqDiff.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">BOQ</h4>
          <ul className="space-y-0.5">
            {detail.boqDiff.map((b) => (
              <li
                key={`${b.kind}-${b.shopDrawingFileId}`}
                className="flex items-center gap-2"
              >
                <KindBadge kind={b.kind} />
                {b.shopDrawingItemName}
                {b.fileVersion !== null ? ` v${b.fileVersion}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {detail.lineDiff.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">RAB lines</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead className={hintClassName}>
                <tr>
                  <th className="py-1 pr-2 font-medium">Change</th>
                  <th className="py-1 pr-2 font-medium">Material</th>
                  <th className="py-1 pr-2 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {detail.lineDiff.map((d) => (
                  <tr key={d.key} className="border-t border-(--line)">
                    <td className="py-1 pr-2">
                      <KindBadge kind={d.kind} />
                    </td>
                    <td className="py-1 pr-2">
                      {d.materialCode ? (
                        <span className={hintClassName}>
                          {d.materialCode} ·{' '}
                        </span>
                      ) : null}
                      {d.materialName ?? '—'}
                      {d.uomSymbol ? (
                        <span className={hintClassName}> ({d.uomSymbol})</span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <FromTo
                        from={qty(d.oldTotalQty)}
                        to={qty(d.newTotalQty)}
                        kind={d.kind}
                      />
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      <FromTo
                        from={rupiah(d.oldUnitPrice)}
                        to={rupiah(d.newUnitPrice)}
                        kind={d.kind}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function KindBadge({ kind }: { kind: 'added' | 'removed' | 'changed' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
        changeKindBadgeClass(kind),
      )}
    >
      {changeKindLabel(kind)}
    </span>
  )
}

function FromTo({
  from,
  to,
  kind,
}: {
  from: string
  to: string
  kind: 'added' | 'removed' | 'changed'
}) {
  if (kind === 'added') return <>{to}</>
  if (kind === 'removed') return <span className="line-through">{from}</span>
  if (from === to) return <>{to}</>
  return (
    <>
      <span className={cn('line-through', hintClassName)}>{from}</span> {to}
    </>
  )
}
