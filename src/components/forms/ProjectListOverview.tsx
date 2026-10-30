import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Handshake,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  formatRupiahCompact,
  isProjectActive,
  isProjectOverBudget,
  isProjectOverdue,
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  phaseForStatus,
  type ProjectListRow,
} from '#/lib/project'
import { formatRupiah } from '#/lib/quotation'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** Reference categorical slots 1–2 (light / dark steps). */
const SERIES_1 = 'bg-[#2a78d6] dark:bg-[#3987e5]'
const SERIES_2 = 'bg-[#eb6834] dark:bg-[#d95926]'

const panelClassName =
  'rounded-lg border border-(--line) bg-(--background) p-4'

type Props = {
  rows: ProjectListRow[]
  loading: boolean
}

function num(value: string | null): number {
  const n = Number(value ?? '')
  return Number.isFinite(n) ? n : 0
}

export default function ProjectListOverview({ rows, loading }: Props) {
  const stats = useMemo(() => {
    const active = rows.filter((r) => isProjectActive(r.status))
    const won = rows.filter((r) => r.summary.contractStatus === 'won')
    const pipeline = rows.filter(
      (r) => r.status === 'open' && r.summary.contractStatus === 'issued',
    )
    const budgeted = active.filter((r) => num(r.summary.rabTotal) > 0)
    const rabSum = budgeted.reduce((s, r) => s + num(r.summary.rabTotal), 0)
    const actualSum = budgeted.reduce(
      (s, r) => s + num(r.summary.actualCost),
      0,
    )
    // Win rate over tenders with an outcome; closed/cancelled ones are left out.
    const wins = rows.filter(
      (r) => r.status === 'win' || r.status === 'completed',
    ).length
    const decided = wins + rows.filter((r) => r.status === 'lose').length

    return {
      activeCount: active.length,
      inProduction: active.filter((r) => r.productionReleasedAt).length,
      wonValue: won.reduce((s, r) => s + num(r.summary.contractValue), 0),
      wonCount: won.length,
      pipelineValue: pipeline.reduce(
        (s, r) => s + num(r.summary.contractValue),
        0,
      ),
      pipelineCount: pipeline.length,
      budgetPercent: rabSum > 0 ? Math.round((actualSum / rabSum) * 100) : 0,
      actualSum,
      rabSum,
      overBudget: active.filter(isProjectOverBudget).length,
      overdue: active.filter((r) => isProjectOverdue(r)).length,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
    }
  }, [rows])

  const byPhase = useMemo(
    () =>
      PROJECT_PHASES.map((phase) => ({
        key: phase,
        label: PROJECT_PHASE_LABELS[phase],
        value: rows.filter(
          (r) =>
            (isProjectActive(r.status) || r.status === 'completed') &&
            phaseForStatus(r.status, r.productionReleasedAt) === phase,
        ).length,
      })),
    [rows],
  )

  const byStatus = useMemo(
    () =>
      PROJECT_STATUSES.map((status) => ({
        key: status,
        label: PROJECT_STATUS_LABELS[status],
        value: rows.filter((r) => r.status === status).length,
      })),
    [rows],
  )

  const byCustomer = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of rows) {
      if (r.summary.contractStatus !== 'won') continue
      const name = r.customerName || 'Unknown customer'
      totals.set(name, (totals.get(name) ?? 0) + num(r.summary.contractValue))
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({
        key: label,
        label,
        value,
        display: formatRupiahCompact(value),
        tooltip: formatRupiah(String(Math.round(value))),
      }))
  }, [rows])

  const budgetRows = useMemo(
    () =>
      rows
        .filter((r) => isProjectActive(r.status) && num(r.summary.rabTotal) > 0)
        .sort((a, b) => num(b.summary.rabTotal) - num(a.summary.rabTotal))
        .slice(0, 6),
    [rows],
  )

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            icon={FolderKanban}
            label="Active projects"
            loading={loading}
            value={String(stats.activeCount)}
            meta={`${stats.inProduction} in production`}
          />
          <StatTile
            icon={Handshake}
            label="Contract value (won)"
            loading={loading}
            value={formatRupiahCompact(stats.wonValue)}
            meta={`${stats.wonCount} won${
              stats.winRate !== null ? ` · ${stats.winRate}% win rate` : ''
            }`}
          />
          <StatTile
            icon={Handshake}
            label="Quoted pipeline"
            loading={loading}
            value={formatRupiahCompact(stats.pipelineValue)}
            meta={`${stats.pipelineCount} open with issued quotation`}
          />
          <StatTile
            icon={Wallet}
            label="Budget used (RAB)"
            loading={loading}
            value={`${stats.budgetPercent}%`}
            meta={`${formatRupiahCompact(stats.actualSum)} of ${formatRupiahCompact(stats.rabSum)}`}
            alert={
              stats.overBudget > 0
                ? `${stats.overBudget} over budget`
                : undefined
            }
          />
          <StatTile
            icon={CalendarClock}
            label="Overdue deadlines"
            loading={loading}
            value={String(stats.overdue)}
            meta="Active projects past their deadline"
            alert={stats.overdue > 0 ? 'Needs attention' : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <ChartPanel
            title="Projects by phase"
            hint="Open, won and completed projects"
          >
            <BarList
              loading={loading}
              items={byPhase.map((d) => ({
                ...d,
                display: String(d.value),
                tooltip: `${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`,
              }))}
            />
          </ChartPanel>
          <ChartPanel
            title="Projects by status"
            hint={
              stats.winRate !== null
                ? `Win rate ${stats.winRate}% of decided projects`
                : 'No decided projects yet'
            }
          >
            <BarList
              loading={loading}
              items={byStatus.map((d) => ({
                ...d,
                display: String(d.value),
                tooltip: `${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`,
              }))}
            />
          </ChartPanel>
          <ChartPanel
            title="Top customers"
            hint="Won contract value"
          >
            <BarList
              loading={loading}
              items={byCustomer}
              empty="No won contracts yet."
            />
          </ChartPanel>
          <ChartPanel
            title="Budget vs actual"
            hint="Largest active RABs"
            legend={
              <div className="flex items-center gap-3 text-xs">
                <LegendKey className={SERIES_1} label="RAB" />
                <LegendKey className={SERIES_2} label="Actual" />
              </div>
            }
          >
            <BudgetBars rows={budgetRows} loading={loading} />
          </ChartPanel>
        </div>
      </div>
    </TooltipProvider>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  meta,
  alert,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: string
  meta: string
  alert?: string
  loading: boolean
}) {
  return (
    <div className={cn(panelClassName, 'min-w-0 space-y-1')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-(--surface)" />
      ) : (
        <div className="truncate text-2xl font-semibold tabular-nums text-(--ink)">
          {value}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('truncate text-xs', hintClassName)}>{meta}</span>
        {alert && !loading ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
            <AlertTriangle className="size-3" aria-hidden />
            {alert}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function ChartPanel({
  title,
  hint,
  legend,
  children,
}: {
  title: string
  hint: string
  legend?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cn(panelClassName, 'min-w-0 space-y-3')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-(--ink)">{title}</h2>
          <p className={cn('text-xs', hintClassName)}>{hint}</p>
        </div>
        {legend}
      </div>
      {children}
    </section>
  )
}

function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-(--ink)">
      <span className={cn('size-2.5 rounded-[2px]', className)} aria-hidden />
      {label}
    </span>
  )
}

type BarItem = {
  key: string
  label: string
  value: number
  display: string
  tooltip: string
}

/** Single-series horizontal bars; labels stay in ink, bars carry magnitude. */
function BarList({
  items,
  loading,
  empty = 'No data yet.',
}: {
  items: BarItem[]
  loading: boolean
  empty?: string
}) {
  if (loading) return <ChartSkeleton />
  const max = Math.max(0, ...items.map((i) => i.value))
  if (items.length === 0 || max === 0) {
    return <p className={cn('py-6 text-center text-sm', hintClassName)}>{empty}</p>
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="grid cursor-default grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded-sm text-xs hover:bg-(--surface)">
                <span className="truncate text-(--ink)">{item.label}</span>
                <div className="h-3">
                  {item.value > 0 ? (
                    <div
                      className={cn('h-full rounded-r-[4px]', SERIES_1)}
                      style={{ width: `${(item.value / max) * 100}%` }}
                    />
                  ) : null}
                </div>
                <span className="tabular-nums text-(--muted)">
                  {item.display}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent sideOffset={4}>{item.tooltip}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

/** Paired RAB / actual bars per project on one shared scale. */
function BudgetBars({
  rows,
  loading,
}: {
  rows: ProjectListRow[]
  loading: boolean
}) {
  if (loading) return <ChartSkeleton />
  if (rows.length === 0) {
    return (
      <p className={cn('py-6 text-center text-sm', hintClassName)}>
        No priced RAB on active projects.
      </p>
    )
  }
  const max = Math.max(
    ...rows.map((r) => Math.max(num(r.summary.rabTotal), num(r.summary.actualCost))),
  )
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const rab = num(r.summary.rabTotal)
        const actual = num(r.summary.actualCost)
        const over = isProjectOverBudget(r)
        return (
          <li key={r.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="grid cursor-default grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded-sm text-xs hover:bg-(--surface)">
                  <span className="truncate text-(--ink)">{r.projectNumber}</span>
                  <div className="space-y-0.5">
                    <div
                      className={cn('h-1.5 rounded-r-[4px]', SERIES_1)}
                      style={{ width: `${(rab / max) * 100}%` }}
                    />
                    <div
                      className={cn('h-1.5 rounded-r-[4px]', SERIES_2)}
                      style={{ width: `${actual > 0 ? Math.max(1, (actual / max) * 100) : 0}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 tabular-nums',
                      over ? 'font-medium text-red-700 dark:text-red-400' : 'text-(--muted)',
                    )}
                  >
                    {over ? <AlertTriangle className="size-3" aria-hidden /> : null}
                    {Math.round((actual / rab) * 100)}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent sideOffset={4}>
                <div className="space-y-0.5">
                  <div className="font-medium">
                    {r.projectNumber} · {r.name}
                  </div>
                  <div>RAB: {formatRupiah(r.summary.rabTotal)}</div>
                  <div>Actual: {formatRupiah(r.summary.actualCost)}</div>
                  {over ? <div>Over budget</div> : null}
                </div>
              </TooltipContent>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}

function ChartSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-(--surface)" />
      ))}
    </div>
  )
}
