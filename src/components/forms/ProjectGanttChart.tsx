import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Combobox } from '#/components/ui/combobox'
import { Button } from '#/components/ui/button'
import {
  PROJECT_CALENDAR_EVENT_TYPE_LABELS,
  PROJECT_CALENDAR_TONE_STYLES,
  daysBetweenYmd,
  eventTone,
  formatJakartaDate,
  shiftYmd,
  todayYmdJakarta,
  ymdInJakarta,
  type ProjectCalendarEvent,
} from '#/lib/projectCalendar'
import {
  buttonOutlineClassName,
  hintClassName,
  metaTextClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Scale = 'day' | 'week' | 'month'

const SCALE_OPTIONS: { value: Scale; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

/** Fixed column widths — Day never grows the page; it scrolls inside a window. */
const COL_PX: Record<Scale, number> = {
  day: 40,
  week: 80,
  month: 110,
}

/** Max columns rendered per scale (prevents multi-month Day blow-ups). */
const WINDOW_COLS: Record<Scale, number> = {
  day: 28, // 4 weeks
  week: 16, // ~4 months
  month: 12, // 1 year
}

const WINDOW_STEP: Record<Scale, number> = {
  day: 14,
  week: 28,
  month: 90,
}

type Props = {
  events: ProjectCalendarEvent[]
  onSelectEvent: (event: ProjectCalendarEvent) => void
}

type Col = {
  key: string
  label: string
  sub?: string
  start: string
  end: string
}

function startOfWeekMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = (dt.getUTCDay() + 6) % 7 // Mon=0
  return shiftYmd(ymd, -dow)
}

function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

function addMonthsYmd(ymd: string, months: number): string {
  const [y, m] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function buildColumns(scale: Scale, rangeStart: string, rangeEnd: string): Col[] {
  const cols: Col[] = []

  if (scale === 'day') {
    let cur = rangeStart
    while (cur <= rangeEnd) {
      cols.push({
        key: cur,
        label: String(Number(cur.slice(8))),
        sub: new Date(`${cur}T12:00:00+07:00`).toLocaleDateString('en-GB', {
          timeZone: 'Asia/Jakarta',
          weekday: 'short',
        }),
        start: cur,
        end: cur,
      })
      cur = shiftYmd(cur, 1)
    }
    return cols
  }

  if (scale === 'week') {
    let cur = startOfWeekMonday(rangeStart)
    const last = startOfWeekMonday(rangeEnd)
    while (cur <= last) {
      const end = shiftYmd(cur, 6)
      cols.push({
        key: cur,
        label: `${Number(cur.slice(8))}–${Number(end.slice(8))}`,
        sub: new Date(`${cur}T12:00:00+07:00`).toLocaleDateString('en-GB', {
          timeZone: 'Asia/Jakarta',
          month: 'short',
        }),
        start: cur,
        end,
      })
      cur = shiftYmd(cur, 7)
    }
    return cols
  }

  let cur = startOfMonth(rangeStart)
  const last = startOfMonth(rangeEnd)
  while (cur <= last) {
    const next = addMonthsYmd(cur, 1)
    const end = shiftYmd(next, -1)
    cols.push({
      key: cur,
      label: new Date(`${cur}T12:00:00+07:00`).toLocaleDateString('en-GB', {
        timeZone: 'Asia/Jakarta',
        month: 'short',
      }),
      sub: cur.slice(0, 4),
      start: cur,
      end,
    })
    cur = next
  }
  return cols
}

function windowRange(
  scale: Scale,
  anchorYmd: string,
): { start: string; end: string } {
  const cols = WINDOW_COLS[scale]
  if (scale === 'day') {
    // Anchor near the left third so “today” has room to the right.
    const start = shiftYmd(anchorYmd, -7)
    return { start, end: shiftYmd(start, cols - 1) }
  }
  if (scale === 'week') {
    const start = startOfWeekMonday(shiftYmd(anchorYmd, -14))
    return { start, end: shiftYmd(start, cols * 7 - 1) }
  }
  const start = startOfMonth(addMonthsYmd(startOfMonth(anchorYmd), -2))
  const endMonth = addMonthsYmd(start, cols - 1)
  return { start, end: shiftYmd(addMonthsYmd(endMonth, 1), -1) }
}

function clampBar(
  eventStart: string,
  eventEnd: string,
  rangeStart: string,
  rangeEndExclusive: string,
): { leftPct: number; widthPct: number } | null {
  const total = Math.max(1, daysBetweenYmd(rangeStart, rangeEndExclusive))
  if (eventEnd < rangeStart || eventStart >= rangeEndExclusive) return null
  const clippedStart = eventStart < rangeStart ? rangeStart : eventStart
  const clippedEnd =
    eventEnd >= rangeEndExclusive
      ? shiftYmd(rangeEndExclusive, -1)
      : eventEnd
  if (clippedEnd < clippedStart) return null
  const left = daysBetweenYmd(rangeStart, clippedStart)
  const width = daysBetweenYmd(clippedStart, clippedEnd) + 1
  return {
    leftPct: (left / total) * 100,
    widthPct: Math.max((width / total) * 100, (0.8 / total) * 100),
  }
}

function eventBounds(events: ProjectCalendarEvent[]): {
  min: string
  max: string
} | null {
  if (events.length === 0) return null
  let min = ymdInJakarta(events[0].startAt)
  let max = min
  for (const event of events) {
    const s = ymdInJakarta(event.startAt)
    const e =
      event.type === 'deadline'
        ? s
        : event.endAt
          ? ymdInJakarta(event.endAt)
          : s
    if (s < min) min = s
    if (e > max) max = e
  }
  return { min, max }
}

export default function ProjectGanttChart({ events, onSelectEvent }: Props) {
  const [scale, setScale] = useState<Scale>('week')
  const [anchorYmd, setAnchorYmd] = useState(todayYmdJakarta)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const todayYmd = todayYmdJakarta()

  const bounds = useMemo(() => eventBounds(events), [events])

  const { rangeStart, columns, timelineEndExclusive } = useMemo(() => {
    const { start, end } = windowRange(scale, anchorYmd)
    return {
      rangeStart: start,
      timelineEndExclusive: shiftYmd(end, 1),
      columns: buildColumns(scale, start, end),
    }
  }, [scale, anchorYmd])

  const colWidth = COL_PX[scale]
  const gridWidth = columns.length * colWidth

  const rows = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    [events],
  )

  const outsideCount = useMemo(() => {
    let n = 0
    for (const event of rows) {
      const start = ymdInJakarta(event.startAt)
      const end =
        event.type === 'deadline'
          ? start
          : event.endAt
            ? ymdInJakarta(event.endAt)
            : start
      if (end < rangeStart || start >= timelineEndExclusive) n += 1
    }
    return n
  }, [rows, rangeStart, timelineEndExclusive])

  const windowLabel = useMemo(() => {
    const end = shiftYmd(timelineEndExclusive, -1)
    return `${formatJakartaDate(`${rangeStart}T12:00:00+07:00`)} – ${formatJakartaDate(`${end}T12:00:00+07:00`)}`
  }, [rangeStart, timelineEndExclusive])

  useEffect(() => {
    // Keep today roughly in view when opening / changing scale.
    if (todayYmd >= rangeStart && todayYmd < timelineEndExclusive) {
      const el = scrollerRef.current
      if (!el) return
      const total = Math.max(
        1,
        daysBetweenYmd(rangeStart, timelineEndExclusive),
      )
      const left =
        (daysBetweenYmd(rangeStart, todayYmd) / total) * gridWidth
      el.scrollLeft = Math.max(0, left - el.clientWidth / 3)
    }
  }, [scale, rangeStart, timelineEndExclusive, todayYmd, gridWidth])

  function shiftWindow(dir: -1 | 1) {
    setAnchorYmd((prev) => shiftYmd(prev, dir * WINDOW_STEP[scale]))
  }

  function goToday() {
    setAnchorYmd(todayYmd)
  }

  const totalDays = Math.max(
    1,
    daysBetweenYmd(rangeStart, timelineEndExclusive),
  )
  const todayPct =
    todayYmd >= rangeStart && todayYmd < timelineEndExclusive
      ? ((daysBetweenYmd(rangeStart, todayYmd) + 0.5) / totalDays) * 100
      : null

  if (events.length === 0) {
    return (
      <p className={hintClassName}>No events to show on the Gantt chart.</p>
    )
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-md border border-(--line) bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--line) px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={metaTextClassName}>
            Scale
          </span>
          <Combobox
            value={scale}
            onValueChange={(value) => {
              if (value === 'day' || value === 'week' || value === 'month') {
                setScale(value)
              }
            }}
            options={SCALE_OPTIONS}
            placeholder="Scale…"
            searchPlaceholder="Search scale…"
            emptyText="No scale."
            aria-label="Gantt scale"
            className="w-32 sm:w-32"
          />
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Previous period"
              onClick={() => shiftWindow(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Next period"
              onClick={() => shiftWindow(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <span className="truncate text-xs tabular-nums text-(--muted)">
            {windowLabel}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          className={cn(buttonOutlineClassName, 'h-8 shrink-0 px-3 text-xs')}
          onClick={goToday}
        >
          Today
        </Button>
      </div>

      {outsideCount > 0 ? (
        <p className={cn('border-b border-(--line) px-3 py-1.5 text-[11px]', hintClassName)}>
          {outsideCount} event{outsideCount === 1 ? '' : 's'} outside this
          window — use ← → or switch to Week/Month
          {bounds
            ? ` (span ${formatJakartaDate(`${bounds.min}T12:00:00+07:00`)} – ${formatJakartaDate(`${bounds.max}T12:00:00+07:00`)})`
            : ''}
          .
        </p>
      ) : null}

      <div className="flex min-h-0 w-full min-w-0 max-h-[min(420px,60vh)] overflow-hidden">
        <div className="z-10 w-40 shrink-0 border-r border-(--line) bg-white sm:w-48">
          <div
            className={cn(
              'flex h-12 items-end border-b border-(--line) px-3 pb-2',
              metaTextClassName,
            )}
          >
            Event
          </div>
          <ul>
            {rows.map((event) => {
              const start = ymdInJakarta(event.startAt)
              const end =
                event.type === 'deadline'
                  ? start
                  : event.endAt
                    ? ymdInJakarta(event.endAt)
                    : start
              const inView =
                !(end < rangeStart || start >= timelineEndExclusive)
              return (
                <li
                  key={event.id}
                  className="flex h-11 items-center border-b border-(--line) px-3"
                >
                  <button
                    type="button"
                    className={cn(
                      'min-w-0 truncate text-left text-sm font-medium hover:underline',
                      !inView && 'text-(--muted)',
                    )}
                    onClick={() => {
                      onSelectEvent(event)
                    }}
                    onDoubleClick={() => setAnchorYmd(start)}
                    title={
                      inView
                        ? event.title
                        : `${event.title} (outside window — double-click to jump)`
                    }
                  >
                    {event.title}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div
          ref={scrollerRef}
          className="min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain"
        >
          <div
            style={{ width: gridWidth, maxWidth: 'none' }}
            className="relative"
          >
            <div
              className="sticky top-0 z-10 grid h-12 border-b border-(--line) bg-white"
              style={{
                gridTemplateColumns: `repeat(${columns.length}, ${colWidth}px)`,
              }}
            >
              {columns.map((col) => {
                const isTodayCol =
                  scale === 'day'
                    ? col.start === todayYmd
                    : todayYmd >= col.start && todayYmd <= col.end
                return (
                  <div
                    key={col.key}
                    className={cn(
                      'flex flex-col items-center justify-end border-r border-(--line)/70 px-0.5 pb-1.5',
                      isTodayCol && 'bg-(--surface)',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[11px] font-medium tabular-nums',
                        isTodayCol
                          ? 'rounded-full bg-(--ink) px-1.5 text-white'
                          : 'text-(--ink)',
                      )}
                    >
                      {col.label}
                    </span>
                    {col.sub ? (
                      <span className="text-[10px] text-(--muted)">
                        {col.sub}
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="relative">
              {todayPct !== null ? (
                <div
                  className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-(--ink)/50"
                  style={{ left: `${todayPct}%` }}
                  aria-hidden
                />
              ) : null}

              <ul>
                {rows.map((event) => {
                  const start = ymdInJakarta(event.startAt)
                  const end =
                    event.type === 'deadline'
                      ? start
                      : event.endAt
                        ? ymdInJakarta(event.endAt)
                        : start
                  const bar = clampBar(
                    start,
                    end,
                    rangeStart,
                    timelineEndExclusive,
                  )
                  const tone = PROJECT_CALENDAR_TONE_STYLES[eventTone(event)]
                  return (
                    <li
                      key={event.id}
                      className="relative h-11 border-b border-(--line)"
                      style={{
                        backgroundImage: `repeating-linear-gradient(
                          to right,
                          transparent,
                          transparent ${colWidth - 1}px,
                          color-mix(in srgb, var(--line) 80%, transparent) ${colWidth - 1}px,
                          color-mix(in srgb, var(--line) 80%, transparent) ${colWidth}px
                        )`,
                      }}
                    >
                      {bar ? (
                        <button
                          type="button"
                          className={cn(
                            'absolute top-2.5 flex h-6 items-center truncate rounded-md px-2 text-left text-[11px] font-semibold text-white shadow-sm',
                            event.type === 'deadline' &&
                              'min-w-6 justify-center',
                          )}
                          style={{
                            left: `calc(${bar.leftPct}% + 2px)`,
                            width: `max(1.5rem, calc(${bar.widthPct}% - 4px))`,
                            backgroundColor: tone.gantt,
                          }}
                          title={`${event.title} · ${PROJECT_CALENDAR_EVENT_TYPE_LABELS[event.type]} · ${formatJakartaDate(event.startAt)}${event.endAt ? ` – ${formatJakartaDate(event.endAt)}` : ''}`}
                          onClick={() => onSelectEvent(event)}
                        >
                          {bar.widthPct > 10 || event.type === 'range'
                            ? event.title
                            : null}
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
