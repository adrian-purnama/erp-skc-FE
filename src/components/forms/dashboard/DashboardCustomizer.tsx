import { SlidersHorizontal } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { hintClassName, metaTextClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type CustomizableMetric = {
  id: string
  label: string
  description: string
  group: string
}

type Props = {
  metrics: CustomizableMetric[]
  selected: string[]
  defaults: string[]
  disabled?: boolean
  /** Next selection, kept in the metrics' own order. */
  onChange: (next: string[]) => void
}

/** "Customize" popover: tick the metrics to show on a dashboard. */
export default function DashboardCustomizer({
  metrics,
  selected,
  defaults,
  disabled,
  onChange,
}: Props) {
  const groups = [...new Set(metrics.map((m) => m.group))]
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    onChange(metrics.map((m) => m.id).filter((m) => next.has(m)))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group} className="space-y-1">
              <p className={metaTextClassName}>{group}</p>
              <ul>
                {metrics
                  .filter((m) => m.group === group)
                  .map((m) => {
                    const checked = selected.includes(m.id)
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-(--surface)">
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(v) => toggle(m.id, v === true)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm text-(--ink)">{m.label}</span>
                            <span className={cn('block text-xs', hintClassName)}>
                              {m.description}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-(--line) px-3 py-2">
          <span className={cn('text-xs', hintClassName)}>
            {selected.length} of {metrics.length} shown
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(defaults)}>
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
