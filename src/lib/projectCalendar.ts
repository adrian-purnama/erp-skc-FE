export const PROJECT_CALENDAR_EVENT_TYPES = ['range', 'deadline'] as const
export type ProjectCalendarEventType =
  (typeof PROJECT_CALENDAR_EVENT_TYPES)[number]

export const PROJECT_CALENDAR_EVENT_TYPE_LABELS: Record<
  ProjectCalendarEventType,
  string
> = {
  range: 'Range',
  deadline: 'Deadline',
}

export const DEADLINE_NEAR_DAYS = 7

export type ProjectCalendarEventTone =
  | 'deadlineNear'
  | 'deadlineLater'
  | 'deadlinePast'
  | 'range'

/** Chart colors: red only when a deadline is near (within DEADLINE_NEAR_DAYS). */
export const PROJECT_CALENDAR_TONE_STYLES: Record<
  ProjectCalendarEventTone,
  { label: string; text: string; chip: string; dot: string; gantt: string; ganttClass: string }
> = {
  deadlineNear: {
    label: 'Deadline soon',
    text: 'text-red-700',
    chip: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
    dot: 'bg-red-600',
    gantt: '#dc2626',
    ganttClass: 'bar-deadline-near',
  },
  deadlineLater: {
    label: 'Deadline',
    text: 'text-amber-800',
    chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    dot: 'bg-amber-500',
    gantt: '#d97706',
    ganttClass: 'bar-deadline',
  },
  deadlinePast: {
    label: 'Past deadline',
    text: 'text-(--muted)',
    chip: 'bg-(--surface) text-(--muted) ring-1 ring-inset ring-(--line)',
    dot: 'bg-neutral-400',
    gantt: '#a3a3a3',
    ganttClass: 'bar-deadline-past',
  },
  range: {
    label: 'Range',
    text: 'text-teal-800',
    chip: 'bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200',
    dot: 'bg-teal-600',
    gantt: '#0f766e',
    ganttClass: 'bar-range',
  },
}

export function eventTone(
  event: ProjectCalendarEvent,
  now: Date = new Date(),
): ProjectCalendarEventTone {
  if (event.type === 'range') return 'range'
  const todayYmd = ymdInJakarta(now)
  const dueYmd = ymdInJakarta(event.startAt)
  if (dueYmd < todayYmd) return 'deadlinePast'
  if (dueYmd <= shiftYmd(todayYmd, DEADLINE_NEAR_DAYS)) return 'deadlineNear'
  return 'deadlineLater'
}

export function formatJakartaTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    timeZone: CALENDAR_TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Days between two Jakarta calendar dates (b - a). */
export function daysBetweenYmd(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const au = Date.UTC(ay, am - 1, ad)
  const bu = Date.UTC(by, bm - 1, bd)
  return Math.round((bu - au) / 86_400_000)
}

/** Whole-day countdown for a deadline: "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function deadlineCountdown(iso: string, now: Date = new Date()): string {
  const days = daysBetweenYmd(ymdInJakarta(now), ymdInJakarta(iso))
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 1) return `In ${days} days`
  return `${Math.abs(days)} days ago`
}

/** Compact live countdown: "in 2h 15m", "in 3d 4h", "now", "1h ago". */
export function relativeCountdown(
  iso: string,
  now: Date = new Date(),
): string {
  const diffMs = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(diffMs)
  const minutes = Math.floor(abs / 60_000)
  if (minutes < 1) return 'now'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  let core: string
  if (days > 0) core = `${days}d${hours > 0 ? ` ${hours}h` : ''}`
  else if (hours > 0) core = `${hours}h${mins > 0 ? ` ${mins}m` : ''}`
  else core = `${mins}m`
  return diffMs > 0 ? `in ${core}` : `${core} ago`
}

export type TodayStatus = {
  /** Short phase label: "Starts", "Ongoing", "Ends", "Due", "Done" */
  phase: string
  /** Jakarta wall-clock time this status refers to, e.g. "14:30" */
  time: string
  /** Live relative string, e.g. "in 2h 15m" */
  relative: string
  ongoing: boolean
}

