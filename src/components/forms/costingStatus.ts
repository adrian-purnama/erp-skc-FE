import type {
  ProjectRab,
  ProjectRabChangeDraftRef,
  ProjectRabLineChangeKind,
} from '#/lib/project'

export type CostingLockState = 'draft' | 'locked' | 'change'

export function costingLockState(
  rab: Pick<ProjectRab, 'status' | 'changeDraft'> | null | undefined,
): CostingLockState {
  if (!rab) return 'draft'
  if (rab.status === 'locked' && rab.changeDraft) return 'change'
  if (rab.status === 'locked') return 'locked'
  return 'draft'
}

export function costingStateLabel(state: CostingLockState): string {
  switch (state) {
    case 'change':
      return 'Change in progress'
    case 'locked':
      return 'Locked'
    default:
      return 'Draft, not locked'
  }
}

export function formatCostingWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function changeKindBadgeClass(kind: ProjectRabLineChangeKind): string {
  switch (kind) {
    case 'added':
      return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
    case 'removed':
      return 'bg-red-100 text-red-900 ring-red-200'
    case 'changed':
      return 'bg-amber-100 text-amber-950 ring-amber-200'
  }
}

export function changeKindLabel(kind: ProjectRabLineChangeKind): string {
  switch (kind) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'changed':
      return 'Changed'
  }
}

export function changeDraftSubtitle(
  draft: ProjectRabChangeDraftRef,
): string {
  return `${draft.reason} · ${draft.openedBy.name} · ${formatCostingWhen(draft.openedAt)}`
}
