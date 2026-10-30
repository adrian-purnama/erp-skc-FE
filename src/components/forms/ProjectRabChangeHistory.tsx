import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  ChevronDown,
  ChevronRight,
  History,
  LoaderCircle,
  UserRound,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  changeKindBadgeClass,
  changeKindLabel,
  formatCostingWhen,
} from '#/components/forms/costingStatus'
import { RabSdMaterialChanges } from '#/components/forms/RabSdMaterialChanges'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { apiFetch, toAbsoluteMediaUrl } from '#/lib/api'
import type {
  ProjectRabChangeDetail,
  ProjectRabChangeLineDiff,
  ProjectRabChangeSummary,
  ProjectRabLockOrigin,
  ProjectRabUserRef,
} from '#/lib/project'
import { hintClassName, metaTextClassName } from '#/lib/ui-classes'
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

const LOCK_ORIGIN_ID = '__lock_origin__'

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

function relativeWhen(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const sec = Math.round((Date.now() - t) / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  return ''
}

function titleFor(change: ProjectRabChangeSummary): string {
  if (change.status === 'committed') {
    return change.revision !== null
      ? `Revision ${change.revision} committed`
      : 'Change committed'
  }
  if (change.status === 'draft') return 'Change in progress'
  return 'Change discarded'
}

function UserAvatar({
  user,
  size = 'md',
}: {
  user: ProjectRabUserRef
  size?: 'sm' | 'md'
}) {
  const src = toAbsoluteMediaUrl(user.profilePicture ?? null)
  const dim = size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn(
          dim,
          'shrink-0 rounded-full object-cover ring-1 ring-(--line)',
        )}
      />
    )
  }
  const initials = user.name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
  return (
    <span
      className={cn(
        dim,
        'inline-flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,white)] font-semibold text-(--ink) ring-1 ring-(--line)',
      )}
      aria-hidden
    >
      {initials || <UserRound className="size-3.5" />}
    </span>
  )
}

