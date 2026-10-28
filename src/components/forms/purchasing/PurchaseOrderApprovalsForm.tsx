import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { formatRupiah } from '#/lib/purchasing'
import type { PurchaseOrderSummary } from '#/lib/purchasing'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

/** "today", "1 day", "3 days" since the PO was sent. */
function waitingFor(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

/** Every PO waiting for approval, oldest first. */
export default function PurchaseOrderApprovalsForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = debounced.trim()
        ? `?q=${encodeURIComponent(debounced.trim())}`
        : ''
      const response = await apiFetch<PurchaseOrderSummary[]>(
        `/purchasing/orders/approvals${qs}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load purchase orders')
        return
      }
      setRows(
        [...response.data].sort((a, b) =>
          (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''),
        ),
      )
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [debounced])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debounced])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(rows, page, DEFAULT_PAGE_SIZE), [rows, page])

  const columns = useMemo<ListTableColumn<PurchaseOrderSummary>[]>(
    () => [
      {
        header: 'PO',
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      { header: 'Vendor', cell: (r) => r.vendorName },
      {
        header: 'SPP',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate tabular-nums">{r.requestNumber}</p>
            <p className="truncate text-xs text-(--muted)">
              {r.projectNumber} · {r.projectName}
            </p>
          </div>
        ),
      },
      {
        header: 'Total',
        cellClassName: 'w-40 text-right tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">{formatRupiah(r.total)}</p>
            {r.overBudgetCount > 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {r.overBudgetCount} above RAB
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Sent by',
        cellClassName: 'w-36',
        cell: (r) => r.createdBy?.name ?? '—',
      },
      {
        header: 'Waiting',
        cellClassName: 'w-24 text-xs tabular-nums',
        cell: (r) => waitingFor(r.submittedAt),
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>PO Approval</h1>
        <p className={cn('mt-2', hintClassName)}>
          {loading
            ? 'Purchase orders waiting for your decision.'
            : rows.length === 0
              ? 'Nothing is waiting for approval.'
              : `${rows.length} purchase ${rows.length === 1 ? 'order is' : 'orders are'} waiting. Oldest first.`}
        </p>
      </div>

      {error ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-red-600">{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : (
        <ListTable
          filters={
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter by PO, vendor, project or SPP…"
              aria-label="Filter purchase orders"
            />
          }
          loading={loading}
          loadingLabel="Loading purchase orders…"
          empty={
            debounced.trim()
              ? 'No waiting purchase orders match the filter.'
              : 'Nothing is waiting for approval.'
          }
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.id}
          minWidthClassName="min-w-[900px]"
          onRowClick={(r) =>
            void navigate({
              to: '/dashboard/purchasing/approvals/$orderId',
              params: { orderId: r.id },
            })
          }
          pagination={{
            page: safePage,
            totalPages,
            totalItems: rows.length,
            pageSize: DEFAULT_PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  )
}
