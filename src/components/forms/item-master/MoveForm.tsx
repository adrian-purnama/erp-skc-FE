import { useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  buttonClassName,
  buttonOutlineClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const MOVE_ROOT = '__root__'

export function MoveForm({
  title,
  folderOptions,
  excludeFolderId,
  saving,
  setSaving,
  onCancel,
  onSubmit,
  className,
}: {
  title: string
  folderOptions: Array<{ id: string; label: string }>
  excludeFolderId?: string
  saving: boolean
  setSaving: (v: boolean) => void
  onCancel: () => void
  onSubmit: (parentId: string | null) => Promise<void>
  className?: string
}) {
  const [parentId, setParentId] = useState(MOVE_ROOT)
  const options = folderOptions.filter((f) => f.id !== excludeFolderId)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(parentId === MOVE_ROOT ? null : parentId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('w-full space-y-3', className)}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">New parent</span>
        <Combobox
          value={parentId}
          onValueChange={setParentId}
          options={[
            { value: MOVE_ROOT, label: 'Root' },
            ...options.map((opt) => ({
              value: opt.id,
              label: opt.label,
            })),
          ]}
          placeholder="Select parent…"
          searchPlaceholder="Search folders…"
          emptyText="No folder found."
          className="w-full min-w-0"
          aria-label="New parent"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className={buttonClassName}>
          {saving ? 'Moving…' : 'Move'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={buttonOutlineClassName}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
