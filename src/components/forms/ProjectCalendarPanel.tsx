import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import toast from 'react-hot-toast'
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Combobox } from '#/components/ui/combobox'
import ProjectGanttChart from '#/components/forms/ProjectGanttChart'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { apiFetch } from '#/lib/api'
import {
  DEADLINE_NEAR_DAYS,
  PROJECT_CALENDAR_DEADLINE_PRESETS,
  PROJECT_CALENDAR_EVENT_TYPE_LABELS,
  PROJECT_CALENDAR_EVENT_TYPES,
  PROJECT_CALENDAR_TONE_STYLES,
  deadlineCountdown,
  eventTone,
  eventsForYmd,
  formatJakartaDate,
  formatJakartaDateTime,
  formatJakartaTime,
  fromJakartaInputValue,
  relativeCountdown,
  todayStatus,
  monthGridCells,
  shiftMonth,
  shiftYmd,
  toJakartaDateInputValue,
  toJakartaDatetimeInputValue,
  todayYmdJakarta,
  type ProjectCalendarAgenda,
  type ProjectCalendarEvent,
  type ProjectCalendarEventTone,
  type ProjectCalendarEventType,
  type ProjectCalendarView,
} from '#/lib/projectCalendar'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  metaTextClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  canManage: boolean
}

type EditorState = {
  id?: string
  type: ProjectCalendarEventType
  title: string
  notes: string
  startLocal: string
  endLocal: string
}

const TYPE_OPTIONS = PROJECT_CALENDAR_EVENT_TYPES.map((value) => ({
  value,
  label: PROJECT_CALENDAR_EVENT_TYPE_LABELS[value],
}))

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  const value = `${h}:${m}`
  return { value, label: value }
})

function emptyEditor(defaults?: Partial<EditorState>): EditorState {
  const today = todayYmdJakarta()
  return {
    type: 'deadline',
    title: '',
    notes: '',
    startLocal: `${today}T12:00`,
    endLocal: `${today}T17:00`,
    ...defaults,
  }
}

function eventToEditor(event: ProjectCalendarEvent): EditorState {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    notes: event.notes,
    startLocal:
      event.type === 'deadline'
        ? `${toJakartaDateInputValue(event.startAt)}T12:00`
        : toJakartaDatetimeInputValue(event.startAt),
    endLocal: event.endAt
      ? toJakartaDatetimeInputValue(event.endAt)
      : toJakartaDatetimeInputValue(event.startAt),
  }
}

function splitLocal(local: string): { ymd: string; hm: string } {
  const [ymd, hm = '12:00'] = local.split('T')
  return { ymd, hm: hm.slice(0, 5) }
}

function joinLocal(ymd: string, hm: string): string {
  return `${ymd}T${hm}`
}

