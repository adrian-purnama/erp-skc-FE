import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, Pencil } from 'lucide-react'
import ProjectStatusChip from '#/components/forms/ProjectStatusChip'
import { apiFetch } from '#/lib/api'
import {
  PROJECT_CLOSE_REASON_LABELS,
  PROJECT_LOSE_REASON_LABELS,
  formatRupiahCompact,
  isProjectOverBudget
  
  
} from '#/lib/project'
import type {ProjectDetail, ProjectSummary} from '#/lib/project';
import { formatJakartaDate } from '#/lib/projectCalendar'
import {
  buttonOutlineClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  project: ProjectDetail
  canManage: boolean
  /** Bump to refetch the numbers (status or release changed). */
  refreshKey?: number
}

/**
 * Top of a project page: who / what / where it stands, then the four
 * numbers people check first. Everything else lives in the phase below.
 */
export default function ProjectHeader({
  project,
  canManage,
  refreshKey = 0,
}: Props) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    // Child panels bump refreshKey in bursts; fetch once they settle.
    const handle = window.setTimeout(
      () =>
        void (async () => {
          try {
            const res = await apiFetch<ProjectSummary>(
              `/project/${project.id}/summary`,
            )
            if (!cancelled && res.success && res.data) setSummary(res.data)
          } catch {
            // Numbers are a convenience; the page still works without them.
          }
        })(),
      refreshKey === 0 ? 0 : 400,
    )
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [project.id, refreshKey])

  const reason =
    project.status === 'lose' && project.loseReason
      ? `Lost: ${PROJECT_LOSE_REASON_LABELS[project.loseReason]}`
      : project.status === 'close' && project.closeReason
        ? `Closed: ${PROJECT_CLOSE_REASON_LABELS[project.closeReason]}`
        : null

  return (
    <header className="space-y-5">
      <div className="space-y-2">
        <Link
          to="/dashboard/projects"
          className={cn(
            'inline-flex items-center gap-1 text-sm no-underline hover:text-(--ink)',
            hintClassName,
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />
          Projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h1 className={cn(pageTitleClassName, 'break-words')}>
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <ProjectStatusChip status={project.status} />
              <span className="text-(--ink)">
                {project.customerName || 'No customer'}
              </span>
              <span className={cn('tabular-nums', hintClassName)}>
                {project.projectNumber}
              </span>
            </div>
            {reason ? <p className="text-sm text-rose-700">{reason}</p> : null}
          </div>
          {canManage ? (
            <Link
              to="/dashboard/projects/$projectId/edit"
              params={{ projectId: project.id }}
              className={cn(
                buttonOutlineClassName,
                'inline-flex shrink-0 no-underline',
              )}
            >
              <Pencil className="size-4" aria-hidden />
              Edit
            </Link>
          ) : null}
        </div>
      </div>

      <ProjectKeyNumbers project={project} summary={summary} />
    </header>
  )
}

function ProjectKeyNumbers({
  project,
  summary,
}: {
  project: ProjectDetail
  summary: ProjectSummary | null
}) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--line) bg-(--line) lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 bg-white px-5 py-4">
            <div className="h-4 w-20 animate-pulse rounded bg-(--surface)" />
            <div className="h-7 w-28 animate-pulse rounded bg-(--surface)" />
          </div>
        ))}
      </div>
    )
  }

  const rab = Number(summary.rabTotal ?? '')
  const hasRab = Number.isFinite(rab) && rab > 0
  const actual = Number(summary.actualCost)
  const budgetPct = hasRab ? (actual / rab) * 100 : 0
  const overBudget = isProjectOverBudget({ summary })

  const deadline = summary.deadline
  const daysLeft = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000)
    : null
  const overdue =
    daysLeft !== null &&
    daysLeft < 0 &&
    (project.status === 'open' || project.status === 'win')

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--line) bg-(--line) lg:grid-cols-4">
      <KeyNumber
        label={
          summary.contractStatus === 'issued' ? 'Quoted value' : 'Contract'
        }
        value={formatRupiahCompact(summary.contractValue)}
        note={
          summary.plannedMargin !== null
            ? `Margin ${formatRupiahCompact(summary.plannedMargin)}`
            : summary.contractValue
              ? null
              : 'No quotation yet'
        }
      />
      <KeyNumber
        label="Budget used"
        value={hasRab ? `${Math.round(budgetPct)}%` : '—'}
        tone={overBudget ? 'danger' : 'neutral'}
        bar={
          hasRab
            ? { pct: budgetPct, tone: overBudget ? 'danger' : 'neutral' }
            : null
        }
        note={
          hasRab
            ? `${formatRupiahCompact(actual)} of ${formatRupiahCompact(rab)}${summary.rabStatus === 'draft' ? ' (draft RAB)' : ''}`
            : 'No RAB yet'
        }
      />
      <KeyNumber
        label="Production"
        value={
          project.productionReleasedAt
            ? `${Math.round(summary.productionPercent)}%`
            : '—'
        }
        tone={summary.productionPercent >= 100 ? 'success' : 'neutral'}
        bar={
          project.productionReleasedAt
            ? {
                pct: summary.productionPercent,
                tone: summary.productionPercent >= 100 ? 'success' : 'neutral',
              }
            : null
        }
        note={project.productionReleasedAt ? null : 'Not released yet'}
      />
      <KeyNumber
        label={summary.deadlineTitle || 'Deadline'}
        value={deadline ? formatJakartaDate(deadline) : '—'}
        tone={overdue ? 'danger' : 'neutral'}
        note={
          daysLeft === null
            ? 'No date set'
            : overdue
              ? `Overdue by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`
              : daysLeft === 0
                ? 'Today'
                : daysLeft > 0
                  ? `In ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
                  : null
        }
      />
    </dl>
  )
}

type Tone = 'neutral' | 'danger' | 'success'

const VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-(--ink)',
  danger: 'text-red-700',
  success: 'text-emerald-700',
}

const BAR_TONE: Record<Tone, string> = {
  neutral: 'bg-(--ink)',
  danger: 'bg-red-600',
  success: 'bg-emerald-600',
}

function KeyNumber({
  label,
  value,
  note,
  tone = 'neutral',
  bar = null,
}: {
  label: string
  value: string
  note: ReactNode
  tone?: Tone
  bar?: { pct: number; tone: Tone } | null
}) {
  return (
    <div className="min-w-0 space-y-1 bg-white px-5 py-4">
      <dt className={cn('truncate text-sm', hintClassName)}>{label}</dt>
      <dd
        className={cn(
          'truncate text-2xl font-semibold tabular-nums',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </dd>
      {bar ? (
        <dd
          className="h-1.5 overflow-hidden rounded-full bg-(--line)"
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(bar.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn('h-full rounded-full', BAR_TONE[bar.tone])}
            style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%` }}
          />
        </dd>
      ) : null}
      {note ? (
        <dd className={cn('truncate text-sm', hintClassName)}>{note}</dd>
      ) : null}
    </div>
  )
}
