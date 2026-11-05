import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** Reference categorical slots 1–2 (light / dark steps). */
export const SERIES_1 = 'bg-[#2a78d6] dark:bg-[#3987e5]'
export const SERIES_2 = 'bg-[#eb6834] dark:bg-[#d95926]'

export const panelClassName = 'rounded-lg border border-(--line) bg-(--background) p-4'

export type StatTone = 'neutral' | 'danger' | 'success'

/** One headline number with a short caption and an optional status badge. */
export function StatTile({
  icon: Icon,
  label,
  value,
  meta,
  badge,
  badgeTone = 'danger',
  tooltip,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: string
  meta: string
  badge?: string
  badgeTone?: StatTone
  /** Extra detail on hover (e.g. which projects). */
  tooltip?: ReactNode
  loading: boolean
}) {
  const body = (
    <div className={cn(panelClassName, 'h-full min-w-0 space-y-1')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded bg-(--surface)" />
      ) : (
        <div className="truncate text-2xl font-semibold tabular-nums text-(--ink)">{value}</div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn('line-clamp-2 text-xs', hintClassName)}>{meta}</span>
        {badge && !loading ? <StatusBadge tone={badgeTone}>{badge}</StatusBadge> : null}
      </div>
    </div>
  )
  if (!tooltip || loading) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{body}</div>
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export function StatusBadge({ tone, children }: { tone: StatTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1',
        tone === 'danger' &&
          'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
        tone === 'success' &&
          'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
        tone === 'neutral' && 'bg-(--surface) text-(--muted) ring-(--line)',
      )}
    >
      {tone === 'danger' ? <AlertTriangle className="size-3" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** A titled card for a chart or list. */
export function ChartPanel({
  title,
  hint,
  legend,
  children,
}: {
  title: string
  hint: string
  legend?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={cn(panelClassName, 'min-w-0 space-y-3')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-(--ink)">{title}</h2>
          <p className={cn('text-xs', hintClassName)}>{hint}</p>
        </div>
        {legend}
      </div>
      {children}
    </section>
  )
}

export function LegendKey({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-(--ink)">
      <span className={cn('size-2.5 rounded-[2px]', className)} aria-hidden />
      {label}
    </span>
  )
}

export type BarItem = {
  key: string
  label: string
  value: number
  display: string
  tooltip: string
}

/** Single-series horizontal bars; labels stay in ink, bars carry magnitude. */
export function BarList({
  items,
  loading,
  empty = 'No data yet.',
}: {
  items: BarItem[]
  loading: boolean
  empty?: string
}) {
  if (loading) return <ChartSkeleton />
  const max = Math.max(0, ...items.map((i) => i.value))
  if (items.length === 0 || max === 0) return <EmptyNote>{empty}</EmptyNote>
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="grid cursor-default grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 rounded-sm text-xs hover:bg-(--surface)">
                <span className="truncate text-(--ink)">{item.label}</span>
                <div className="h-3">
                  {item.value > 0 ? (
                    <div
                      className={cn('h-full rounded-r-[4px]', SERIES_1)}
                      style={{ width: `${(item.value / max) * 100}%` }}
                    />
                  ) : null}
                </div>
                <span className="tabular-nums text-(--muted)">{item.display}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent sideOffset={4}>{item.tooltip}</TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={cn('py-6 text-center text-sm', hintClassName)}>{children}</p>
}

export function ChartSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-(--surface)" />
      ))}
    </div>
  )
}
