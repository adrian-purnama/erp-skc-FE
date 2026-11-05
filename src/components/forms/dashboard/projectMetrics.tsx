import type { ReactNode } from 'react'
import {
  AlarmClock,
  CircleDollarSign,
  FolderKanban,
  Handshake,
  PiggyBank,
  TrendingDown,
  Wallet,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  BarList,
  ChartPanel,
  ChartSkeleton,
  EmptyNote,
  LegendKey,
  SERIES_1,
  SERIES_2,
  StatTile,
} from '#/components/forms/dashboard/widgets'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import {
  formatRupiahCompact,
  isProjectActive,
  isProjectOverBudget,
  isProjectOverdue,
  phaseForStatus,
} from '#/lib/project'
import type { ProjectListRow } from '#/lib/project'
import { daysBetweenYmd, formatJakartaDate, todayYmdJakarta, ymdInJakarta } from '#/lib/projectCalendar'
import { formatRupiah } from '#/lib/quotation'
import { cn } from '#/lib/utils'

/** S-curve actual this far below plan counts as behind schedule. */
export const BEHIND_THRESHOLD_PCT = 5
/** Spend this far ahead of progress is flagged on Cost vs progress. */
const COST_AHEAD_PCT = 10
const MILESTONE_DAYS = 14

export type ProjectMetricContext = {
  rows: ProjectListRow[]
  loading: boolean
}

export type ProjectMetric = {
  id: string
  label: string
  description: string
  /** `stat`: a headline tile. `panel`: a chart or list card. */
  kind: 'stat' | 'panel'
  defaultOn: boolean
  render: (ctx: ProjectMetricContext) => ReactNode
}

