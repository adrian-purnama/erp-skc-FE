import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { CalendarIcon, Copy, LoaderCircle } from 'lucide-react'
import ListPagination from '#/components/forms/shared/ListPagination'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  actionLabel,
  changeSummary,
  shortId,
  type AuditAction,
  type AuditCollection,
  type AuditEvent,
  type AuditListResult,
} from '#/lib/audit'
import {
  fieldDiff,
  formatAuditValue,
  isObjectIdString,
} from '#/lib/auditDiff'
import { apiFetch } from '#/lib/api'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  cardClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const PAGE_SIZE = 25

function ymdToLocalDate(ymd: string): Date | undefined {
  if (!ymd) return undefined
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function localDateToYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function DateFilterField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (ymd: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = ymdToLocalDate(value)

  return (
    <div className="space-y-1 text-sm">
      <span className={hintClassName}>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'w-full justify-start font-normal',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="size-4" aria-hidden />
            {selected ? format(selected, 'PP') : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? localDateToYmd(date) : '')
              setOpen(false)
            }}
            defaultMonth={selected}
          />
          {value ? (
            <div className="border-t border-[var(--line)] p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy')
  }
}

function ActionBadge({ action }: { action: AuditAction }) {
  const label = actionLabel(action)
  const tone =
    action === 'A'
      ? 'bg-emerald-500/15 text-emerald-800'
      : action === 'U'
        ? 'bg-amber-500/15 text-amber-900'
        : 'bg-red-500/15 text-red-800'
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      {label}
    </span>
  )
}

function IdChip({ id, className }: { id: string; className?: string }) {
  return (
    <button
      type="button"
      title={id}
      onClick={(e) => {
        e.stopPropagation()
        void copyText(id)
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--ink)] hover:bg-[var(--line)]/30',
        className,
      )}
    >
      {shortId(id)}
      <Copy className="size-3 opacity-60" aria-hidden />
    </button>
  )
}

function ValueView({ value }: { value: unknown }) {
  if (isObjectIdString(value)) {
    return <IdChip id={value} />
  }
  const text = formatAuditValue(value)
  const multiline = text.includes('\n') || text.length > 80
  if (multiline) {
    return (
      <pre className="max-h-40 overflow-auto rounded border border-[var(--line)] bg-[var(--surface)] p-2 font-mono text-xs whitespace-pre-wrap">
        {text}
      </pre>
    )
  }
  return <span className="text-sm break-all">{text}</span>
}

