import { Check, Copy, Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import toast from 'react-hot-toast'
import ListPagination from '#/components/forms/shared/ListPagination'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { hintClassName, inputClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type ListTableColumn<T> = {
  header: ReactNode
  /** Lucide icon shown before the header label. */
  icon?: LucideIcon
  /** Use `right` for numbers so digits line up by place value. */
  align?: 'left' | 'center' | 'right'
  /** Applied to both header and cells (preferred for column width). */
  widthClassName?: string
  headerClassName?: string
  cellClassName?: string
  cell: (row: T) => ReactNode
  /** When set, a copy button appears on cell hover. Return empty to hide it. */
  copyValue?: (row: T) => string | null | undefined
  /** Stable key for drag-resize width state; defaults to column index. */
  resizeKey?: string
}

const COLUMN_RESIZE_MIN_PX = 64

/** Icon button in the table toolbar: runs `onClick`, or opens `popover`. */
export type ListTableToolbarAction = {
  key: string
  label: string
  icon: LucideIcon
  onClick?: () => void
  popover?: ReactNode
  popoverClassName?: string
  /** Shows a dot, e.g. when a filter is applied. */
  active?: boolean
}

type PaginationProps = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

type SearchProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  'aria-label'?: string
}

type SelectionProps = {
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}

type ListTableProps<T> = {
  /** Free-form filter row above the table (legacy layout). */
  filters?: ReactNode
  /** Left side of the toolbar, e.g. tabs or a row count. */
  toolbarStart?: ReactNode
  search?: SearchProps
  toolbarActions?: ListTableToolbarAction[]
  addAction?: { label: string; onClick: () => void }
  loading?: boolean
  loadingLabel?: string
  empty: ReactNode
  columns: ListTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Tailwind min-width utility, e.g. min-w-[520px] */
  minWidthClassName?: string
  pagination?: PaginationProps
  onRowClick?: (row: T) => void
  /** Shades rows out, e.g. inactive or disabled records. */
  isRowMuted?: (row: T) => boolean
  /** Adds a checkbox column. Keys come from `rowKey`. */
  selection?: SelectionProps
  /**
   * When set, a header row is inserted whenever the group label changes.
   * Rows must already be sorted so each group is contiguous.
   */
  groupBy?: (row: T) => string
  /** `compact` tightens row padding for dense, scan-first lists. */
  density?: 'default' | 'compact'
  /** Full-width panel under a row, e.g. its details; return null to hide. */
  renderExpanded?: (row: T) => ReactNode
}

const CHIP_TONES = {
  neutral: 'bg-(--surface) text-(--ink) ring-(--line)',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
} as const

const DOT_TONES = {
  neutral: 'bg-stone-400',
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
} as const

export type ListChipTone = keyof typeof CHIP_TONES

/** Chip for fixed-value fields (status, department, type) inside a cell. */
export function ListChip({
  tone = 'neutral',
  icon: Icon,
  dot = false,
  children,
  className,
}: {
  tone?: ListChipTone
  icon?: LucideIcon
  /** Colored dot instead of a filled chip — for categories. */
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-md border-0 font-medium ring-1',
        dot ? 'bg-transparent text-(--ink) ring-(--line)' : CHIP_TONES[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn('size-2 rounded-[2px]', DOT_TONES[tone])}
          aria-hidden
        />
      ) : Icon ? (
        <Icon aria-hidden />
      ) : null}
      {children}
    </Badge>
  )
}

const PROGRESS_TONES = {
  neutral: 'bg-[#2a78d6] dark:bg-[#3987e5]',
  success: 'bg-emerald-600',
  danger: 'bg-red-600',
  warning: 'bg-amber-500',
  info: 'bg-sky-600',
} as const

/** Thin bar + percent label for progress-like cells (0–100, clamped bar). */
export function ListProgress({
  percent,
  tone = 'neutral',
  label,
  className,
}: {
  percent: number
  tone?: ListChipTone
  /** Overrides the default `NN%` label. */
  label?: ReactNode
  className?: string
}) {
  const width = Math.min(100, Math.max(0, percent))
  return (
    <div className={cn('flex min-w-24 items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--line)"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full rounded-full', PROGRESS_TONES[tone])}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="min-w-10 shrink-0 text-right text-xs tabular-nums">
        {label ?? `${Math.round(percent)}%`}
      </span>
    </div>
  )
}

export function ListSearchInput({
  value,
  onChange,
  placeholder,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  'aria-label'?: string
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 w-full max-w-md flex-1 basis-[12rem]',
        className,
      )}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--muted)"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClassName, 'w-full min-w-0 pl-10')}
        autoComplete="off"
        aria-label={ariaLabel}
      />
    </div>
  )
}

function IconTooltip({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  )
}

