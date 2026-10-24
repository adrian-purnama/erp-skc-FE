import type { ItemType } from '#/lib/itemMaster'

export const ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: 'material', label: 'Material' },
  { value: 'labour', label: 'Labour' },
]

export const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...ITEM_TYPE_OPTIONS,
] as const

export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
] as const

export function itemTypeLabel(itemType: ItemType): string {
  return (
    ITEM_TYPE_OPTIONS.find((option) => option.value === itemType)?.label ??
    itemType
  )
}