function DiffBody({ event, showUnchanged }: { event: AuditEvent; showUnchanged: boolean }) {
  if (event.action === 'A') {
    const rows = fieldDiff(null, event.after).filter(
      (r) => showUnchanged || r.after !== undefined,
    )
    return (
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
            <span className={`text-sm ${hintClassName}`}>{row.key}</span>
            <ValueView value={row.after} />
          </li>
        ))}
      </ul>
    )
  }

  if (event.action === 'D') {
    const rows = fieldDiff(event.before, null)
    return (
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
            <span className={`text-sm ${hintClassName}`}>{row.key}</span>
            <ValueView value={row.before} />
          </li>
        ))}
      </ul>
    )
  }

  const rows = fieldDiff(event.before, event.after).filter(
    (r) => showUnchanged || r.changed,
  )
  if (rows.length === 0) {
    return <p className={hintClassName}>No field differences.</p>
  }
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1 border-b border-[var(--line)] pb-3 last:border-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{row.key}</span>
            {row.changed ? (
              <span className="text-xs text-amber-800">changed</span>
            ) : (
              <span className={`text-xs ${hintClassName}`}>unchanged</span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className={`mb-1 text-xs ${hintClassName}`}>Before</p>
              <div className={row.changed ? 'line-through opacity-70' : undefined}>
                <ValueView value={row.before} />
              </div>
            </div>
            <div>
              <p className={`mb-1 text-xs ${hintClassName}`}>After</p>
              <ValueView value={row.after} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default function AuditViewerForm() {
  const [collections, setCollections] = useState<AuditCollection[]>([])
  const [collection, setCollection] = useState('')
  const [action, setAction] = useState<'' | AuditAction>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [refId, setRefId] = useState('')
  const [actorEmail, setActorEmail] = useState('')
  const debouncedRefId = useDebouncedValue(refId, 250)
  const debouncedActor = useDebouncedValue(actorEmail, 250)

  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [list, setList] = useState<AuditListResult | null>(null)

  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [viewMode, setViewMode] = useState<'diff' | 'raw'>('diff')
  const [showUnchanged, setShowUnchanged] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<AuditCollection[]>('/admin/audit/collections')
        if (!res.success || !res.data) {
          toast.error(res.message || 'Failed to load collections')
          return
        }
        if (cancelled) return
        setCollections(res.data)
        if (res.data.length > 0) {
          setCollection((prev) => prev || res.data![0]!.key)
        }
      } catch {
        toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [collection, action, from, to, debouncedRefId, debouncedActor])

  useEffect(() => {
    if (!collection) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(PAGE_SIZE))
        if (action) params.set('action', action)
        if (from) params.set('from', new Date(from).toISOString())
        if (to) {
          const end = new Date(to)
          end.setHours(23, 59, 59, 999)
          params.set('to', end.toISOString())
        }
        const rid = debouncedRefId.trim()
        if (rid) params.set('refId', rid)
        const actor = debouncedActor.trim()
        if (actor) {
          if (/^[a-f\d]{24}$/i.test(actor)) params.set('by', actor)
          else params.set('actorEmail', actor)
        }
        const res = await apiFetch<AuditListResult>(
          `/admin/audit/${encodeURIComponent(collection)}?${params}`,
        )
        if (!res.success || !res.data) {
          if (!cancelled) toast.error(res.message || 'Failed to load audit')
          return
        }
        if (!cancelled) setList(res.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [collection, action, from, to, debouncedRefId, debouncedActor, page])

  const totalPages = useMemo(() => {
    if (!list) return 1
    return Math.max(1, Math.ceil(list.total / list.limit))
  }, [list])

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className={sectionTitleClassName}>Filters</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 text-sm">
            <span className={hintClassName}>Collection</span>
            <Combobox
              value={collection}
              onValueChange={setCollection}
              options={collections.map((c) => ({
                value: c.key,
                label: c.label,
              }))}
              placeholder={
                collections.length === 0 ? 'No collections' : 'Select collection…'
              }
              searchPlaceholder="Search collection…"
              emptyText="No collection found."
              aria-label="Collection"
            />
          </div>

          <div className="space-y-1 text-sm">
            <span className={hintClassName}>Action</span>
            <Combobox
              value={action || 'all'}
              onValueChange={(value) =>
                setAction(value === 'all' ? '' : (value as AuditAction))
              }
              options={[
                { value: 'all', label: 'All' },
                { value: 'A', label: 'Created' },
                { value: 'U', label: 'Updated' },
                { value: 'D', label: 'Deleted' },
              ]}
              placeholder="All"
              className="w-full"
              aria-label="Action"
            />
          </div>

          <div className="space-y-1 text-sm">
            <span className={hintClassName}>Entity ID</span>
            <Input
              className="font-mono"
              value={refId}
              onChange={(e) => setRefId(e.target.value)}
              placeholder="ObjectId…"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1 text-sm">
            <span className={hintClassName}>Actor (email or user id)</span>
            <Input
              value={actorEmail}
              onChange={(e) => setActorEmail(e.target.value)}
              placeholder="Search actor…"
              autoComplete="off"
            />
          </div>

          <DateFilterField label="From" value={from} onChange={setFrom} />
          <DateFilterField label="To" value={to} onChange={setTo} />
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className={`flex items-center gap-2 py-4 ${hintClassName}`}>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading audit…
          </div>
        ) : !list || list.items.length === 0 ? (
          <p className={`${cardClassName} px-4 py-8 text-center ${hintClassName}`}>
            No audit events for these filters.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                <thead>
                  <tr className={`border-b border-[var(--line)] ${hintClassName}`}>
                    <th className="px-2 py-2 font-medium">When</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                    <th className="px-2 py-2 font-medium">Entity</th>
                    <th className="px-2 py-2 font-medium">Actor</th>
                    <th className="px-2 py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((event) => {
                    const when = new Date(event.at)
                    return (
                      <tr
                        key={event.id}
                        className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--surface)]"
                        onClick={() => {
                          setSelected(event)
                          setViewMode('diff')
                          setShowUnchanged(false)
                        }}
                      >
                        <td className="px-2 py-2.5 align-top">
                          <span title={format(when, 'PPpp')}>
                            {formatDistanceToNow(when, { addSuffix: true })}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <ActionBadge action={event.action} />
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          <div className="space-y-1">
                            {event.summary.label ? (
                              <div className="font-medium">{event.summary.label}</div>
                            ) : null}
                            <IdChip id={event.refId} />
                          </div>
                        </td>
                        <td className="px-2 py-2.5 align-top">
                          {event.by ? (
                            <span className="break-all">{event.by.email}</span>
                          ) : (
                            <span className={hintClassName}>System</span>
                          )}
                        </td>
                        <td className={`px-2 py-2.5 align-top ${hintClassName}`}>
                          {changeSummary(event)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <ListPagination
              page={page}
              totalPages={totalPages}
              totalItems={list.total}
              pageSize={list.limit}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <Dialog
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <ActionBadge action={selected.action} />
                  <span>{selected.summary.label || 'Audit event'}</span>
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 text-left text-sm">
                    <p>{format(new Date(selected.at), 'PPpp')}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={hintClassName}>Entity</span>
                      <IdChip id={selected.refId} />
                      <span className={hintClassName}>Event</span>
                      <IdChip id={selected.id} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={hintClassName}>Actor</span>
                      {selected.by ? (
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: selected.by.id }}
                          className="text-[var(--ink)] underline-offset-2 hover:underline"
                        >
                          {selected.by.email}
                        </Link>
                      ) : (
                        <span>System</span>
                      )}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'diff' ? 'default' : 'outline'}
                  onClick={() => setViewMode('diff')}
                >
                  Pretty diff
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === 'raw' ? 'default' : 'outline'}
                  onClick={() => setViewMode('raw')}
                >
                  Raw JSON
                </Button>
                {viewMode === 'diff' && selected.action === 'U' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowUnchanged((v) => !v)}
                  >
                    {showUnchanged ? 'Hide unchanged' : 'Show unchanged'}
                  </Button>
                ) : null}
              </div>

              {viewMode === 'diff' ? (
                <DiffBody event={selected} showUnchanged={showUnchanged} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className={`mb-1 text-xs ${hintClassName}`}>Before</p>
                    <pre className="max-h-80 overflow-auto rounded border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(selected.before, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <p className={`mb-1 text-xs ${hintClassName}`}>After</p>
                    <pre className="max-h-80 overflow-auto rounded border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(selected.after, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