function ToolbarActionButton({ action }: { action: ListTableToolbarAction }) {
  const Icon = action.icon
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="relative text-(--muted) hover:text-(--ink)"
      aria-label={action.label}
      onClick={action.onClick}
    >
      <Icon />
      {action.active ? (
        <span
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-(--accent)"
          aria-hidden
        />
      ) : null}
    </Button>
  )

  if (!action.popover) {
    return <IconTooltip label={action.label}>{button}</IconTooltip>
  }

  return (
    <Popover>
      <IconTooltip label={action.label}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
      </IconTooltip>
      <PopoverContent
        align="end"
        className={cn('w-64 space-y-3 p-3', action.popoverClassName)}
      >
        {action.popover}
      </PopoverContent>
    </Popover>
  )
}

function CopyCellButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <IconTooltip label={copied ? 'Copied' : 'Copy'}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-(--muted) opacity-0 group-hover/cell:opacity-100 hover:text-(--ink) focus-visible:opacity-100"
        aria-label="Copy"
        onClick={(event) => {
          event.stopPropagation()
          void navigator.clipboard.writeText(value).then(
            () => setCopied(true),
            () => toast.error('Unable to copy'),
          )
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </IconTooltip>
  )
}

const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right tabular-nums',
} as const

const cellBorderClassName = 'border-r border-(--line) last:border-r-0'

