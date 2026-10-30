import { LoaderCircle } from 'lucide-react'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/**
 * Upload state for file dialogs: a progress bar while bytes are sent, then
 * "Saving…" while the server stores the file (percent 100, no response yet).
 */
export default function UploadProgress({
  percent,
  label,
  fileName,
  className,
}: {
  percent: number
  /** Left text while sending, e.g. "Uploading 2 / 5". */
  label?: string
  fileName?: string | null
  className?: string
}) {
  const saving = percent >= 100
  return (
    <div
      className={cn(
        'space-y-2 rounded-md border border-(--line) p-3',
        className,
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={cn('flex items-center gap-1.5', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {saving ? 'Saving…' : (label ?? 'Uploading…')}
        </span>
        <span className="font-medium tabular-nums">{percent}%</span>
      </div>
      {fileName ? (
        <p className="truncate text-xs font-medium">{fileName}</p>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-(--line)"
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={cn(
            'h-full bg-(--ink) transition-[width] duration-150',
            saving && 'animate-pulse',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