function num(value: string | null): number {
  const n = Number(value ?? '')
  return Number.isFinite(n) ? n : 0
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function active(rows: ProjectListRow[]) {
  return rows.filter((r) => isProjectActive(r.status))
}

/** Progress for cost comparison: S-curve actual, else production %, else 0. */
function progressOf(r: ProjectListRow): number {
  if (r.summary.schedule) return r.summary.schedule.actualPct
  return r.productionReleasedAt ? r.summary.productionPercent : 0
}

function ProjectNames({ rows }: { rows: ProjectListRow[] }) {
  return (
    <ul className="space-y-0.5">
      {rows.slice(0, 6).map((r) => (
        <li key={r.id}>
          {r.projectNumber} · {r.name}
        </li>
      ))}
      {rows.length > 6 ? <li>+{rows.length - 6} more</li> : null}
    </ul>
  )
}

function ProjectLink({ row }: { row: ProjectListRow }) {
  return (
    <Link
      to="/dashboard/projects/$projectId"
      params={{ projectId: row.id }}
      className="block min-w-0 truncate text-(--ink) no-underline hover:underline"
      title={`${row.projectNumber} · ${row.name}`}
    >
      {row.projectNumber}
    </Link>
  )
}

// ---------- stats ----------

function ActiveProjects({ rows, loading }: ProjectMetricContext) {
  const list = active(rows)
  const production = list.filter((r) => r.productionReleasedAt).length
  const tender = list.filter((r) => r.status === 'open').length
  return (
    <StatTile
      icon={FolderKanban}
      label="Active projects"
      loading={loading}
      value={String(list.length)}
      meta={`${tender} in tender · ${production} in production`}
    />
  )
}

function ContractWon({ rows, loading }: ProjectMetricContext) {
  const won = rows.filter((r) => r.summary.contractStatus === 'won')
  const wins = rows.filter((r) => r.status === 'win' || r.status === 'completed').length
  const decided = wins + rows.filter((r) => r.status === 'lose').length
  const value = won.reduce((s, r) => s + num(r.summary.contractValue), 0)
  return (
    <StatTile
      icon={Handshake}
      label="Contract value (won)"
      loading={loading}
      value={formatRupiahCompact(value)}
      meta={`${plural(won.length, 'contract')}${
        decided > 0 ? ` · ${Math.round((wins / decided) * 100)}% win rate` : ''
      }`}
    />
  )
}

function Pipeline({ rows, loading }: ProjectMetricContext) {
  const open = rows.filter((r) => r.status === 'open' && r.summary.contractStatus === 'issued')
  return (
    <StatTile
      icon={CircleDollarSign}
      label="Quoted pipeline"
      loading={loading}
      value={formatRupiahCompact(open.reduce((s, r) => s + num(r.summary.contractValue), 0))}
      meta={`${plural(open.length, 'open tender')} with an issued quotation`}
    />
  )
}

function PlannedMargin({ rows, loading }: ProjectMetricContext) {
  const won = rows.filter(
    (r) => r.summary.contractStatus === 'won' && r.summary.plannedMargin !== null,
  )
  const margin = won.reduce((s, r) => s + num(r.summary.plannedMargin), 0)
  const contract = won.reduce((s, r) => s + num(r.summary.contractValue), 0)
  return (
    <StatTile
      icon={PiggyBank}
      label="Planned margin"
      loading={loading}
      value={formatRupiahCompact(margin)}
      meta={
        contract > 0
          ? `${Math.round((margin / contract) * 100)}% of won contracts`
          : 'No priced RAB on won contracts'
      }
      badge={margin < 0 ? 'Negative' : undefined}
    />
  )
}

function LateProjects({ rows, loading }: ProjectMetricContext) {
  const late = active(rows).filter((r) => isProjectOverdue(r))
  return (
    <StatTile
      icon={AlarmClock}
      label="Late projects"
      loading={loading}
      value={String(late.length)}
      meta="Past deadline or planned finish"
      badge={late.length > 0 ? 'Needs attention' : undefined}
      tooltip={late.length > 0 ? <ProjectNames rows={late} /> : undefined}
    />
  )
}

function BehindSchedule({ rows, loading }: ProjectMetricContext) {
  const scheduled = active(rows).filter((r) => r.summary.schedule)
  const behind = scheduled.filter(
    (r) => (r.summary.schedule?.deviationPct ?? 0) <= -BEHIND_THRESHOLD_PCT,
  )
  return (
    <StatTile
      icon={TrendingDown}
      label="Behind schedule"
      loading={loading}
      value={String(behind.length)}
      meta={`Of ${plural(scheduled.length, 'project')} with an S-curve`}
      badge={behind.length > 0 ? `${BEHIND_THRESHOLD_PCT}%+ behind plan` : undefined}
      tooltip={behind.length > 0 ? <ProjectNames rows={behind} /> : undefined}
    />
  )
}

function OverBudget({ rows, loading }: ProjectMetricContext) {
  const over = active(rows).filter(isProjectOverBudget)
  const excess = over.reduce(
    (s, r) => s + num(r.summary.actualCost) - num(r.summary.rabTotal),
    0,
  )
  return (
    <StatTile
      icon={Wallet}
      label="Over budget"
      loading={loading}
      value={String(over.length)}
      meta={over.length > 0 ? `${formatRupiahCompact(excess)} above RAB` : 'Spend within RAB'}
      badge={over.length > 0 ? 'Over RAB' : undefined}
      tooltip={over.length > 0 ? <ProjectNames rows={over} /> : undefined}
    />
  )
}

// ---------- panels ----------

function ScheduleHealth({ rows, loading }: ProjectMetricContext) {
  const list = active(rows)
    .filter((r) => r.summary.schedule)
    .sort(
      (a, b) =>
        (a.summary.schedule?.deviationPct ?? 0) - (b.summary.schedule?.deviationPct ?? 0),
    )
    .slice(0, 6)
  return (
    <ChartPanel
      title="Schedule health"
      hint="S-curve today, most behind first"
      legend={
        <div className="flex items-center gap-3 text-xs">
          <LegendKey className={SERIES_1} label="Plan" />
          <LegendKey className={SERIES_2} label="Actual" />
        </div>
      }
    >
      {loading ? (
        <ChartSkeleton />
      ) : list.length === 0 ? (
        <EmptyNote>No active project has an S-curve plan yet.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const s = r.summary.schedule!
            const behind = s.deviationPct <= -BEHIND_THRESHOLD_PCT
            return (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs"
              >
                <ProjectLink row={r} />
                <div className="space-y-0.5">
                  <div className={cn('h-1.5 rounded-r-[4px]', SERIES_1)} style={{ width: `${s.plannedPct}%` }} />
                  <div
                    className={cn('h-1.5 rounded-r-[4px]', SERIES_2)}
                    style={{ width: `${Math.max(s.actualPct > 0 ? 1 : 0, s.actualPct)}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'tabular-nums',
                    behind ? 'font-medium text-red-700 dark:text-red-400' : 'text-(--muted)',
                  )}
                  title={`Plan ${s.plannedPct.toFixed(1)}% · Actual ${s.actualPct.toFixed(1)}%`}
                >
                  {s.deviationPct > 0 ? '+' : ''}
                  {s.deviationPct.toFixed(1)}%
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ChartPanel>
  )
}

function CostVsProgress({ rows, loading }: ProjectMetricContext) {
  const list = active(rows)
    .filter((r) => num(r.summary.rabTotal) > 0)
    .map((r) => ({
      row: r,
      spent: (num(r.summary.actualCost) / num(r.summary.rabTotal)) * 100,
      progress: progressOf(r),
    }))
    .sort((a, b) => b.spent - b.progress - (a.spent - a.progress))
    .slice(0, 6)
  return (
    <ChartPanel
      title="Cost vs progress"
      hint="RAB spent next to work done"
      legend={
        <div className="flex items-center gap-3 text-xs">
          <LegendKey className={SERIES_1} label="Progress" />
          <LegendKey className={SERIES_2} label="Spent" />
        </div>
      }
    >
      {loading ? (
        <ChartSkeleton />
      ) : list.length === 0 ? (
        <EmptyNote>No priced RAB on active projects.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {list.map(({ row, spent, progress }) => {
            const ahead = spent - progress >= COST_AHEAD_PCT
            return (
              <li key={row.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="grid cursor-default grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs">
                      <ProjectLink row={row} />
                      <div className="space-y-0.5">
                        <div
                          className={cn('h-1.5 rounded-r-[4px]', SERIES_1)}
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                        <div
                          className={cn('h-1.5 rounded-r-[4px]', SERIES_2)}
                          style={{ width: `${Math.min(100, Math.max(spent > 0 ? 1 : 0, spent))}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'tabular-nums',
                          ahead ? 'font-medium text-red-700 dark:text-red-400' : 'text-(--muted)',
                        )}
                      >
                        {Math.round(spent)}% / {Math.round(progress)}%
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={4}>
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {row.projectNumber} · {row.name}
                      </div>
                      <div>
                        Spent {formatRupiah(row.summary.actualCost)} of {formatRupiah(row.summary.rabTotal)}
                      </div>
                      <div>
                        Progress {progress.toFixed(1)}%
                        {row.summary.schedule ? ' (S-curve)' : ' (production)'}
                      </div>
                      {ahead ? <div>Spending is ahead of progress</div> : null}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      )}
    </ChartPanel>
  )
}

function UpcomingMilestones({ rows, loading }: ProjectMetricContext) {
  const today = todayYmdJakarta()
  const items = active(rows)
    .flatMap((r) => {
      const out: Array<{ row: ProjectListRow; at: string; title: string }> = []
      if (r.summary.nextMilestone) {
        out.push({ row: r, at: r.summary.nextMilestone, title: r.summary.nextMilestoneTitle ?? '' })
      }
      if (
        r.summary.deadline &&
        r.summary.deadline !== r.summary.nextMilestone &&
        ymdInJakarta(r.summary.deadline) >= today
      ) {
        out.push({ row: r, at: r.summary.deadline, title: r.summary.deadlineTitle ?? '' })
      }
      return out
    })
    .filter((m) => daysBetweenYmd(today, ymdInJakarta(m.at)) <= MILESTONE_DAYS)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 7)
  return (
    <ChartPanel title="Upcoming milestones" hint={`Deadlines in the next ${MILESTONE_DAYS} days`}>
      {loading ? (
        <ChartSkeleton />
      ) : items.length === 0 ? (
        <EmptyNote>Nothing due in the next {MILESTONE_DAYS} days.</EmptyNote>
      ) : (
        <ul className="divide-y divide-(--line)">
          {items.map((m) => {
            const days = daysBetweenYmd(today, ymdInJakarta(m.at))
            return (
              <li
                key={`${m.row.id}-${m.at}`}
                className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-xs"
              >
                <span className="tabular-nums text-(--muted)">{formatJakartaDate(m.at).slice(0, 6)}</span>
                <span className="min-w-0">
                  <ProjectLink row={m.row} />
                  <span className="block truncate text-(--muted)">{m.title}</span>
                </span>
                <span
                  className={cn(
                    'tabular-nums',
                    days <= 3 ? 'font-medium text-red-700 dark:text-red-400' : 'text-(--muted)',
                  )}
                >
                  {days === 0 ? 'Today' : `in ${days}d`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ChartPanel>
  )
}

function ProjectsByStage({ rows, loading }: ProjectMetricContext) {
  const stages: Array<{ key: string; label: string; match: (r: ProjectListRow) => boolean }> = [
    { key: 'tender', label: 'Tender', match: (r) => r.status === 'open' },
    {
      key: 'internal',
      label: 'Internal',
      match: (r) => r.status === 'win' && phaseForStatus(r.status, r.productionReleasedAt) === 'internal',
    },
    {
      key: 'production',
      label: 'Production',
      match: (r) => r.status === 'win' && phaseForStatus(r.status, r.productionReleasedAt) === 'production',
    },
    { key: 'completed', label: 'Completed', match: (r) => r.status === 'completed' },
    { key: 'lost', label: 'Lost / closed', match: (r) => r.status === 'lose' || r.status === 'close' },
  ]
  const wins = rows.filter((r) => r.status === 'win' || r.status === 'completed').length
  const decided = wins + rows.filter((r) => r.status === 'lose').length
  return (
    <ChartPanel
      title="Projects by stage"
      hint={decided > 0 ? `Win rate ${Math.round((wins / decided) * 100)}% of decided tenders` : 'No decided tenders yet'}
    >
      <BarList
        loading={loading}
        items={stages.map((s) => {
          const value = rows.filter(s.match).length
          return {
            key: s.key,
            label: s.label,
            value,
            display: String(value),
            tooltip: `${s.label}: ${plural(value, 'project')}`,
          }
        })}
      />
    </ChartPanel>
  )
}

function TopCustomers({ rows, loading }: ProjectMetricContext) {
  const totals = new Map<string, number>()
  for (const r of rows) {
    if (r.summary.contractStatus !== 'won') continue
    const name = r.customerName || 'Unknown customer'
    totals.set(name, (totals.get(name) ?? 0) + num(r.summary.contractValue))
  }
  const items = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({
      key: label,
      label,
      value,
      display: formatRupiahCompact(value),
      tooltip: formatRupiah(String(Math.round(value))),
    }))
  return (
    <ChartPanel title="Top customers" hint="Won contract value">
      <BarList loading={loading} items={items} empty="No won contracts yet." />
    </ChartPanel>
  )
}

function BudgetVsActual({ rows, loading }: ProjectMetricContext) {
  const list = active(rows)
    .filter((r) => num(r.summary.rabTotal) > 0)
    .sort((a, b) => num(b.summary.rabTotal) - num(a.summary.rabTotal))
    .slice(0, 6)
  const max = Math.max(
    1,
    ...list.map((r) => Math.max(num(r.summary.rabTotal), num(r.summary.actualCost))),
  )
  return (
    <ChartPanel
      title="Budget vs actual"
      hint="Largest active RABs, in rupiah"
      legend={
        <div className="flex items-center gap-3 text-xs">
          <LegendKey className={SERIES_1} label="RAB" />
          <LegendKey className={SERIES_2} label="Actual" />
        </div>
      }
    >
      {loading ? (
        <ChartSkeleton />
      ) : list.length === 0 ? (
        <EmptyNote>No priced RAB on active projects.</EmptyNote>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => {
            const rab = num(r.summary.rabTotal)
            const actual = num(r.summary.actualCost)
            const over = isProjectOverBudget(r)
            return (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-xs"
                title={`RAB ${formatRupiah(r.summary.rabTotal)} · Actual ${formatRupiah(r.summary.actualCost)}`}
              >
                <ProjectLink row={r} />
                <div className="space-y-0.5">
                  <div className={cn('h-1.5 rounded-r-[4px]', SERIES_1)} style={{ width: `${(rab / max) * 100}%` }} />
                  <div
                    className={cn('h-1.5 rounded-r-[4px]', SERIES_2)}
                    style={{ width: `${actual > 0 ? Math.max(1, (actual / max) * 100) : 0}%` }}
                  />
                </div>
                <span
                  className={cn(
                    'tabular-nums',
                    over ? 'font-medium text-red-700 dark:text-red-400' : 'text-(--muted)',
                  )}
                >
                  {Math.round((actual / rab) * 100)}%
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ChartPanel>
  )
}

/** Every metric the project dashboard can show, in display order. */
export const PROJECT_METRICS: ProjectMetric[] = [
  { id: 'active-projects', label: 'Active projects', description: 'Open and won projects, by tender and production', kind: 'stat', defaultOn: true, render: (c) => <ActiveProjects {...c} /> },
  { id: 'contract-won', label: 'Contract value (won)', description: 'Won contract value and win rate', kind: 'stat', defaultOn: true, render: (c) => <ContractWon {...c} /> },
  { id: 'planned-margin', label: 'Planned margin', description: 'Contract minus RAB on won projects', kind: 'stat', defaultOn: true, render: (c) => <PlannedMargin {...c} /> },
  { id: 'late-projects', label: 'Late projects', description: 'Past a tender deadline or the planned finish', kind: 'stat', defaultOn: true, render: (c) => <LateProjects {...c} /> },
  { id: 'behind-schedule', label: 'Behind schedule', description: `S-curve actual ${BEHIND_THRESHOLD_PCT}%+ below plan`, kind: 'stat', defaultOn: true, render: (c) => <BehindSchedule {...c} /> },
  { id: 'pipeline', label: 'Quoted pipeline', description: 'Open tenders with an issued quotation', kind: 'stat', defaultOn: false, render: (c) => <Pipeline {...c} /> },
  { id: 'over-budget', label: 'Over budget', description: 'Active projects spending above RAB', kind: 'stat', defaultOn: false, render: (c) => <OverBudget {...c} /> },
  { id: 'schedule-health', label: 'Schedule health', description: 'Plan vs actual per project from the S-curve', kind: 'panel', defaultOn: true, render: (c) => <ScheduleHealth {...c} /> },
  { id: 'cost-vs-progress', label: 'Cost vs progress', description: 'RAB spent next to work done', kind: 'panel', defaultOn: true, render: (c) => <CostVsProgress {...c} /> },
  { id: 'upcoming-milestones', label: 'Upcoming milestones', description: `Deadlines in the next ${MILESTONE_DAYS} days`, kind: 'panel', defaultOn: true, render: (c) => <UpcomingMilestones {...c} /> },
  { id: 'projects-by-stage', label: 'Projects by stage', description: 'Tender → production → completed, with win rate', kind: 'panel', defaultOn: true, render: (c) => <ProjectsByStage {...c} /> },
  { id: 'top-customers', label: 'Top customers', description: 'Largest won contract value', kind: 'panel', defaultOn: false, render: (c) => <TopCustomers {...c} /> },
  { id: 'budget-vs-actual', label: 'Budget vs actual', description: 'RAB and actual spend in rupiah', kind: 'panel', defaultOn: false, render: (c) => <BudgetVsActual {...c} /> },
]
