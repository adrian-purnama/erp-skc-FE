import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Info, LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react'
import SCurveChart from '#/components/forms/schedule/SCurveChart'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { apiFetch } from '#/lib/api'
import {
  formatPct,
  formatYmdShort,
  periodLabel,
  pointDeviation,
} from '#/lib/projectSchedule'
import type {
  ProjectSCurve,
  ProjectSchedule,
  ProjectScheduleWindows,
  SCurveItem,
  SCurvePeriod,
} from '#/lib/projectSchedule'
import {
  hintClassName,
  inputClassNameCompact,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  canManage: boolean
  /** After a save or baseline, so the calendar can refresh its schedule events. */
  onChanged?: () => void
}

type Draft = {
  plannedStartDate: string
  plannedFinishDate: string
  items: Record<string, Record<keyof ProjectScheduleWindows, string>>
}

const PERIOD_OPTIONS = [
  { value: 'week', label: 'Weekly' },
  { value: 'day', label: 'Daily' },
]

function toDraft(s: ProjectSchedule): Draft {
  return {
    plannedStartDate: s.plannedStartDate ?? '',
    plannedFinishDate: s.plannedFinishDate ?? '',
    items: Object.fromEntries(
      s.items.map((i) => [
        i.itemId,
        {
          makeStart: i.makeStart ?? '',
          makeFinish: i.makeFinish ?? '',
          installStart: i.installStart ?? '',
          installFinish: i.installFinish ?? '',
        },
      ]),
    ),
  }
}

const orNull = (v: string) => (v.trim() ? v : null)

