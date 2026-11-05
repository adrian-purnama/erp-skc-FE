export type ProjectScheduleWindows = {
  makeStart: string | null
  makeFinish: string | null
  installStart: string | null
  installFinish: string | null
}

export type ProjectScheduleItem = ProjectScheduleWindows & {
  itemId: string
  label: string
  /** Item bobot from RAB value, 0–100. */
  weightPercent: number
  /** Install share inside the item, 0–100. 0 = no install labour. */
  installSharePercent: number
  value: string
}

export type ProjectSchedule = {
  projectId: string
  plannedStartDate: string | null
  plannedFinishDate: string | null
  items: ProjectScheduleItem[]
  baseline: {
    setAt: string
    plannedStartDate: string
    plannedFinishDate: string
  } | null
  warnings: string[]
}

export type SCurvePeriod = 'week' | 'day'

export type SCurvePoint = {
  periodIndex: number
  periodStart: string
  periodEnd: string
  baselinePct: number | null
  plannedPct: number
  actualPct: number | null
  plannedDeltaPct: number
  actualDeltaPct: number | null
}

export type SCurveItem = {
  itemId: string
  label: string
  weightPercent: number
  plannedByPeriod: number[]
  plannedPct: number
  actualPct: number
  /** First SPK report date, or null. */
  actualStart: string | null
  /** Date the item reached 100% from SPK reports, or null while unfinished. */
  actualFinish: string | null
}

export type ProjectSCurve = {
  projectId: string
  period: SCurvePeriod
  plannedStartDate: string | null
  plannedFinishDate: string | null
  baselineSetAt: string | null
  today: {
    ymd: string
    periodIndex: number | null
    plannedPct: number
    baselinePct: number | null
    actualPct: number
    deviationPct: number
  }
  items: SCurveItem[]
  points: SCurvePoint[]
  warnings: string[]
}

/** "M3" for weeks, "D12" for days. */
export function periodLabel(period: SCurvePeriod, index: number): string {
  return `${period === 'week' ? 'M' : 'D'}${index}`
}

/** "15 Jan" (or "15 Jan 2026" with year) for a YYYY-MM-DD date. */
export function formatYmdShort(ymd: string, withYear = false): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(2)}%`
}

/**
 * Actual − plan for one period. The current period's actual is as of today,
 * so it is compared with today's plan, not the period-end plan.
 */
export function pointDeviation(point: SCurvePoint, today: ProjectSCurve['today']): number | null {
  if (point.actualPct === null) return null
  if (point.periodIndex === today.periodIndex) return today.deviationPct
  return Math.round((point.actualPct - point.plannedPct) * 100) / 100
}

function dayNo(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Position of `ymd` on the period axis: 0 = start of M1, n = end of Mn. Null when outside. */
export function periodAxisPosition(points: SCurvePoint[], ymd: string): number | null {
  for (const p of points) {
    if (p.periodStart <= ymd && ymd <= p.periodEnd) {
      const len = dayNo(p.periodEnd) - dayNo(p.periodStart) + 1
      return p.periodIndex - 1 + (dayNo(ymd) - dayNo(p.periodStart) + 1) / len
    }
  }
  return null
}
