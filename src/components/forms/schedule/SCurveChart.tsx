import { useEffect, useRef, useState } from 'react'
import {
  formatPct,
  formatYmdShort,
  periodAxisPosition,
  periodLabel,
  pointDeviation,
} from '#/lib/projectSchedule'
import type { ProjectSCurve, SCurvePeriod, SCurvePoint } from '#/lib/projectSchedule'
import { cn } from '#/lib/utils'

type Props = {
  period: SCurvePeriod
  points: SCurvePoint[]
  today: ProjectSCurve['today']
}

const HEIGHT = 260
const PAD = { top: 16, right: 56, bottom: 28, left: 40 }
const Y_TICKS = [0, 25, 50, 75, 100]

/** Series: plan = categorical slot 1 (blue), actual = slot 2 (orange), baseline = muted reference. */
const PLAN = 'stroke-[#2a78d6] dark:stroke-[#3987e5]'
const ACTUAL = 'stroke-[#eb6834] dark:stroke-[#d95926]'
const PLAN_FILL = 'fill-[#2a78d6] dark:fill-[#3987e5]'
const ACTUAL_FILL = 'fill-[#eb6834] dark:fill-[#d95926]'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/** Cumulative % per period end, starting from 0 at the start of M1. */
export default function SCurveChart({ period, points, today }: Props) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = points.length
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (pos: number) => PAD.left + (n > 0 ? (pos / n) * plotW : 0)
  const y = (pct: number) => PAD.top + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH

  const todayPos = periodAxisPosition(points, today.ymd)
  /** Axis position of point i; the current period's actual is as of today, so it sits on the Today line. */
  const actualPos = (i: number) =>
    todayPos !== null && i === Math.ceil(todayPos) - 1 ? todayPos : i + 1

  const path = (values: Array<number | null>, pos: (i: number) => number = (i) => i + 1) => {
    const coords: string[] = [`${x(0)},${y(0)}`]
    values.forEach((v, i) => {
      if (v !== null) coords.push(`${x(pos(i))},${y(v)}`)
    })
    return coords.length > 1 ? `M${coords.join('L')}` : ''
  }

  const planned = points.map((p) => p.plannedPct)
  const actual = points.map((p) => p.actualPct)
  const baseline = points.map((p) => p.baselinePct)
  const hasBaseline = baseline.some((v) => v !== null)
  const lastActualIdx = actual.reduce<number>((m, v, i) => (v !== null ? i : m), -1)

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 56))))
  const hovered = hover !== null ? points[hover] : null
  const isCurrent = hovered?.periodIndex === today.periodIndex

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = ((e.clientX - rect.left) / rect.width) * n
    setHover(Math.min(n - 1, Math.max(0, Math.round(pos) - 1)))
  }

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap items-center gap-4 text-xs text-(--muted)" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" strokeWidth="2" className={PLAN} />
          </svg>
          Plan
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" strokeWidth="2" className={ACTUAL} />
          </svg>
          Actual
        </li>
        {hasBaseline ? (
          <li className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                strokeWidth="2"
                strokeDasharray="4 3"
                className="stroke-(--muted)"
              />
            </svg>
            Baseline
          </li>
        ) : null}
      </ul>

      <div ref={ref} className="relative w-full">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="S-curve: cumulative planned and actual progress per period"
          className="block"
        >
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={y(t)}
                y2={y(t)}
                className="stroke-(--line)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-(--muted) text-xs tabular-nums"
              >
                {t}%
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text
                key={p.periodIndex}
                x={x(i + 0.5)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-(--muted) text-xs"
              >
                {periodLabel(period, p.periodIndex)}
              </text>
            ) : null,
          )}

          {todayPos !== null ? (
            <g>
              <line
                x1={x(todayPos)}
                x2={x(todayPos)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                className="stroke-(--ink)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <text
                x={x(todayPos) + 4}
                y={PAD.top + 10}
                className="fill-(--ink) text-xs"
              >
                Today
              </text>
            </g>
          ) : null}

          {hasBaseline ? (
            <path
              d={path(baseline)}
              fill="none"
              strokeWidth="2"
              strokeDasharray="5 4"
              className="stroke-(--muted)"
            />
          ) : null}
          <path d={path(planned)} fill="none" strokeWidth="2" strokeLinejoin="round" className={PLAN} />
          <path d={path(actual, actualPos)} fill="none" strokeWidth="2" strokeLinejoin="round" className={ACTUAL} />

          {n > 0 ? (
            <text
              x={x(n) + 6}
              y={y(planned[n - 1] ?? 0)}
              dominantBaseline="middle"
              className="fill-(--ink) text-xs"
            >
              Plan
            </text>
          ) : null}
          {lastActualIdx >= 0 ? (
            <g>
              <circle
                cx={x(actualPos(lastActualIdx))}
                cy={y(actual[lastActualIdx] ?? 0)}
                r="4"
                strokeWidth="2"
                className={cn(ACTUAL_FILL, 'stroke-(--surface)')}
              />
              <text
                x={x(actualPos(lastActualIdx)) + 8}
                y={y(actual[lastActualIdx] ?? 0) + 12}
                className="fill-(--ink) text-xs"
              >
                Actual
              </text>
            </g>
          ) : null}

          {hovered && hover !== null ? (
            <g pointerEvents="none">
              <line
                x1={x(hover + 1)}
                x2={x(hover + 1)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                className="stroke-(--muted)"
                strokeWidth="1"
              />
              <circle
                cx={x(hover + 1)}
                cy={y(hovered.plannedPct)}
                r="4"
                strokeWidth="2"
                className={cn(PLAN_FILL, 'stroke-(--surface)')}
              />
              {hovered.actualPct !== null ? (
                <circle
                  cx={x(actualPos(hover))}
                  cy={y(hovered.actualPct)}
                  r="4"
                  strokeWidth="2"
                  className={cn(ACTUAL_FILL, 'stroke-(--surface)')}
                />
              ) : null}
            </g>
          ) : null}

          {n > 0 ? (
            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          ) : null}
        </svg>

        {hovered && hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-md border border-(--line) bg-(--surface) px-3 py-2 text-xs shadow-sm"
            style={
              x(hover + 1) > width / 2
                ? { right: width - x(hover + 1) + 10 }
                : { left: x(hover + 1) + 10 }
            }
          >
            <p className="font-medium">
              {periodLabel(period, hovered.periodIndex)} ·{' '}
              {formatYmdShort(hovered.periodStart)}
              {hovered.periodStart !== hovered.periodEnd
                ? ` – ${formatYmdShort(hovered.periodEnd)}`
                : ''}
            </p>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
              {hovered.baselinePct !== null ? (
                <>
                  <dt className="text-(--muted)">Baseline</dt>
                  <dd className="text-right">{formatPct(hovered.baselinePct)}</dd>
                </>
              ) : null}
              <dt className="text-(--muted)">Plan</dt>
              <dd className="text-right">{formatPct(hovered.plannedPct)}</dd>
              {isCurrent ? (
                <>
                  <dt className="text-(--muted)">Plan today</dt>
                  <dd className="text-right">{formatPct(today.plannedPct)}</dd>
                </>
              ) : null}
              <dt className="text-(--muted)">{isCurrent ? 'Actual today' : 'Actual'}</dt>
              <dd className="text-right">{formatPct(hovered.actualPct)}</dd>
              {hovered.actualPct !== null ? (
                <>
                  <dt className="text-(--muted)">Deviation</dt>
                  <dd className="text-right">{formatPct(pointDeviation(hovered, today))}</dd>
                </>
              ) : null}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  )
}