/** Toolbar button + sheet: lock origin and later RAB changes. */
export default function ProjectRabChangeHistory({
  projectId,
  refreshKey,
}: Props) {
  const [rows, setRows] = useState<ProjectRabChangeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<
    Record<string, ProjectRabChangeDetail>
  >({})
  const [lockOrigin, setLockOrigin] = useState<ProjectRabLockOrigin | null>(
    null,
  )
  const [lockOriginLoaded, setLockOriginLoaded] = useState(false)
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
      setDetails((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([, d]) => d.status !== 'draft'),
        ),
      )
      setLockOrigin(null)
      setLockOriginLoaded(false)
    } catch {
      setError('Unable to reach the server')
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const ensureLockOrigin = useCallback(async (): Promise<ProjectRabLockOrigin | null> => {
    if (lockOriginLoaded) return lockOrigin
    setLoadingId(LOCK_ORIGIN_ID)
    try {
      const res = await apiFetch<ProjectRabLockOrigin | null>(
        `/project/${projectId}/rab/lock-origin`,
      )
      if (!res.success) {
        toast.error(res.message || 'Failed to load lock details')
        return null
      }
      setLockOrigin(res.data)
      setLockOriginLoaded(true)
      return res.data
    } catch {
      toast.error('Unable to reach the server')
      return null
    } finally {
      setLoadingId(null)
    }
  }, [lockOrigin, lockOriginLoaded, projectId])

  useEffect(() => {
    if (!sheetOpen || lockOriginLoaded) return
    void ensureLockOrigin()
  }, [sheetOpen, lockOriginLoaded, ensureLockOrigin])

  async function toggleExpand(change: ProjectRabChangeSummary) {
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

  async function toggleLockOrigin() {
    if (openId === LOCK_ORIGIN_ID) {
      setOpenId(null)
      return
    }
    setOpenId(LOCK_ORIGIN_ID)
    await ensureLockOrigin()
  }

  const busyList = rows === null && !error

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5"
        disabled={busyList || Boolean(error)}
        onClick={() => setSheetOpen(true)}
      >
        <History className="size-3.5" aria-hidden />
        View activity
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        >
          <SheetHeader className="shrink-0 border-b border-(--line) px-5 py-4 pr-12">
            <SheetTitle>Change activity</SheetTitle>
            <SheetDescription>
              First lock and every later change — who, when, and what differed.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {error ? (
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
            ) : rows === null ? (
              <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Loading activity…
              </p>
            ) : (
              <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-(--line)">
                {rows.map((change, index) => {
                  const expanded = openId === change.id
                  const detail = details[change.id]
                  const whenIso = change.committedAt ?? change.openedAt
                  const relative = relativeWhen(whenIso)
                  const isLatest = index === 0

                  return (
                    <li key={change.id} className="relative pl-10">
                      <span
                        className={cn(
                          'absolute top-1 left-1.5 flex size-5 items-center justify-center rounded-full ring-2 ring-white',
                          isLatest && change.status === 'draft'
                            ? 'bg-amber-500'
                            : change.status === 'committed'
                              ? 'bg-emerald-500'
                              : change.status === 'discarded'
                                ? 'bg-(--muted)'
                                : 'bg-(--ink)',
                        )}
                        aria-hidden
                      />
                      <ActivityCard
                        title={titleFor(change)}
                        whenIso={whenIso}
                        relative={relative}
                        statusBadge={
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                              STATUS_CLASS[change.status],
                            )}
                          >
                            {statusLabel(change)}
                          </span>
                        }
                        reason={change.reason}
                        people={[
                          { label: 'Opened by', user: change.openedBy },
                          ...(change.committedBy
                            ? [
                                {
                                  label: 'Committed by',
                                  user: change.committedBy,
                                },
                              ]
                            : []),
                        ]}
                        expanded={expanded}
                        loading={loadingId === change.id || (expanded && !detail)}
                        onToggle={() => void toggleExpand(change)}
                      >
                        {detail ? <ChangeDetail detail={detail} /> : null}
                      </ActivityCard>
                    </li>
                  )
                })}

                <li className="relative pl-10">
                  <span
                    className="absolute top-1 left-1.5 flex size-5 items-center justify-center rounded-full bg-sky-500 ring-2 ring-white"
                    aria-hidden
                  />
                  <ActivityCard
                    title="RAB locked"
                    whenIso={lockOrigin?.lockedAt ?? null}
                    relative={
                      lockOrigin ? relativeWhen(lockOrigin.lockedAt) : ''
                    }
                    statusBadge={
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-900 ring-1 ring-inset ring-sky-200">
                        First creation
                      </span>
                    }
                    reason="Initial locked baseline"
                    people={
                      lockOrigin
                        ? [{ label: 'Locked by', user: lockOrigin.lockedBy }]
                        : []
                    }
                    expanded={openId === LOCK_ORIGIN_ID}
                    loading={
                      openId === LOCK_ORIGIN_ID &&
                      (loadingId === LOCK_ORIGIN_ID || !lockOriginLoaded)
                    }
                    onToggle={() => void toggleLockOrigin()}
                    expandLabel="Show what was added"
                    collapseLabel="Hide lines"
                  >
                    {lockOrigin ? <LockOriginDetail origin={lockOrigin} /> : null}
                  </ActivityCard>
                </li>
              </ol>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function ActivityCard({
  title,
  whenIso,
  relative,
  statusBadge,
  reason,
  people,
  expanded,
  loading,
  onToggle,
  expandLabel = 'Show what changed',
  collapseLabel = 'Hide changes',
  children,
}: {
  title: string
  whenIso: string | null
  relative: string
  statusBadge: ReactNode
  reason: string
  people: Array<{ label: string; user: ProjectRabUserRef }>
  expanded: boolean
  loading: boolean
  onToggle: () => void
  expandLabel?: string
  collapseLabel?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-(--ink)">{title}</p>
        {whenIso ? (
          <p className={cn('text-xs', hintClassName)}>
            {formatCostingWhen(whenIso)}
            {relative ? ` · ${relative}` : ''}
          </p>
        ) : (
          <p className={cn('text-xs', hintClassName)}>
            Expand to load lock details
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-(--line) bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge}
          <span className={metaTextClassName}>Reason</span>
          <span className="text-sm text-(--ink)">{reason}</span>
        </div>

        {people.length > 0 ? (
          <div className="space-y-2 text-sm">
            {people.map((p) => (
              <div key={p.label} className="flex items-center gap-2">
                <span className={cn('w-28 shrink-0', hintClassName)}>
                  {p.label}
                </span>
                <UserAvatar user={p.user} size="sm" />
                <span className="truncate font-medium">{p.user.name}</span>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-(--line) bg-(--surface) px-3 py-2 text-left text-sm font-medium text-(--ink) transition hover:border-(--ink)"
        >
          <span>{expanded ? collapseLabel : expandLabel}</span>
          {expanded ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden />
          )}
        </button>

        {expanded ? (
          <div className="border-t border-(--line) pt-3">
            {loading ? (
              <p
                className={cn('flex items-center gap-2 text-xs', hintClassName)}
              >
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Loading…
              </p>
            ) : (
              children
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function LockOriginDetail({ origin }: { origin: ProjectRabLockOrigin }) {
  return (
    <div className="space-y-3 text-xs">
      <p className="tabular-nums">
        Total at lock{' '}
        <span className="font-medium">{rupiah(origin.grandTotal)}</span>
        <span className={hintClassName}>
          {' '}
          · {origin.lines.length} line{origin.lines.length === 1 ? '' : 's'}
        </span>
      </p>
      {origin.lines.length === 0 ? (
        <p className={hintClassName}>No lines on the locked RAB.</p>
      ) : (
        <LineDiffTable rows={origin.lines} />
      )}
    </div>
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

      {detail.boqMaterialDiff.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">Shop drawing materials</h4>
          <RabSdMaterialChanges materials={detail.boqMaterialDiff} />
        </section>
      ) : null}

      {detail.lineDiff.length > 0 ? (
        <section className="space-y-1">
          <h4 className="font-medium">RAB lines</h4>
          <LineDiffTable rows={detail.lineDiff} />
        </section>
      ) : null}
    </div>
  )
}

function LineDiffTable({
  rows,
}: {
  rows: Array<
    ProjectRabChangeLineDiff & {
      materialCode?: string | null
      uomSymbol?: string | null
    }
  >
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left">
        <thead className={hintClassName}>
          <tr>
            <th className="py-1 pr-2 font-medium">Change</th>
            <th className="py-1 pr-2 font-medium">Material</th>
            <th className="py-1 pr-2 text-right font-medium">Qty</th>
            <th className="py-1 text-right font-medium">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.key} className="border-t border-(--line)">
              <td className="py-1 pr-2">
                <KindBadge kind={d.kind} />
              </td>
              <td className="py-1 pr-2">
                {d.materialCode ? (
                  <span className={hintClassName}>{d.materialCode} · </span>
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
