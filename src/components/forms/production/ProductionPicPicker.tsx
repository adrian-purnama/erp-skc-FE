import { useEffect, useState } from 'react'
import { Combobox, type ComboboxOption } from '#/components/ui/combobox'
import { apiFetch } from '#/lib/api'
import type { ProductionPicUser } from '#/lib/production'

const NONE = '__none__'

type Props = {
  /** Selected user id, or null for no PIC. */
  value: string | null
  /** Shown while the list loads / when the saved PIC is no longer listed. */
  fallbackLabel?: string
  onChange: (userId: string | null) => void
  disabled?: boolean
}

/** Pick the SPK person in charge from active users. */
export default function ProductionPicPicker({
  value,
  fallbackLabel,
  onChange,
  disabled,
}: Props) {
  const [users, setUsers] = useState<ProductionPicUser[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<ProductionPicUser[]>(
          '/production/pic-users',
        )
        if (!cancelled && response.success) setUsers(response.data)
      } catch {
        // Picker stays empty; the dialog still works without a PIC.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const options: ComboboxOption[] = [
    { value: NONE, label: 'No PIC' },
    ...users.map((u) => ({
      value: u.id,
      label: u.name === u.email ? u.name : `${u.name} · ${u.email}`,
    })),
  ]
  if (value && fallbackLabel && !users.some((u) => u.id === value)) {
    options.push({ value, label: fallbackLabel })
  }

  return (
    <Combobox
      value={value ?? NONE}
      onValueChange={(next) => onChange(!next || next === NONE ? null : next)}
      options={options}
      placeholder="Select PIC"
      searchPlaceholder="Search users…"
      emptyText="No users found."
      disabled={disabled}
      aria-label="Person in charge"
      className="w-full"
    />
  )
}
