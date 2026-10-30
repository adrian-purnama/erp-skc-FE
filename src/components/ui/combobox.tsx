import { useMemo, useState, type SyntheticEvent } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import {
  Check,
  ChevronsUpDown,
  ListFilter,
  SearchIcon,
  X,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'

export type ComboboxOption = {
  value: string
  label: string
  /** Optional category ids used when `categories` is set on Combobox. */
  categoryIds?: string[]
}

export type ComboboxCategory = {
  value: string
  label: string
}

type ComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  /** Extra classes for the dropdown panel (e.g. wider than the trigger). */
  contentClassName?: string
  disabled?: boolean
  'aria-label'?: string
  /**
   * When set, shows a collapsible category chip filter inside the dropdown.
   * Options are filtered by `option.categoryIds` (OR match).
   */
  categories?: ComboboxCategory[]
}

/** Keep focus in the filter UI without blocking native control clicks. */
function stopBubble(e: SyntheticEvent) {
  e.stopPropagation()
}

function stopChipEvent(e: SyntheticEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/** Max category rows shown at once; search to find the rest. */
const CATEGORY_VISIBLE_LIMIT = 5

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results.',
  className,
  contentClassName,
  disabled = false,
  'aria-label': ariaLabel,
  categories,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState('')
  const selected = options.find((option) => option.value === value)
  const hasCategories = Boolean(categories && categories.length > 0)

  const visibleOptions = useMemo(() => {
    if (!hasCategories || selectedCategoryIds.length === 0) return options
    const selected = new Set(selectedCategoryIds)
    return options.filter((option) =>
      (option.categoryIds ?? []).some((id) => selected.has(id)),
    )
  }, [options, hasCategories, selectedCategoryIds])

  const selectedCategories = useMemo(() => {
    if (!categories?.length || selectedCategoryIds.length === 0) return []
    const byId = new Map(categories.map((c) => [c.value, c] as const))
    return selectedCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is ComboboxCategory => Boolean(c))
  }, [categories, selectedCategoryIds])

  const availableCategories = useMemo(() => {
    if (!categories?.length) return []
    const selected = new Set(selectedCategoryIds)
    return categories.filter((c) => !selected.has(c.value))
  }, [categories, selectedCategoryIds])

  const matchedCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase()
    if (!q) return availableCategories
    return availableCategories.filter((c) =>
      c.label.toLowerCase().includes(q),
    )
  }, [availableCategories, categoryQuery])

  const categoryChoices = useMemo(
    () => matchedCategories.slice(0, CATEGORY_VISIBLE_LIMIT),
    [matchedCategories],
  )
  const categoryHiddenCount = Math.max(
    0,
    matchedCategories.length - categoryChoices.length,
  )

  function addCategory(id: string) {
    if (!id) return
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev : [...prev, id],
    )
    setCategoryQuery('')
  }

  function removeCategory(id: string) {
    setSelectedCategoryIds((prev) => prev.filter((x) => x !== id))
  }

  function resetFilters() {
    setSelectedCategoryIds([])
    setFiltersOpen(false)
    setCategoryQuery('')
  }

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) {
          setOpen(next)
          if (!next) resetFilters()
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            // Override Button's shrink-0 so long labels truncate inside the parent.
            'w-full min-w-0 shrink justify-between overflow-hidden font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          'w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] p-0',
          contentClassName,
        )}
        align="start"
      >
        <Command shouldFilter>
          <div className="border-b border-(--line)">
            <div className="flex items-center gap-1 px-2">
              <SearchIcon className="ml-1 size-4 shrink-0 opacity-50" />
              <CommandPrimitive.Input
                placeholder={searchPlaceholder}
                className="flex h-9 w-full min-w-0 bg-transparent py-2 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
              {hasCategories ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'size-8 shrink-0 p-0',
                    (filtersOpen || selectedCategoryIds.length > 0) &&
                      'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-(--accent)',
                  )}
                  aria-pressed={filtersOpen}
                  aria-label="Toggle category filters"
                  onClick={(e) => {
                    stopChipEvent(e)
                    setFiltersOpen((v) => !v)
                  }}
                  onPointerDown={stopChipEvent}
                >
                  <ListFilter className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>

            {selectedCategories.length > 0 ? (
              <div
                className="flex flex-wrap gap-1.5 border-t border-(--line) px-2 py-2"
                onPointerDown={stopBubble}
              >
                {selectedCategories.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--accent)_35%,var(--line))] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-(--ink)"
                    onClick={(e) => {
                      stopChipEvent(e)
                      removeCategory(cat.value)
                    }}
                    aria-label={`Remove ${cat.label} filter`}
                  >
                    <span className="min-w-0 truncate">{cat.label}</span>
                    <X className="size-3 shrink-0 opacity-70" aria-hidden />
                  </button>
                ))}
              </div>
            ) : null}

            {hasCategories && filtersOpen ? (
              <div
                className="space-y-1.5 border-t border-(--line) px-2 py-2"
                onPointerDown={stopBubble}
              >
                <p className="text-[11px] font-medium tracking-wide text-(--muted)">
                  Categories
                </p>
                {availableCategories.length === 0 ? (
                  <p className="text-xs text-(--muted)">
                    All categories selected
                  </p>
                ) : (
                  <>
                    <input
                      type="search"
                      value={categoryQuery}
                      placeholder="Search categories…"
                      aria-label="Search categories"
                      className="app-input h-8 w-full px-2 text-xs"
                      onChange={(e) => setCategoryQuery(e.target.value)}
                      onKeyDown={stopBubble}
                      onPointerDown={stopBubble}
                    />
                    {categoryChoices.length === 0 ? (
                      <p className="text-xs text-(--muted)">No category found</p>
                    ) : (
                      <div
                        role="listbox"
                        aria-label="Add category filter"
                        className="overflow-hidden rounded-md border border-(--line) bg-(--surface)"
                      >
                        {categoryChoices.map((cat) => (
                          <button
                            key={cat.value}
                            type="button"
                            role="option"
                            className="flex w-full items-center px-2.5 py-1.5 text-left text-xs text-(--ink) hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                            onClick={(e) => {
                              stopChipEvent(e)
                              addCategory(cat.value)
                            }}
                            onPointerDown={stopBubble}
                          >
                            <span className="min-w-0 truncate">{cat.label}</span>
                          </button>
                        ))}
                        {categoryHiddenCount > 0 ? (
                          <p className="border-t border-(--line) px-2.5 py-1 text-[11px] text-(--muted)">
                            +{categoryHiddenCount} more — search to find
                          </p>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  keywords={[option.label, option.value]}
                  onSelect={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      value === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="min-w-0 whitespace-normal break-words">
                    {option.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