function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function localDateToYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatYmdLabel(ymd: string): string {
  return ymdToLocalDate(ymd).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Re-renders every `intervalMs` so countdowns stay live. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

const LEGEND_TONES: ProjectCalendarEventTone[] = [
  'deadlineNear',
  'deadlineLater',
  'range',
]

export default function ProjectCalendarPanel({ projectId, canManage }: Props) {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<ProjectCalendarEvent[]>([])
  const [agenda, setAgenda] = useState<ProjectCalendarAgenda | null>(null)
  const [view, setView] = useState<ProjectCalendarView>('month')
  const [cursorYmd, setCursorYmd] = useState(todayYmdJakarta)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const now = useNow()

  const monthParts = useMemo(() => {
    const [y, m] = cursorYmd.split('-').map(Number)
    return { year: y, monthIndex: m - 1 }
  }, [cursorYmd])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, agendaRes] = await Promise.all([
        apiFetch<ProjectCalendarEvent[]>(`/project/${projectId}/calendar`),
        apiFetch<ProjectCalendarAgenda>(
          `/project/calendar/agenda?projectId=${encodeURIComponent(projectId)}&nearDays=7`,
        ),
      ])
      if (!listRes.success || !listRes.data) {
        toast.error(listRes.message || 'Failed to load calendar')
        setEvents([])
      } else {
        setEvents(listRes.data)
      }
      if (!agendaRes.success || !agendaRes.data) {
        setAgenda({ today: [], upcoming: [], dueIn: [] })
      } else {
        setAgenda(agendaRes.data)
      }
    } catch {
      toast.error('Unable to reach the server')
      setEvents([])
      setAgenda({ today: [], upcoming: [], dueIn: [] })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const dayEvents = useMemo(
    () => eventsForYmd(events, cursorYmd),
    [events, cursorYmd],
  )

  const cells = useMemo(
    () => monthGridCells(monthParts.year, monthParts.monthIndex),
    [monthParts],
  )

  const openNewForDay = useCallback((ymd: string) => {
    setEditor(
      emptyEditor({
        startLocal: `${ymd}T09:00`,
        endLocal: `${ymd}T17:00`,
      }),
    )
  }, [])

  async function saveEditor() {
    if (!editor || !canManage || saving) return
    const title = editor.title.trim()
    if (!title) {
      toast.error('Title is required')
      return
    }

    let startAt: string
    let endAt: string | null = null
    try {
      startAt = fromJakartaInputValue(editor.startLocal)
      if (editor.type === 'range') {
        endAt = fromJakartaInputValue(editor.endLocal)
        if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
          toast.error('End must be on or after start')
          return
        }
      }
    } catch {
      toast.error('Invalid date')
      return
    }

    setSaving(true)
    try {
      const body = {
        type: editor.type,
        title,
        notes: editor.notes.trim(),
        startAt,
        endAt,
      }
      const response = editor.id
        ? await apiFetch<ProjectCalendarEvent>(
            `/project/${projectId}/calendar/${editor.id}`,
            { method: 'PATCH', body: JSON.stringify(body) },
          )
        : await apiFetch<ProjectCalendarEvent>(
            `/project/${projectId}/calendar`,
            { method: 'POST', body: JSON.stringify(body) },
          )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to save event')
        return
      }
      toast.success(editor.id ? 'Event updated' : 'Event created')
      setEditor(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEditor() {
    if (!editor?.id || !canManage || saving) return
    setSaving(true)
    try {
      const response = await apiFetch<null>(
        `/project/${projectId}/calendar/${editor.id}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to delete event')
        return
      }
      toast.success('Event deleted')
      setEditor(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const monthLabel = useMemo(() => {
    const d = new Date(Date.UTC(monthParts.year, monthParts.monthIndex, 1))
    return d.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }, [monthParts])

  if (loading) {
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-sm', hintClassName)}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading calendar…
      </p>
    )
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <ReminderStrip
        agenda={agenda}
        now={now}
        onSelectEvent={(e) => setEditor(eventToEditor(e))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1 rounded-md border border-(--line) p-0.5">
            {(['month', 'day', 'gantt'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  'rounded px-3 py-1.5 text-sm capitalize transition',
                  view === mode
                    ? 'bg-(--ink) text-white'
                    : 'text-(--muted) hover:bg-(--surface) hover:text-(--ink)',
                )}
                onClick={() => setView(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
          <ul className="flex flex-wrap items-center gap-3 text-[11px] text-(--muted)">
            {LEGEND_TONES.map((tone) => (
              <li key={tone} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    PROJECT_CALENDAR_TONE_STYLES[tone].dot,
                  )}
                  aria-hidden
                />
                {tone === 'deadlineNear'
                  ? `Deadline within ${DEADLINE_NEAR_DAYS} days`
                  : PROJECT_CALENDAR_TONE_STYLES[tone].label}
              </li>
            ))}
          </ul>
        </div>
        {canManage ? (
          <Button
            type="button"
            className={cn(buttonClassName, 'inline-flex items-center gap-2')}
            onClick={() => openNewForDay(cursorYmd)}
          >
            <Plus className="size-4" aria-hidden />
            Add event
          </Button>
        ) : null}
      </div>

      {view === 'month' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className={cn(buttonOutlineClassName, 'inline-flex items-center gap-1')}
              onClick={() => {
                const next = shiftMonth(
                  monthParts.year,
                  monthParts.monthIndex,
                  -1,
                )
                setCursorYmd(
                  `${next.year}-${String(next.monthIndex + 1).padStart(2, '0')}-01`,
                )
              }}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p className="text-sm font-medium">{monthLabel}</p>
            <button
              type="button"
              className={cn(buttonOutlineClassName, 'inline-flex items-center gap-1')}
              onClick={() => {
                const next = shiftMonth(
                  monthParts.year,
                  monthParts.monthIndex,
                  1,
                )
                setCursorYmd(
                  `${next.year}-${String(next.monthIndex + 1).padStart(2, '0')}-01`,
                )
              }}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px rounded-md border border-(--line) bg-(--line) text-center text-[11px]">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="bg-(--surface) px-1 py-2 font-medium text-(--muted)">
                {d}
              </div>
            ))}
            {cells.map((cell) => {
              const dayItems = eventsForYmd(events, cell.ymd)
              const selected = cell.ymd === cursorYmd
              const isToday = cell.ymd === todayYmdJakarta()
              const shown = dayItems.slice(0, 2)
              const extra = dayItems.length - shown.length
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  className={cn(
                    'min-h-20 bg-white p-1.5 text-left transition hover:bg-(--surface)',
                    !cell.inMonth && 'opacity-45',
                    selected && 'ring-1 ring-inset ring-(--ink)',
                    isToday && 'font-semibold',
                  )}
                  onClick={() => {
                    setCursorYmd(cell.ymd)
                    setView('day')
                  }}
                >
                  <span className="text-xs tabular-nums">
                    {Number(cell.ymd.slice(8))}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {shown.map((event) => (
                      <span
                        key={event.id}
                        className={cn(
                          'block truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                          PROJECT_CALENDAR_TONE_STYLES[eventTone(event, now)].chip,
                        )}
                      >
                        {event.title}
                      </span>
                    ))}
                    {extra > 0 ? (
                      <span className={cn('block text-[10px]', hintClassName)}>
                        +{extra} more
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {view === 'day' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex items-center gap-1',
                )}
                onClick={() => setCursorYmd(shiftYmd(cursorYmd, -1))}
                aria-label="Previous day"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="min-w-40 text-center text-sm font-medium tabular-nums">
                {formatJakartaDate(`${cursorYmd}T12:00:00+07:00`)}
              </p>
              <button
                type="button"
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex items-center gap-1',
                )}
                onClick={() => setCursorYmd(shiftYmd(cursorYmd, 1))}
                aria-label="Next day"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          {dayEvents.length === 0 ? (
            <div className="rounded-md border border-dashed border-(--line) px-4 py-8 text-center">
              <p className={cn('text-sm', hintClassName)}>
                Nothing scheduled on this day.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-(--surface)"
                    onClick={() => setEditor(eventToEditor(event))}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          PROJECT_CALENDAR_TONE_STYLES[eventTone(event, now)]
                            .dot,
                        )}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{event.title}</span>
                    </span>
                    <span className={cn('text-xs', hintClassName)}>
                      {PROJECT_CALENDAR_EVENT_TYPE_LABELS[event.type]}
                      {' · '}
                      {event.type === 'deadline'
                        ? `${formatJakartaDate(event.startAt)} · ${deadlineCountdown(event.startAt, now)}`
                        : `${formatJakartaDateTime(event.startAt)} – ${event.endAt ? formatJakartaDateTime(event.endAt) : '—'}`}
                    </span>
                    {event.notes ? (
                      <span className={cn('text-xs', hintClassName)}>
                        {event.notes}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {view === 'gantt' ? (
        <ProjectGanttChart
          events={events}
          onSelectEvent={(event) => setEditor(eventToEditor(event))}
        />
      ) : null}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editor?.id ? 'Edit event' : 'Add event'}
            </DialogTitle>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-sm text-(--muted)">Type</p>
                <Combobox
                  value={editor.type}
                  onValueChange={(value) => {
                    if (
                      !PROJECT_CALENDAR_EVENT_TYPES.includes(
                        value as ProjectCalendarEventType,
                      )
                    ) {
                      return
                    }
                    setEditor({
                      ...editor,
                      type: value as ProjectCalendarEventType,
                    })
                  }}
                  options={TYPE_OPTIONS}
                  placeholder="Type…"
                  searchPlaceholder="Search type…"
                  emptyText="No type found."
                  aria-label="Event type"
                  className="w-full sm:w-full"
                />
              </div>

              {editor.type === 'deadline' ? (
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_CALENDAR_DEADLINE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!canManage}
                      className={cn(
                        buttonOutlineClassName,
                        'px-2 py-1 text-[11px] text-red-700',
                      )}
                      onClick={() => setEditor({ ...editor, title: preset })}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="block space-y-1 text-sm">
                <span className="text-(--muted)">Title</span>
                <input
                  className={cn(inputClassName, 'w-full')}
                  value={editor.title}
                  disabled={!canManage}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-(--muted)">Notes</span>
                <textarea
                  className={cn(inputClassName, 'min-h-16 w-full')}
                  value={editor.notes}
                  disabled={!canManage}
                  onChange={(e) =>
                    setEditor({ ...editor, notes: e.target.value })
                  }
                />
              </label>

              <DateField
                label={editor.type === 'deadline' ? 'Due date' : 'From'}
                ymd={splitLocal(editor.startLocal).ymd}
                hm={splitLocal(editor.startLocal).hm}
                showTime={editor.type === 'range'}
                disabled={!canManage}
                onChange={({ ymd, hm }) =>
                  setEditor({
                    ...editor,
                    startLocal: joinLocal(ymd, hm),
                  })
                }
              />

              {editor.type === 'range' ? (
                <DateField
                  label="Until"
                  ymd={splitLocal(editor.endLocal).ymd}
                  hm={splitLocal(editor.endLocal).hm}
                  showTime
                  disabled={!canManage}
                  onChange={({ ymd, hm }) =>
                    setEditor({
                      ...editor,
                      endLocal: joinLocal(ymd, hm),
                    })
                  }
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {canManage && editor?.id ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto inline-flex items-center gap-1.5 text-red-700"
                disabled={saving}
                onClick={() => void deleteEditor()}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditor(null)}
            >
              Cancel
            </Button>
            {canManage ? (
              <Button
                type="button"
                disabled={saving}
                onClick={() => void saveEditor()}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DateField({
  label,
  ymd,
  hm,
  showTime,
  disabled,
  onChange,
}: {
  label: string
  ymd: string
  hm: string
  showTime: boolean
  disabled?: boolean
  onChange: (next: { ymd: string; hm: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = ymdToLocalDate(ymd)

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-(--muted)">{label}</p>
      <div className={cn('flex flex-wrap gap-2', showTime && 'items-start')}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-start font-normal sm:w-auto sm:min-w-[12rem]',
                !ymd && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="size-4" aria-hidden />
              {ymd ? formatYmdLabel(ymd) : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(date) => {
                if (!date) return
                onChange({ ymd: localDateToYmd(date), hm })
                setOpen(false)
              }}
              defaultMonth={selected}
            />
          </PopoverContent>
        </Popover>
        {showTime ? (
          <Combobox
            value={hm}
            onValueChange={(value) => onChange({ ymd, hm: value || hm })}
            options={TIME_OPTIONS}
            placeholder="Time…"
            searchPlaceholder="Search time…"
            emptyText="No time found."
            aria-label={`${label} time`}
            className="w-full sm:w-[7.5rem]"
          />
        ) : null}
      </div>
    </div>
  )
}

const REMINDER_LIMIT = 4

function ReminderCard({
  label,
  meta,
  count,
  emptyText,
  children,
}: {
  label: string
  meta?: string
  count: number
  emptyText: string
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const items = Children.toArray(children)
  const needsExpand = items.length > REMINDER_LIMIT
  const shown =
    expanded || !needsExpand ? items : items.slice(0, REMINDER_LIMIT)

  return (
    <section className="flex flex-col rounded-md border border-(--line) bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-(--line) px-3 py-2">
        <div className="flex items-baseline gap-2">
          <h3 className={metaTextClassName}>
            {label}
          </h3>
          {count > 0 ? (
            <span className="rounded-full bg-(--surface) px-1.5 text-[10px] tabular-nums text-(--muted)">
              {count}
            </span>
          ) : null}
        </div>
        {meta ? (
          <span className="text-[11px] tabular-nums text-(--muted)">{meta}</span>
        ) : null}
      </header>
      {count === 0 ? (
        <p className={cn('px-3 py-3 text-xs', hintClassName)}>{emptyText}</p>
      ) : (
        <>
          <ul className="divide-y divide-(--line)">{shown}</ul>
          {needsExpand ? (
            <button
              type="button"
              className="border-t border-(--line) px-3 py-2 text-left text-[11px] text-(--muted) underline-offset-4 hover:text-(--ink) hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Show less'
                : `Show all ${items.length}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

function ReminderRow({
  event,
  primary,
  secondary,
  ongoing,
  onClick,
}: {
  event: ProjectCalendarEvent
  /** Right-aligned emphasis, e.g. countdown */
  primary: string
  /** Quiet line under the title, e.g. "Ends 17:00 WIB" */
  secondary: string
  ongoing?: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition hover:bg-(--surface)"
        onClick={onClick}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {ongoing ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-(--accent)"
                aria-label="Ongoing"
              />
            ) : null}
            <span className="truncate text-sm font-medium text-(--ink)">
              {event.title}
            </span>
          </span>
          <span className={cn('block text-[11px]', hintClassName)}>
            {secondary}
          </span>
        </span>
        <span className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-(--ink)/80">
          {primary}
        </span>
      </button>
    </li>
  )
}

function ReminderStrip({
  agenda,
  now,
  onSelectEvent,
}: {
  agenda: ProjectCalendarAgenda | null
  now: Date
  onSelectEvent: (event: ProjectCalendarEvent) => void
}) {
  if (!agenda) return null

  const localClock = `${formatJakartaTime(now)} WIB`
  const todayLabel = now.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })

  const upcomingSorted = [...agenda.upcoming].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )
  const dueSorted = [...agenda.dueIn].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  )

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ReminderCard
        label="Today"
        meta={`${todayLabel} · ${localClock}`}
        count={agenda.today.length}
        emptyText="Nothing scheduled today."
      >
        {agenda.today.map((event) => {
          const status = todayStatus(event, now)
          return (
            <ReminderRow
              key={event.id}
              event={event}
              primary={status.relative}
              secondary={`${status.phase} ${status.time} WIB`}
              ongoing={status.ongoing}
              onClick={() => onSelectEvent(event)}
            />
          )
        })}
      </ReminderCard>

      <ReminderCard
        label="Upcoming"
        count={upcomingSorted.length}
        emptyText="No upcoming events."
      >
        {upcomingSorted.map((event) => (
          <ReminderRow
            key={event.id}
            event={event}
            primary={deadlineCountdown(event.startAt, now)}
            secondary={
              event.type === 'deadline'
                ? `Deadline · ${formatJakartaDate(event.startAt)}`
                : `${formatJakartaDate(event.startAt)} ${formatJakartaTime(event.startAt)} – ${event.endAt ? formatJakartaDate(event.endAt) : '—'}`
            }
            onClick={() => onSelectEvent(event)}
          />
        ))}
      </ReminderCard>

      <ReminderCard
        label="Due in"
        meta={`Next ${DEADLINE_NEAR_DAYS} days`}
        count={dueSorted.length}
        emptyText={`No deadlines in the next ${DEADLINE_NEAR_DAYS} days.`}
      >
        {dueSorted.map((event) => (
          <ReminderRow
            key={event.id}
            event={event}
            primary={relativeCountdown(event.startAt, now)}
            secondary={`${formatJakartaDate(event.startAt)} · ${deadlineCountdown(event.startAt, now)}`}
            onClick={() => onSelectEvent(event)}
          />
        ))}
      </ReminderCard>
    </div>
  )
}
