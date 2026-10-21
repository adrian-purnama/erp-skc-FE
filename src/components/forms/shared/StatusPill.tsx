import { cn } from '#/lib/utils'

export default function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          : 'bg-stone-100 text-stone-600 ring-1 ring-stone-200',
      )}
    >
      {active ? 'Enabled' : 'Disabled'}
    </span>
  )
}
