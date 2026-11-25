import { Check } from 'lucide-react'
import {
  PROJECT_PHASE_LABELS,
  PROJECT_PHASES,
  phaseIndex
  
} from '#/lib/project'
import type {ProjectPhase} from '#/lib/project';
import { cn } from '#/lib/utils'

type Props = {
  value: ProjectPhase
  onValueChange: (phase: ProjectPhase) => void
  /** Lifecycle phase from project status — used for done/upcoming styling. */
  statusPhase: ProjectPhase
  className?: string
}

/** Phase tabs: done phases get a check, the live phase a dot. */
export default function ProjectPhaseSteps({
  value,
  onValueChange,
  statusPhase,
  className,
}: Props) {
  const statusIdx = phaseIndex(statusPhase)

  return (
    <div
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-(--line)',
        className,
      )}
      role="tablist"
      aria-label="Project phase"
    >
      {PROJECT_PHASES.map((phase, index) => {
        const done = index < statusIdx
        const current = index === statusIdx
        const selected = phase === value

        return (
          <button
            key={phase}
            type="button"
            role="tab"
            id={`project-phase-tab-${phase}`}
            aria-selected={selected}
            aria-controls={`project-phase-panel-${phase}`}
            onClick={() => onValueChange(phase)}
            title={done ? 'Done' : current ? 'Current phase' : 'Upcoming'}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-base font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-(--ink)/30',
              selected
                ? 'border-(--ink) text-(--ink)'
                : 'border-transparent text-(--muted) hover:text-(--ink)',
            )}
          >
            {done ? (
              <Check className="size-4 text-emerald-600" aria-hidden />
            ) : current ? (
              <span className="size-2 rounded-full bg-sky-500" aria-hidden />
            ) : null}
            {PROJECT_PHASE_LABELS[phase]}
          </button>
        )
      })}
    </div>
  )
}