/** Status for an event that touches today, used in the Today card. */
export function todayStatus(
  event: ProjectCalendarEvent,
  now: Date = new Date(),
): TodayStatus {
  const nowMs = now.getTime()
  const startMs = new Date(event.startAt).getTime()
  const endMs = event.endAt ? new Date(event.endAt).getTime() : startMs

  if (event.type === 'deadline') {
    const passed = nowMs > startMs
    return {
      phase: passed ? 'Was due' : 'Due',
      time: formatJakartaTime(event.startAt),
      relative: relativeCountdown(event.startAt, now),
      ongoing: false,
    }
  }

  if (nowMs < startMs) {
    return {
      phase: 'Starts',
      time: formatJakartaTime(event.startAt),
      relative: relativeCountdown(event.startAt, now),
      ongoing: false,
    }
  }
  if (nowMs <= endMs) {
    return {
      phase: 'Ends',
      time: formatJakartaTime(event.endAt ?? event.startAt),
      relative: relativeCountdown(event.endAt ?? event.startAt, now),
      ongoing: true,
    }
  }
  return {
    phase: 'Ended',
    time: formatJakartaTime(event.endAt ?? event.startAt),
    relative: relativeCountdown(event.endAt ?? event.startAt, now),
    ongoing: false,
  }
}

export const PROJECT_CALENDAR_DEADLINE_PRESETS = [
  'Deadline SPH',
  'Deadline Klarifikasi Teknis',
  'Deadline SPH Rev 2',
] as const

export const CALENDAR_TZ = 'Asia/Jakarta'

export type ProjectCalendarEvent = {
  id: string
  projectId: string
  type: ProjectCalendarEventType
  title: string
  notes: string
  startAt: string
  endAt: string | null
}

export type ProjectCalendarAgenda = {
  today: ProjectCalendarEvent[]
  upcoming: ProjectCalendarEvent[]
  dueIn: ProjectCalendarEvent[]
}

export type ProjectCalendarView = 'month' | 'day' | 'gantt'

export function ymdInJakarta(isoOrDate: string | Date): string {
  return new Date(isoOrDate).toLocaleDateString('en-CA', {
    timeZone: CALENDAR_TZ,
  })
}

export function todayYmdJakarta(): string {
  return ymdInJakarta(new Date())
}

/** Interpret `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` as Asia/Jakarta wall time. */
export function fromJakartaInputValue(value: string): string {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T12:00:00+07:00`).toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}:00+07:00`).toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}+07:00`).toISOString()
  }
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date')
  }
  return d.toISOString()
}

export function toJakartaDateInputValue(iso: string): string {
  return ymdInJakarta(iso)
}

export function toJakartaDatetimeInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

export function formatJakartaDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: CALENDAR_TZ,
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

export function formatJakartaDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      timeZone: CALENDAR_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export function eventTouchesYmd(
  event: ProjectCalendarEvent,
  ymd: string,
): boolean {
  const start = ymdInJakarta(event.startAt)
  if (event.type === 'deadline') return start === ymd
  const end = event.endAt ? ymdInJakarta(event.endAt) : start
  return start <= ymd && ymd <= end
}

export function eventsForYmd(
  events: ProjectCalendarEvent[],
  ymd: string,
): ProjectCalendarEvent[] {
  return events.filter((e) => eventTouchesYmd(e, ymd))
}

export function monthGridCells(year: number, monthIndex: number): {
  ymd: string
  inMonth: boolean
}[] {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const startWeekday = (first.getUTCDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const prevMonthDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()

  const cells: { ymd: string; inMonth: boolean }[] = []

  for (let i = 0; i < startWeekday; i++) {
    const day = prevMonthDays - startWeekday + i + 1
    const d = new Date(Date.UTC(year, monthIndex - 1, day))
    cells.push({ ymd: d.toISOString().slice(0, 10), inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, monthIndex, day))
    cells.push({ ymd: d.toISOString().slice(0, 10), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - (startWeekday + daysInMonth) + 1
    const d = new Date(Date.UTC(year, monthIndex + 1, day))
    cells.push({ ymd: d.toISOString().slice(0, 10), inMonth: false })
  }
  return cells
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d + days))
  return utc.toISOString().slice(0, 10)
}

export function shiftMonth(
  year: number,
  monthIndex: number,
  delta: number,
): { year: number; monthIndex: number } {
  const d = new Date(Date.UTC(year, monthIndex + delta, 1))
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() }
}