export default function ListTable<T>({
  filters,
  toolbarStart,
  search,
  toolbarActions,
  addAction,
  loading = false,
  loadingLabel = 'Loading…',
  empty,
  columns,
  rows,
  rowKey,
  minWidthClassName = 'min-w-[520px]',
  pagination,
  onRowClick,
  isRowMuted,
  selection,
  groupBy,
  density = 'default',
  renderExpanded,
}: ListTableProps<T>) {
  const hasToolbar =
    toolbarStart !== undefined ||
    search !== undefined ||
    (toolbarActions?.length ?? 0) > 0 ||
    addAction !== undefined
  const colCount = columns.length + (selection ? 1 : 0)
  const cellPadding = density === 'compact' ? 'px-3 py-1' : 'px-3 py-1.5'

  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const dragRef = useRef<{
    key: string
    startX: number
    startWidth: number
  } | null>(null)

  const columnKey = useCallback(
    (col: ListTableColumn<T>, index: number) =>
      col.resizeKey ?? String(index),
    [],
  )

  const widthStyle = useCallback(
    (key: string): CSSProperties | undefined => {
      const w = colWidths[key]
      if (w === undefined) return undefined
      return { width: w, minWidth: w, maxWidth: w }
    },
    [colWidths],
  )

  const onResizePointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLSpanElement>,
      key: string,
      th: HTMLTableCellElement | null,
    ) => {
      event.preventDefault()
      event.stopPropagation()
      const startWidth =
        colWidths[key] ?? th?.getBoundingClientRect().width ?? COLUMN_RESIZE_MIN_PX
      dragRef.current = { key, startX: event.clientX, startWidth }
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [colWidths],
  )

  const onResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const next = Math.max(
        COLUMN_RESIZE_MIN_PX,
        Math.round(drag.startWidth + (event.clientX - drag.startX)),
      )
      setColWidths((prev) =>
        prev[drag.key] === next ? prev : { ...prev, [drag.key]: next },
      )
    },
    [],
  )

  const onResizePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // already released
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    },
    [],
  )

  const pageKeys = rows.map(rowKey)
  const selectedOnPage = selection
    ? pageKeys.filter((key) => selection.selected.has(key)).length
    : 0
  const headerChecked: boolean | 'indeterminate' =
    selectedOnPage === 0
      ? false
      : selectedOnPage === pageKeys.length
        ? true
        : 'indeterminate'

  function toggleAll(next: boolean) {
    if (!selection) return
    const updated = new Set(selection.selected)
    for (const key of pageKeys) {
      if (next) updated.add(key)
      else updated.delete(key)
    }
    selection.onChange(updated)
  }

  function toggleOne(key: string, next: boolean) {
    if (!selection) return
    const updated = new Set(selection.selected)
    if (next) updated.add(key)
    else updated.delete(key)
    selection.onChange(updated)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        {filters ? (
          <div className="flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
            {filters}
          </div>
        ) : null}

        {hasToolbar ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {toolbarStart}
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
              {search ? (
                <ListSearchInput
                  value={search.value}
                  onChange={search.onChange}
                  placeholder={search.placeholder}
                  aria-label={search['aria-label']}
                  className="mr-1 max-w-64 basis-40"
                />
              ) : null}
              {toolbarActions?.map((action) => (
                <ToolbarActionButton key={action.key} action={action} />
              ))}
              {addAction ? (
                <Button
                  type="button"
                  size="sm"
                  className="ml-1"
                  onClick={addAction.onClick}
                >
                  {addAction.label}
                  <Plus aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-(--line) bg-(--background)">
          <table
            className={cn(
              'w-full border-collapse text-left text-sm',
              minWidthClassName,
              Object.keys(colWidths).length > 0 && 'table-fixed',
            )}
            aria-busy={loading || undefined}
          >
            <thead>
              <tr className="border-b border-(--line) bg-(--surface)">
                {selection ? (
                  <th className={cn('w-10', cellPadding, cellBorderClassName)}>
                    <Checkbox
                      checked={headerChecked}
                      onCheckedChange={(value) => toggleAll(value === true)}
                      disabled={loading || rows.length === 0}
                      aria-label="Select all rows"
                    />
                  </th>
                ) : null}
                {columns.map((col, index) => {
                  const Icon = col.icon
                  const align = col.align ?? 'left'
                  const key = columnKey(col, index)
                  return (
                    <th
                      key={key}
                      className={cn(
                        'relative px-3 py-1.5 text-xs font-medium whitespace-nowrap text-(--ink)',
                        ALIGN_CLASS[align],
                        cellBorderClassName,
                        colWidths[key] === undefined && col.widthClassName,
                        col.headerClassName,
                      )}
                      style={widthStyle(key)}
                    >
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {Icon ? (
                          <Icon
                            className="size-3.5 text-(--muted)"
                            aria-hidden
                          />
                        ) : null}
                        {col.header}
                      </span>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${typeof col.header === 'string' ? col.header : 'column'}`}
                        title="Drag to resize"
                        className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-(--ink)/15"
                        onPointerDown={(event) =>
                          onResizePointerDown(
                            event,
                            key,
                            event.currentTarget.parentElement as HTMLTableCellElement | null,
                          )
                        }
                        onPointerMove={onResizePointerMove}
                        onPointerUp={onResizePointerUp}
                        onPointerCancel={onResizePointerUp}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className="border-b border-(--line) last:border-b-0"
                  >
                    {Array.from({ length: colCount }, (_cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(cellPadding, cellBorderClassName)}
                      >
                        <div className="h-4 animate-pulse rounded bg-(--surface)" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className={`px-4 py-10 text-center ${hintClassName}`}
                  >
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => {
                  const key = rowKey(row)
                  const group = groupBy?.(row)
                  const showGroup =
                    groupBy !== undefined &&
                    (rowIndex === 0 || groupBy(rows[rowIndex - 1]) !== group)
                  const isSelected = selection?.selected.has(key) ?? false
                  const muted = isRowMuted?.(row) ?? false
                  const expanded = renderExpanded?.(row) ?? null
                  return (
                    <Fragment key={key}>
                      {showGroup ? (
                        <tr className="border-b border-(--line) bg-(--surface)">
                          <th
                            colSpan={colCount}
                            scope="colgroup"
                            className="px-3 py-1.5 text-xs font-semibold tracking-wide text-(--ink)"
                          >
                            {group}
                          </th>
                        </tr>
                      ) : null}
                      <tr
                        className={cn(
                          'border-b border-(--line) transition-colors last:border-b-0 hover:bg-(--surface)',
                          (isSelected || expanded !== null) && 'bg-(--surface)',
                          muted && 'text-(--muted) [&>td]:opacity-60',
                          onRowClick && 'cursor-pointer',
                        )}
                        onClick={
                          onRowClick
                            ? () => {
                                onRowClick(row)
                              }
                            : undefined
                        }
                        onKeyDown={
                          onRowClick
                            ? (event) => {
                                if (event.target !== event.currentTarget) {
                                  return
                                }
                                if (
                                  event.key === 'Enter' ||
                                  event.key === ' '
                                ) {
                                  event.preventDefault()
                                  onRowClick(row)
                                }
                              }
                            : undefined
                        }
                        tabIndex={onRowClick ? 0 : undefined}
                        role={onRowClick ? 'link' : undefined}
                        aria-selected={selection ? isSelected : undefined}
                      >
                        {selection ? (
                          <td
                            className={cn(cellPadding, cellBorderClassName)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(value) =>
                                toggleOne(key, value === true)
                              }
                              aria-label="Select row"
                            />
                          </td>
                        ) : null}
                        {columns.map((col, index) => {
                          const copyValue = col.copyValue?.(row)
                          const content = col.cell(row)
                          const resizeKey = columnKey(col, index)
                          return (
                            <td
                              key={resizeKey}
                              className={cn(
                                'group/cell',
                                cellPadding,
                                ALIGN_CLASS[col.align ?? 'left'],
                                cellBorderClassName,
                                colWidths[resizeKey] === undefined &&
                                  col.widthClassName,
                                col.cellClassName,
                              )}
                              style={widthStyle(resizeKey)}
                            >
                              {copyValue ? (
                                <div
                                  className={cn(
                                    'flex min-w-0 items-center gap-1',
                                    col.align === 'right' && 'flex-row-reverse',
                                  )}
                                >
                                  <span className="min-w-0 truncate">
                                    {content}
                                  </span>
                                  <CopyCellButton value={copyValue} />
                                </div>
                              ) : (
                                content
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      {expanded !== null ? (
                        <tr className="border-b border-(--line) last:border-b-0">
                          <td colSpan={colCount} className="p-0">
                            {expanded}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
          {loading ? <span className="sr-only">{loadingLabel}</span> : null}
        </div>

        {pagination && !loading ? <ListPagination {...pagination} /> : null}
      </div>
    </TooltipProvider>
  )
}
