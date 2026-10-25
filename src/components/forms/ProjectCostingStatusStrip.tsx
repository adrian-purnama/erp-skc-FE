import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Lock, LockOpen } from 'lucide-react'
import {
  changeDraftSubtitle,
  costingLockState,
  costingStateLabel,
  formatCostingWhen,
} from '#/components/forms/costingStatus'
import type { ProjectRab } from '#/lib/project'
import { buttonOutlineClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Surface = 'rab' | 'boq'

type Props = {
  projectId: string
  rab: ProjectRab | null
  surface: Surface
  /** Extra actions on the right (Lock / Commit / …) — RAB owns mutations. */
  actions?: ReactNode
  className?: string
}

/**
 * Shared lock / change chrome for RAB and Shop Drawing BOQ.
 * Same vocabulary on both screens; cross-link to the other step.
 */
export default function ProjectCostingStatusStrip({
  projectId,
  rab,
  surface,
  actions,
  className,
}: Props) {
  const state = costingLockState(rab)
  const draft = rab?.changeDraft ?? null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-sm border border-(--line) bg-(--surface) px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex shrink-0 items-center justify-center text-(--ink)"
          title={state === 'locked' ? 'Locked' : 'Unlocked — editable'}
        >
          {state === 'locked' ? (
            <Lock className="size-7" aria-hidden />
          ) : (
            <LockOpen className="size-7" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex flex-col gap-0.5 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-sm font-semibold',
              state === 'draft' ? hintClassName : 'text-(--ink)',
            )}
          >
            {costingStateLabel(state)}
            {state === 'locked' && rab?.lockedBy ? (
              <span className={cn('font-normal', hintClassName)}>
                · {rab.lockedBy.name}
                {rab.lockedAt ? ` · ${formatCostingWhen(rab.lockedAt)}` : ''}
              </span>
            ) : null}
          </span>
          {draft ? (
            <span className={hintClassName}>{changeDraftSubtitle(draft)}</span>
          ) : state === 'draft' ? (
            <span className={hintClassName}>
              Fill Shop Drawing BOQ and RAB prices, then lock on RAB.
            </span>
          ) : state === 'locked' ? (
            <span className={hintClassName}>
              BOQ and RAB are frozen. Open a change on RAB to edit.
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {surface === 'boq' && projectId ? (
          <Link
            to="/dashboard/internal/rab"
            search={{ projectId }}
            className={cn(
              buttonOutlineClassName,
              'inline-flex h-8 items-center gap-1.5 no-underline',
            )}
          >
            {state === 'change' ? 'Open RAB to price / commit' : 'Open RAB'}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
        {surface === 'rab' && projectId && state === 'change' ? (
          <Link
            to="/dashboard/internal/shop-drawing-boq"
            search={{ projectId }}
            className={cn(
              buttonOutlineClassName,
              'inline-flex h-8 items-center gap-1.5 no-underline',
            )}
          >
            Edit BOQ
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
