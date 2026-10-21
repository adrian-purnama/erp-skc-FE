import {
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  phaseIndex,
  type ProjectPhase,
} from '#/lib/project'
import { cn } from '#/lib/utils'

type Props = {
  value: ProjectPhase
  onValueChange: (phase: ProjectPhase) => void
  /** Lifecycle phase from project status — used for done/upcoming styling. */
  statusPhase: ProjectPhase
  className?: string
}

export default function ProjectPhaseSteps({
  value,
  onValueChange,
  statusPhase,
  className,
}: Props) {
  const statusIdx = phaseIndex(statusPhase)

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 sm:gap-3', className)}
      role="tablist"
      aria-label="Project phase"
    >
      {PROJECT_PHASES.map((phase, index) => {
        const done = index < statusIdx
        const selected = phase === value
        const isStatusPhase = index === statusIdx

        return (
          <div key={phase} className="flex items-center gap-2 sm:gap-3">
            {index > 0 ? (
              <span
                className={cn(
                  'h-px w-6 sm:w-10',
                  index <= statusIdx ? 'bg-(--ink)/40' : 'bg-(--line)',
                )}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              role="tab"
              id={`project-phase-tab-${phase}`}
              aria-selected={selected}
              aria-controls={`project-phase-panel-${phase}`}
              onClick={() => onValueChange(phase)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition',
                selected
                  ? 'bg-(--ink) text-white'
                  : 'hover:bg-(--surface) text-(--ink)',
              )}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold',
                  selected && 'bg-white/20 text-white',
                  !selected && isStatusPhase && 'bg-(--ink) text-white',
                  !selected &&
                    done &&
                    !isStatusPhase &&
                    'bg-(--ink)/15 text-(--ink)',
                  !selected &&
                    !done &&
                    !isStatusPhase &&
                    'bg-(--surface) text-(--muted) ring-1 ring-(--line)',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'text-sm font-medium',
                  selected && 'text-white',
                  !selected && isStatusPhase && 'text-(--ink)',
                  !selected && done && !isStatusPhase && 'text-(--ink)/70',
                  !selected && !done && !isStatusPhase && 'text-(--muted)',
                )}
              >
                {PROJECT_PHASE_LABELS[phase]}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
