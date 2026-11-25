import { useMemo } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Combobox } from '#/components/ui/combobox'
import {
  PROJECT_CLOSE_REASON_LABELS,
  PROJECT_CLOSE_REASONS,
  PROJECT_LOSE_REASON_LABELS,
  PROJECT_LOSE_REASONS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
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
  // Win comes from a won quotation; it is only listed when already set.
  const statusOptions = useMemo(
    () =>
      PROJECT_STATUSES.filter(
        (value) => value !== 'win' || project.status === 'win',
      ).map((value) => ({
        value,
        label: PROJECT_STATUS_LABELS[value],
      })),
    [project.status],
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
        <div className="space-y-1.5 px-1">
          <p className={metaTextClassName}>Status</p>
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
                    'inline-flex items-center gap-1.5 text-sm',
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
                <p className={cn('text-sm', hintClassName)}>
                  Lose: {PROJECT_LOSE_REASON_LABELS[project.loseReason]}
                </p>
              ) : null}
              {project.status === 'close' && project.closeReason ? (
                <p className={cn('text-sm', hintClassName)}>
                  Close: {PROJECT_CLOSE_REASON_LABELS[project.closeReason]}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-4 border-t border-(--line) px-1 pt-4 text-sm">
          {project.description ? (
            <p className="line-clamp-4 leading-relaxed text-(--ink)/80">
              {project.description}
            </p>
          ) : null}

          <div className="space-y-1">
            <p className={metaTextClassName}>Customer</p>
            <p className="truncate font-medium text-(--ink)">
              {project.customerName || '—'}
            </p>
          </div>

          <div className="space-y-1">
            <p className={metaTextClassName}>Contact</p>
            <p className="text-(--ink)">
              {project.customerContact.name}
              <span className="text-(--muted)">
                {' · '}
                <span className="capitalize">
                  {project.customerContact.gender}
                </span>
              </span>
            </p>
            {contactEntries.length > 0 ? (
              <dl className="space-y-1 pt-0.5 text-sm">
                {contactEntries.map(([key, value]) => (
                  <div key={key} className="flex gap-1.5">
                    <dt className="shrink-0 capitalize text-(--muted)">
                      {key}
                    </dt>
                    <dd className="truncate text-(--ink)">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
