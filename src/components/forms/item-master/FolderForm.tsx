import { useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Folder, Hash, MapPin } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

/** Title Case each word; leave the system "Orphan" name alone. */
export function toTitleCaseFolderName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  if (!trimmed) return trimmed
  if (trimmed.toLowerCase() === 'orphan') return 'Orphan'
  return trimmed
    .split(' ')
    .map((word) => {
      if (!word) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export function FolderForm({
  mode,
  title,
  displayCode,
  initialName,
  parentLabel,
  hideTitle = false,
  saving,
  setSaving,
  onCancel,
  onSubmit,
  className,
}: {
  mode: 'create' | 'edit'
  title: string
  displayCode: string
  initialName: string
  /** Where the folder will be created / lives (e.g. "Root" or path label). */
  parentLabel?: string
  hideTitle?: boolean
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
  className?: string
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next = toTitleCaseFolderName(name)
    if (!next) {
      setError('Name is required')
      return
    }
    setName(next)
    setError('')
    setSaving(true)
    try {
      await onSubmit(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-4', className)}
      noValidate
    >
      {hideTitle ? null : <h2 className="text-sm font-medium">{title}</h2>}

      {mode === 'create' && parentLabel ? (
        <div className="rounded-md border border-(--line) bg-(--surface) px-3 py-2.5">
          <p
            className={cn(
              'mb-1 flex items-center gap-1.5 text-xs',
              hintClassName,
            )}
          >
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            Location
          </p>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Folder className="size-3.5 shrink-0 text-(--muted)" aria-hidden />
            <span className="min-w-0 truncate">{parentLabel}</span>
          </p>
        </div>
      ) : null}

      {mode === 'edit' && displayCode ? (
        <p className="inline-flex items-center gap-1.5 font-mono text-xs text-(--muted)">
          <Hash className="size-3.5 shrink-0" aria-hidden />
          {displayCode}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-1.5">
        <label htmlFor="folder-name" className="text-sm font-medium">
          Folder name
        </label>
        <Input
          id="folder-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim()) setName(toTitleCaseFolderName(name))
          }}
          autoComplete="off"
          autoFocus={mode === 'create'}
          disabled={saving}
          className="w-full"
        />
        <p className={cn('text-xs', hintClassName)}>
          Each word is capitalized when you save (except Orphan).
        </p>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className={buttonOutlineClassName}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving} className={buttonClassName}>
          {saving
            ? 'Saving…'
            : mode === 'create'
              ? 'Create folder'
              : 'Save'}
        </Button>
      </div>
    </form>
  )
}
