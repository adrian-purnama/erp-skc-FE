import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { apiFetch } from '#/lib/api'
import type { CustomerDetail } from '#/lib/customer'
import { dialogInputClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Prefills the name (e.g. the text typed in the combobox search). */
  initialName?: string
  onCreated: (customer: CustomerDetail) => void
}

/**
 * Minimal customer create (name, address, NPWP) for use inside other forms.
 * Emails/phones can be added later on the customer page.
 */
export default function CustomerQuickCreateDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: Props) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [npwp, setNpwp] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialName)
    setAddress('')
    setNpwp('')
  }, [open, initialName])

  const npwpDigits = npwp.replace(/\D/g, '')

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    // The dialog is portaled, but React still bubbles submit to a parent form.
    event.stopPropagation()

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Name is required')
      return
    }
    if (npwpDigits.length !== 16) {
      toast.error('NPWP must be 16 digits')
      return
    }

    setSaving(true)
    try {
      const response = await apiFetch<CustomerDetail>('/customer', {
        method: 'POST',
        body: JSON.stringify({
          name: trimmedName,
          address: address.trim(),
          npwp: npwpDigits,
          emails: [],
          phones: [],
        }),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to create customer')
        return
      }
      toast.success('Customer created')
      onCreated(response.data)
      onOpenChange(false)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>
              The new customer is selected right away. Add emails and phones
              later on the customer page.
            </DialogDescription>
          </DialogHeader>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={dialogInputClassName}
              required
              autoFocus
              disabled={saving}
              autoComplete="organization"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Address</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={cn(dialogInputClassName, 'min-h-20 resize-y')}
              disabled={saving}
              autoComplete="street-address"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">NPWP</span>
            <input
              value={npwp}
              onChange={(e) => setNpwp(e.target.value)}
              className={cn(dialogInputClassName, 'tabular-nums')}
              required
              disabled={saving}
              inputMode="numeric"
              autoComplete="off"
            />
            <span className={cn('block text-sm', hintClassName)}>
              16 digits ({npwpDigits.length}/16)
            </span>
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : null}
              {saving ? 'Creating…' : 'Create customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