/** Planned dates per item (estimates) and the S-curve; actual comes from SPK reports. */
export default function ProjectSchedulePanel({ projectId, canManage, onChanged }: Props) {
  const [schedule, setSchedule] = useState<ProjectSchedule | null>(null)
  const [curve, setCurve] = useState<ProjectSCurve | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [period, setPeriod] = useState<SCurvePeriod>('week')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmBaseline, setConfirmBaseline] = useState(false)

  const loadCurve = useCallback(
    async (p: SCurvePeriod) => {
      const res = await apiFetch<ProjectSCurve>(`/project/${projectId}/s-curve?period=${p}`)
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load S-curve')
      setCurve(res.data)
    },
    [projectId],
  )

  const load = useCallback(
    async (p: SCurvePeriod) => {
      setLoading(true)
      setError(null)
      try {
        const res = await apiFetch<ProjectSchedule>(`/project/${projectId}/schedule`)
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to load schedule')
        setSchedule(res.data)
        setDraft(toDraft(res.data))
        await loadCurve(p)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to reach the server')
      } finally {
        setLoading(false)
      }
    },
    [projectId, loadCurve],
  )

  useEffect(() => {
    setPeriod('week')
    void load('week')
  }, [load])

  const changePeriod = (p: SCurvePeriod) => {
    setPeriod(p)
    loadCurve(p).catch((e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'Failed to load S-curve'),
    )
  }

  const dirty = useMemo(
    () => !!schedule && !!draft && JSON.stringify(toDraft(schedule)) !== JSON.stringify(draft),
    [schedule, draft],
  )

  const actualById = useMemo(
    () => new Map((curve?.items ?? []).map((i) => [i.itemId, i])),
    [curve],
  )

  async function save() {
    if (!draft || !schedule || saving) return
    setSaving(true)
    try {
      const res = await apiFetch<ProjectSchedule>(`/project/${projectId}/schedule`, {
        method: 'PUT',
        body: JSON.stringify({
          plannedStartDate: orNull(draft.plannedStartDate),
          plannedFinishDate: orNull(draft.plannedFinishDate),
          items: schedule.items.map((i) => {
            const w = draft.items[i.itemId]
            return {
              itemId: i.itemId,
              makeStart: orNull(w.makeStart),
              makeFinish: orNull(w.makeFinish),
              installStart: orNull(w.installStart),
              installFinish: orNull(w.installFinish),
            }
          }),
        }),
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to save plan')
        return
      }
      setSchedule(res.data)
      setDraft(toDraft(res.data))
      await loadCurve(period)
      toast.success('Plan saved')
      onChanged?.()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function setBaseline() {
    if (saving) return
    setSaving(true)
    try {
      const res = await apiFetch<ProjectSchedule>(`/project/${projectId}/schedule/baseline`, {
        method: 'POST',
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to set baseline')
        return
      }
      setSchedule(res.data)
      setDraft(toDraft(res.data))
      await loadCurve(period)
      toast.success('Baseline set')
      onChanged?.()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
      setConfirmBaseline(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading S-curve…
      </div>
    )
  }

  if (error || !schedule || !draft) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700 dark:text-red-300">{error ?? 'S-curve not found'}</p>
        <Button type="button" variant="outline" onClick={() => void load(period)}>
          Retry
        </Button>
      </div>
    )
  }

  const editable = canManage && !saving
  const setItem = (itemId: string, key: keyof ProjectScheduleWindows, value: string) =>
    setDraft({
      ...draft,
      items: { ...draft.items, [itemId]: { ...draft.items[itemId], [key]: value } },
    })
  const hasCurve = !!curve && curve.points.length > 0

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-md border border-(--line) bg-(--background)">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--line) px-4 py-3">
          {curve ? <TodaySummary curve={curve} /> : <span />}
          <Combobox
            value={period}
            onValueChange={(v) => {
              if (v === 'week' || v === 'day') changePeriod(v)
            }}
            options={PERIOD_OPTIONS}
            placeholder="Period…"
            searchPlaceholder="Search period…"
            emptyText="No period found."
            aria-label="Period"
            className="w-full sm:w-32"
          />
        </header>
        <div className="px-4 py-4">
          {hasCurve ? (
            <SCurveChart period={curve.period} points={curve.points} today={curve.today} />
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">No plan yet</p>
              <p className={cn('mt-1 text-sm', hintClassName)}>
                Set the project dates and each item&apos;s planned dates below.
              </p>
            </div>
          )}
        </div>
        <p className="flex items-start gap-2 border-t border-(--line) bg-(--surface) px-4 py-2.5 text-xs text-(--muted)">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-(--ink)">Plan</span> is your estimate, set below.{' '}
            <span className="font-medium text-(--ink)">Actual</span> progress and dates come
            from each item&apos;s SPK reports, weighted by RAB value.
          </span>
        </p>
      </section>

      {hasCurve ? <KurvaSTable curve={curve} /> : null}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className={sectionTitleClassName}>Planned dates</h2>
            <p className={cn('text-sm', hintClassName)}>
              {schedule.baseline
                ? `Baseline set on ${formatYmdShort(schedule.baseline.setAt.slice(0, 10), true)}.`
                : 'No baseline yet. Set one once the plan is agreed.'}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving || dirty}
                title={dirty ? 'Save the plan first' : undefined}
                onClick={() => setConfirmBaseline(true)}
              >
                {schedule.baseline ? 'Reset baseline' : 'Set baseline'}
              </Button>
              <Button type="button" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save plan'}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <DateRange
            label="Project"
            start={draft.plannedStartDate}
            finish={draft.plannedFinishDate}
            disabled={!editable}
            onStart={(v) => setDraft({ ...draft, plannedStartDate: v })}
            onFinish={(v) => setDraft({ ...draft, plannedFinishDate: v })}
          />
          <p className={cn('pb-2 text-xs', hintClassName)}>Same dates as in Edit project.</p>
        </div>

        {schedule.items.length === 0 ? (
          <p className={cn('text-sm', hintClassName)}>No shop drawing items yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-(--line)">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-(--surface) text-left text-xs text-(--muted)">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="px-3 py-2 font-medium">Making (plan)</th>
                  <th className="px-3 py-2 font-medium">Install (plan)</th>
                  <th className="px-3 py-2 font-medium">Actual (from SPK)</th>
                </tr>
              </thead>
              <tbody>
                {schedule.items.map((item) => {
                  const w = draft.items[item.itemId]
                  return (
                    <tr
                      key={item.itemId}
                      className={cn(
                        'border-t border-(--line) align-middle',
                        item.weightPercent === 0 && 'opacity-60',
                      )}
                    >
                      <td className="max-w-56 truncate px-3 py-2 font-medium" title={item.label}>
                        {item.label}
                      </td>
                      <td
                        className="px-3 py-2 text-right tabular-nums"
                        title={
                          item.installSharePercent > 0
                            ? `Install is ${formatPct(item.installSharePercent)} of this item`
                            : undefined
                        }
                      >
                        {formatPct(item.weightPercent)}
                      </td>
                      <td className="px-3 py-1.5">
                        <DateRange
                          label={`${item.label} making`}
                          hideLabel
                          start={w.makeStart}
                          finish={w.makeFinish}
                          disabled={!editable}
                          onStart={(v) => setItem(item.itemId, 'makeStart', v)}
                          onFinish={(v) => setItem(item.itemId, 'makeFinish', v)}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {item.installSharePercent > 0 || w.installStart || w.installFinish ? (
                          <DateRange
                            label={`${item.label} install`}
                            hideLabel
                            start={w.installStart}
                            finish={w.installFinish}
                            disabled={!editable}
                            onStart={(v) => setItem(item.itemId, 'installStart', v)}
                            onFinish={(v) => setItem(item.itemId, 'installFinish', v)}
                          />
                        ) : (
                          <span className={cn('text-xs', hintClassName)}>No install</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <ActualCell actual={actualById.get(item.itemId)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {schedule.warnings.length > 0 ? (
          <details className="text-sm text-amber-800 dark:text-amber-200">
            <summary className="inline-flex cursor-pointer items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden />
              {schedule.warnings.length} thing{schedule.warnings.length === 1 ? '' : 's'} to
              finish in the plan
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs">
              {schedule.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <AlertDialog open={confirmBaseline} onOpenChange={setConfirmBaseline}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {schedule.baseline ? 'Replace the baseline?' : 'Set the baseline?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              The current planned dates and weights are frozen as the original plan
              {schedule.baseline ? ', replacing the old baseline' : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault()
                void setBaseline()
              }}
            >
              {saving ? 'Saving…' : schedule.baseline ? 'Replace' : 'Set baseline'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Start → finish date pair. */
function DateRange({
  label,
  hideLabel = false,
  start,
  finish,
  disabled,
  onStart,
  onFinish,
}: {
  label: string
  hideLabel?: boolean
  start: string
  finish: string
  disabled: boolean
  onStart: (v: string) => void
  onFinish: (v: string) => void
}) {
  return (
    <fieldset className="space-y-1">
      <legend className={cn('text-sm text-(--muted)', hideLabel && 'sr-only')}>{label}</legend>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          aria-label={`${label} start`}
          className={cn(inputClassNameCompact, 'w-[8.75rem]')}
          value={start}
          disabled={disabled}
          onChange={(e) => onStart(e.target.value)}
        />
        <span className="text-(--muted)" aria-hidden>
          →
        </span>
        <input
          type="date"
          aria-label={`${label} finish`}
          className={cn(inputClassNameCompact, 'w-[8.75rem]')}
          value={finish}
          min={start || undefined}
          disabled={disabled}
          onChange={(e) => onFinish(e.target.value)}
        />
      </div>
    </fieldset>
  )
}

/** Actual dates + progress of one item, from its SPK reports. */
function ActualCell({ actual }: { actual: SCurveItem | undefined }) {
  if (!actual?.actualStart) {
    return <span className={cn('text-xs', hintClassName)}>Not started</span>
  }
  return (
    <div className="space-y-0.5 text-xs">
      <p className="tabular-nums">
        {formatYmdShort(actual.actualStart)} →{' '}
        {actual.actualFinish ? formatYmdShort(actual.actualFinish) : 'ongoing'}
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-(--line)" aria-hidden>
          <div
            className="h-full rounded-full bg-[#eb6834] dark:bg-[#d95926]"
            style={{ width: `${Math.min(100, actual.actualPct)}%` }}
          />
        </div>
        <span className="tabular-nums text-(--muted)">{formatPct(actual.actualPct)}</span>
      </div>
    </div>
  )
}

function TodaySummary({ curve }: { curve: ProjectSCurve }) {
  const { today } = curve
  const behind = today.deviationPct < 0
  const DevIcon = behind ? TrendingDown : TrendingUp
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <div className="flex items-baseline gap-1.5">
        <dt className="text-(--muted)">Plan today</dt>
        <dd className="font-medium tabular-nums">{formatPct(today.plannedPct)}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-(--muted)">Actual</dt>
        <dd className="font-medium tabular-nums">{formatPct(today.actualPct)}</dd>
      </div>
      {today.baselinePct !== null ? (
        <div className="flex items-baseline gap-1.5">
          <dt className="text-(--muted)">Baseline</dt>
          <dd className="font-medium tabular-nums">{formatPct(today.baselinePct)}</dd>
        </div>
      ) : null}
      <div>
        <dt className="sr-only">Deviation</dt>
        <dd
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset',
            behind
              ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
          )}
        >
          <DevIcon className="size-3.5" aria-hidden />
          {behind ? 'Behind' : 'On track'} {today.deviationPct > 0 ? '+' : ''}
          {today.deviationPct.toFixed(2)}%
        </dd>
      </div>
    </dl>
  )
}

/** The classic Kurva S table: items × periods, with plan / actual / deviation footers. */
function KurvaSTable({ curve }: { curve: ProjectSCurve }) {
  const cell = (n: number | null) => (n === null || n === 0 ? '' : n.toFixed(2))
  const footRow = (label: string, values: Array<number | null>, strong = false) => (
    <tr className="border-t border-(--line)">
      <th
        scope="row"
        colSpan={2}
        className={cn(
          'sticky left-0 bg-(--surface) px-3 py-1.5 text-left',
          strong ? 'font-medium' : 'font-normal text-(--muted)',
        )}
      >
        {label}
      </th>
      {values.map((v, i) => (
        <td key={i} className="px-2 py-1.5 text-right tabular-nums">
          {v === null ? '' : v.toFixed(2)}
        </td>
      ))}
    </tr>
  )
  return (
    <details className="group rounded-md border border-(--line)">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium">Kurva S table</summary>
      <div className="overflow-x-auto border-t border-(--line)">
        <table className="text-xs">
          <thead className="bg-(--surface) text-(--muted)">
            <tr>
              <th className="sticky left-0 bg-(--surface) px-3 py-2 text-left font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Weight %</th>
              {curve.points.map((p) => (
                <th
                  key={p.periodIndex}
                  className={cn(
                    'px-2 py-2 text-right font-medium',
                    p.periodIndex === curve.today.periodIndex && 'text-(--ink)',
                  )}
                  title={`${formatYmdShort(p.periodStart)} – ${formatYmdShort(p.periodEnd)}`}
                >
                  {periodLabel(curve.period, p.periodIndex)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {curve.items.map((it) => (
              <tr key={it.itemId} className="border-t border-(--line)">
                <td
                  className="sticky left-0 max-w-48 truncate bg-(--background) px-3 py-1.5"
                  title={it.label}
                >
                  {it.label}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {it.weightPercent.toFixed(2)}
                </td>
                {it.plannedByPeriod.map((v, i) => (
                  <td
                    key={i}
                    className={cn('px-2 py-1.5 text-right tabular-nums', v > 0 && 'bg-[#2a78d6]/10')}
                  >
                    {cell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {footRow('Plan this period', curve.points.map((p) => p.plannedDeltaPct))}
            {footRow('Plan cumulative', curve.points.map((p) => p.plannedPct), true)}
            {curve.points.some((p) => p.baselinePct !== null)
              ? footRow('Baseline cumulative', curve.points.map((p) => p.baselinePct))
              : null}
            {footRow('Actual this period', curve.points.map((p) => p.actualDeltaPct))}
            {footRow('Actual cumulative', curve.points.map((p) => p.actualPct), true)}
            {footRow('Deviation', curve.points.map((p) => pointDeviation(p, curve.today)))}
          </tfoot>
        </table>
      </div>
    </details>
  )
}
