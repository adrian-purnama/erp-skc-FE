import { useMemo } from 'react'
import DashboardCustomizer from '#/components/forms/dashboard/DashboardCustomizer'
import { PROJECT_METRICS } from '#/components/forms/dashboard/projectMetrics'
import { TooltipProvider } from '#/components/ui/tooltip'
import { useDashboardMetrics } from '#/lib/dashboardMetrics'
import type { ProjectListRow } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  rows: ProjectListRow[]
  loading: boolean
  /** Shown left of Customize, e.g. the period / customer filters. */
  filters?: React.ReactNode
}

const ALL_IDS = PROJECT_METRICS.map((m) => m.id)
const DEFAULT_IDS = PROJECT_METRICS.filter((m) => m.defaultOn).map((m) => m.id)

/** Project dashboard: the metrics this user picked, each its own tile or panel. */
export default function ProjectListOverview({ rows, loading, filters }: Props) {
  const { selected, ready, save } = useDashboardMetrics('project', ALL_IDS, DEFAULT_IDS)

  const shown = useMemo(
    () => PROJECT_METRICS.filter((m) => selected.includes(m.id)),
    [selected],
  )
  const stats = shown.filter((m) => m.kind === 'stat')
  const panels = shown.filter((m) => m.kind === 'panel')
  const ctx = { rows, loading: loading || !ready }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
          <DashboardCustomizer
            metrics={PROJECT_METRICS.map((m) => ({
              id: m.id,
              label: m.label,
              description: m.description,
              group: m.kind === 'stat' ? 'Numbers' : 'Charts and lists',
            }))}
            selected={selected}
            defaults={DEFAULT_IDS}
            disabled={!ready}
            onChange={(next) => void save(next)}
          />
        </div>

        {shown.length === 0 && ready ? (
          <p className={cn('rounded-lg border border-dashed border-(--line) px-4 py-6 text-center text-sm', hintClassName)}>
            No metrics shown. Use Customize to add some.
          </p>
        ) : null}

        {stats.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
            {stats.map((m) => (
              <div key={m.id} className="min-w-0">
                {m.render(ctx)}
              </div>
            ))}
          </div>
        ) : null}

        {panels.length > 0 ? (
          // Rows of 3 (2 when that divides evenly); a short last row stretches, so no gaps or ragged heights.
          <div className="flex flex-wrap gap-3">
            {panels.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'min-w-[min(100%,20rem)] flex-1',
                  panels.length === 4 || panels.length <= 2
                    ? 'basis-[calc(50%-0.375rem)]'
                    : 'basis-[calc(33.333%-0.5rem)]',
                )}
              >
                {m.render(ctx)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
