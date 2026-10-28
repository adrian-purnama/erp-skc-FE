import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, LoaderCircle, Pencil } from 'lucide-react'
import ProjectStatusChip from '#/components/forms/ProjectStatusChip'
import { Combobox } from '#/components/ui/combobox'
import {
  PROJECT_CLOSE_REASON_LABELS,
  PROJECT_CLOSE_REASONS,
  PROJECT_LOSE_REASON_LABELS,
  PROJECT_LOSE_REASONS,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  phaseForStatus,
  type ProjectCloseReason,
  type ProjectDetail,
  type ProjectLoseReason,
  type ProjectStatus,
} from '#/lib/project'
import { hintClassName, metaTextClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  project: ProjectDetail
  canManage: boolean
  statusSaving: boolean
  onSaveStatus: (patch: {
    status: ProjectStatus
    loseReason: ProjectLoseReason | null
    closeReason: ProjectCloseReason | null
  }) => void
}

export default function ProjectSideNavPanel({
  project,
  canManage,
  statusSaving,
  onSaveStatus,
}: Props) {
  const statusOptions = useMemo(
    () =>
      PROJECT_STATUSES.map((value) => ({
        value,
        label: PROJECT_STATUS_LABELS[value],
      })),
    [],
  )

  const loseReasonOptions = useMemo(
    () =>
      PROJECT_LOSE_REASONS.map((value) => ({
        value,
        label: PROJECT_LOSE_REASON_LABELS[value],
      })),
    [],
  )

  const closeReasonOptions = useMemo(
    () =>
      PROJECT_CLOSE_REASONS.map((value) => ({
        value,
        label: PROJECT_CLOSE_REASON_LABELS[value],
      })),
    [],
  )

  const contactEntries = Object.entries(project.customerContact.contact ?? {})

  return (
    <div className="-mx-3 -my-3 flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <div className="min-w-0 space-y-1.5 px-1">
          <h2 className="truncate text-sm font-medium tracking-tight">
            {project.name}
          </h2>
          <p className="text-[11px] tabular-nums text-(--muted)">
            {project.projectNumber}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <ProjectStatusChip status={project.status} />
            <span className={cn('text-[10px]', hintClassName)}>
              {PROJECT_PHASE_LABELS[
                  phaseForStatus(project.status, project.productionReleasedAt)
                ]}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 px-1">
          <p className={metaTextClassName}>
            Status
          </p>
          {canManage ? (
            <div className="space-y-1.5">
              <Combobox
                value={project.status}
                onValueChange={(value) => {
                  if (
                    !PROJECT_STATUSES.includes(value as ProjectStatus) ||
                    statusSaving
                  ) {
                    return
                  }
                  const next = value as ProjectStatus
                  if (next === 'lose') {
                    onSaveStatus({
                      status: next,
                      loseReason: project.loseReason ?? PROJECT_LOSE_REASONS[0],
                      closeReason: null,
                    })
                    return
                  }
                  if (next === 'close') {
                    onSaveStatus({
                      status: next,
                      loseReason: null,
                      closeReason:
                        project.closeReason ?? PROJECT_CLOSE_REASONS[0],
                    })
                    return
                  }
                  onSaveStatus({
                    status: next,
                    loseReason: null,
                    closeReason: null,
                  })
                }}
                options={statusOptions}
                placeholder="Status…"
                searchPlaceholder="Search status…"
                emptyText="No status found."
                aria-label="Project status"
                className="sm:w-full"
              />
              {project.status === 'lose' ? (
                <Combobox
                  value={project.loseReason ?? ''}
                  onValueChange={(value) => {
                    if (
                      !PROJECT_LOSE_REASONS.includes(
                        value as ProjectLoseReason,
                      ) ||
                      statusSaving
                    ) {
                      return
                    }
                    onSaveStatus({
                      status: 'lose',
                      loseReason: value as ProjectLoseReason,
                      closeReason: null,
                    })
                  }}
                  options={loseReasonOptions}
                  placeholder="Lose reason…"
                  searchPlaceholder="Search reason…"
                  emptyText="No reason found."
                  aria-label="Lose reason"
                  className="sm:w-full"
                />
              ) : null}
              {project.status === 'close' ? (
                <Combobox
                  value={project.closeReason ?? ''}
                  onValueChange={(value) => {
                    if (
                      !PROJECT_CLOSE_REASONS.includes(
                        value as ProjectCloseReason,
                      ) ||
                      statusSaving
                    ) {
                      return
                    }
                    onSaveStatus({
                      status: 'close',
                      loseReason: null,
                      closeReason: value as ProjectCloseReason,
                    })
                  }}
                  options={closeReasonOptions}
                  placeholder="Close reason…"
                  searchPlaceholder="Search reason…"
                  emptyText="No reason found."
                  aria-label="Close reason"
                  className="sm:w-full"
                />
              ) : null}
              {statusSaving ? (
                <p
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[11px]',
                    hintClassName,
                  )}
                >
                  <LoaderCircle className="size-3 animate-spin" aria-hidden />
                  Saving…
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1">
              {project.status === 'lose' && project.loseReason ? (
                <p className={cn('text-xs', hintClassName)}>
                  Lose: {PROJECT_LOSE_REASON_LABELS[project.loseReason]}
                </p>
              ) : null}
              {project.status === 'close' && project.closeReason ? (
                <p className={cn('text-xs', hintClassName)}>
                  Close: {PROJECT_CLOSE_REASON_LABELS[project.closeReason]}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-(--line) px-1 pt-3 text-xs">
          {project.description ? (
            <p className="line-clamp-4 leading-relaxed text-(--ink)/75">
              {project.description}
            </p>
          ) : null}

          <div className="space-y-0.5">
            <p className={metaTextClassName}>
              Customer
            </p>
            <p className="truncate text-(--ink)/75">
              {project.customerName || '—'}
            </p>
          </div>

          <div className="space-y-0.5">
            <p className={metaTextClassName}>
              Contact
            </p>
            <p className="text-(--ink)/65">
              {project.customerContact.name}
              <span className="text-(--muted)">
                {' · '}
                <span className="capitalize">
                  {project.customerContact.gender}
                </span>
              </span>
            </p>
            {contactEntries.length > 0 ? (
              <dl className="space-y-0.5 pt-0.5 text-[11px] text-(--muted)">
                {contactEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-1.5">
                    <dt className="truncate opacity-80">{key}</dt>
                    <dd className="truncate text-(--ink)/55">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col border-t border-(--line)">
        <Link
          to="/dashboard/projects"
          className="inline-flex items-center gap-2 px-4 py-2 text-xs text-(--muted) no-underline hover:bg-(--surface) hover:text-(--ink)"
        >
          <ArrowLeft className="size-3.5 shrink-0" aria-hidden />
          Back to projects
        </Link>
        {canManage ? (
          <Link
            to="/dashboard/projects/$projectId/edit"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-2 border-t border-(--line) px-4 py-2 text-xs text-(--muted) no-underline hover:bg-(--surface) hover:text-(--ink)"
          >
            <Pencil className="size-3.5 shrink-0" aria-hidden />
            Edit project
          </Link>
        ) : null}
      </div>
    </div>
  )
}
