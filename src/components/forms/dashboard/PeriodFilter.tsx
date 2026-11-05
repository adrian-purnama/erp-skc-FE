import { Combobox } from '#/components/ui/combobox'
import { shiftYmd, todayYmdJakarta } from '#/lib/projectCalendar'
import { inputClassNameCompact } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type PeriodPreset =
  | 'all'
  | 'this-month'
  | 'last-30'
  | 'this-quarter'
  | 'this-year'
  | 'last-year'
  | 'custom'

export type PeriodValue = { preset: PeriodPreset; from: string; to: string }

export const ALL_TIME: PeriodValue = { preset: 'all', from: '', to: '' }

const OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
]

/** Inclusive YYYY-MM-DD range of a period, or null for all time. */
export function periodRange(value: PeriodValue): { from: string; to: string } | null {
  const today = todayYmdJakarta()
  const [y, m] = today.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  switch (value.preset) {
    case 'all':
      return null
    case 'this-month':
      return { from: `${y}-${pad(m)}-01`, to: today }
    case 'last-30':
      return { from: shiftYmd(today, -29), to: today }
    case 'this-quarter': {
      const q = Math.floor((m - 1) / 3) * 3 + 1
      return { from: `${y}-${pad(q)}-01`, to: today }
    }
    case 'this-year':
      return { from: `${y}-01-01`, to: today }
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'custom':
      return value.from || value.to
        ? { from: value.from || '0000-01-01', to: value.to || '9999-12-31' }
        : null
  }
}

/** Period picker: presets, or a custom from–to range. */
export default function PeriodFilter({
  value,
  onChange,
  label = 'Period',
}: {
  value: PeriodValue
  onChange: (next: PeriodValue) => void
  label?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Combobox
        value={value.preset}
        onValueChange={(v) => {
          const preset = OPTIONS.find((o) => o.value === v)?.value
          if (preset) onChange({ ...value, preset })
        }}
        options={OPTIONS}
        placeholder={label}
        searchPlaceholder="Search period…"
        emptyText="No period found."
        aria-label={label}
        className="w-40 shrink-0"
      />
      {value.preset === 'custom' ? (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From"
            className={cn(inputClassNameCompact, 'w-[8.75rem]')}
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className="text-(--muted)" aria-hidden>
            →
          </span>
          <input
            type="date"
            aria-label="To"
            className={cn(inputClassNameCompact, 'w-[8.75rem]')}
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  )
}
