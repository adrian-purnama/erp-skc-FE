import { Plus, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { dialogInputClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** Notes are stored one item per line. */
export function notesToList(notes: string): string[] {
  return notes === '' ? [] : notes.split(/\r?\n/)
}

type Props = {
  notes: string
  onChange: (notes: string) => void
  disabled?: boolean
}

/** Numbered note list: one input per note, Enter adds the next one. */
export default function ProductionNotesField({
  notes,
  onChange,
  disabled,
}: Props) {
  const items = notesToList(notes)
  const update = (next: string[]) => onChange(next.join('\n'))

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">Notes</span>
      {items.length > 0 ? (
        <ol className="space-y-1.5">
          {items.map((note, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-(--muted) tabular-nums">
                {i + 1}.
              </span>
              <input
                value={note}
                disabled={disabled}
                autoFocus={note === '' && i === items.length - 1}
                onChange={(e) =>
                  update(items.map((n, j) => (j === i ? e.target.value : n)))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    update([...items, ''])
                  }
                }}
                placeholder="Finishing, packing, delivery…"
                className={cn(dialogInputClassName, 'min-w-0 flex-1')}
                aria-label={`Note ${i + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                disabled={disabled}
                aria-label={`Remove note ${i + 1}`}
                onClick={() => update(items.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className={cn('text-xs', hintClassName)}>No notes.</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        disabled={disabled}
        onClick={() => update([...items, ''])}
      >
        <Plus className="size-3.5" aria-hidden />
        Add note
      </Button>
    </div>
  )
}

/** Read-only numbered notes. */
export function ProductionNotesList({ notes }: { notes: string }) {
  const items = notesToList(notes).filter((n) => n.trim())
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">Notes</p>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm">
        {items.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ol>
    </div>
  )
}
