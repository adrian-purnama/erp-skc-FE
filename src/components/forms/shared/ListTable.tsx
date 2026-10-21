import { LoaderCircle, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import ListPagination from '#/components/forms/shared/ListPagination'
import { cardClassName, hintClassName, inputClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type ListTableColumn<T> = {
  header: ReactNode
  cellClassName?: string
  cell: (row: T) => ReactNode
}

type PaginationProps = {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

type ListTableProps<T> = {
  filters?: ReactNode
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
    <div className={cn('relative min-w-[12rem] max-w-md flex-1', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-(--muted)"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClassName, 'pl-10')}
        autoComplete="off"
        aria-label={ariaLabel}
      />
    </div>
  )
}

export default function ListTable<T>({
  filters,
  loading = false,
  loadingLabel = 'Loading…',
  empty,
  columns,
  rows,
  rowKey,
  minWidthClassName = 'min-w-[520px]',
  pagination,
  onRowClick,
}: ListTableProps<T>) {
  return (
    <div className="space-y-3">
      {filters ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {filters}
        </div>
      ) : null}

      {loading ? (
        <div className={`flex items-center gap-2 py-4 ${hintClassName}`}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {loadingLabel}
        </div>
      ) : rows.length === 0 ? (
        <p className={`${cardClassName} px-4 py-8 text-center ${hintClassName}`}>
          {empty}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table
              className={cn(
                'w-full border-collapse text-left text-sm',
                minWidthClassName,
              )}
            >
              <thead>
                <tr className="border-b border-(--line) bg-(--surface)">
                  {columns.map((col, index) => (
                    <th
                      key={index}
                      className="px-3 py-2.5 text-xs font-semibold tracking-wide text-(--muted) uppercase"
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={cn(
                      'border-b border-(--line) hover:bg-(--surface)',
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
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onRowClick(row)
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'link' : undefined}
                  >
                    {columns.map((col, index) => (
                      <td
                        key={index}
                        className={cn('px-3 py-3', col.cellClassName)}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination ? <ListPagination {...pagination} /> : null}
        </div>
      )}
    </div>
  )
}
