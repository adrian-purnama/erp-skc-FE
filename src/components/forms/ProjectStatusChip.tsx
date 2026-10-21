import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '#/lib/project'
import { cn } from '#/lib/utils'

const STATUS_CHIP_CLASS: Record<ProjectStatus, string> = {
  open: 'border-sky-200 bg-sky-50 text-sky-800',
  win: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  lose: 'border-rose-200 bg-rose-50 text-rose-800',
  close: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  completed: 'border-violet-200 bg-violet-50 text-violet-800',
}

type Props = {
  status: ProjectStatus
  className?: string
}

export default function ProjectStatusChip({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide',
        STATUS_CHIP_CLASS[status] ?? STATUS_CHIP_CLASS.open,
        className,
      )}
    >
      {PROJECT_STATUS_LABELS[status] ?? status}
    </span>
  )
}
