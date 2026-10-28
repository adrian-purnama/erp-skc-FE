import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { PurchaseOrderStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUSES,
  formatRupiah,
} from '#/lib/purchasing'
import type { PurchaseOrderSummary } from '#/lib/purchasing'
import {
  buttonClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'

/** The signed-in purchaser's own POs. */
export default function PurchaseOrdersForm() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const canManage = can('purchasing.manage')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== ALL) params.set('status', status)
      if (debounced.trim()) params.set('q', debounced.trim())
      const qs = params.toString()
      const response = await apiFetch<PurchaseOrderSummary[]>(
        `/purchasing/orders/mine${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load purchase orders')
        return
      }
      setRows(response.data)
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [status, debounced])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [status, debounced])

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
        header: 'Delivery',
        cellClassName: 'w-28 text-xs tabular-nums',
        cell: (r) => r.expectedDate ?? '—',
      },
      {
        header: 'Status',
        cellClassName: 'w-36',
        cell: (r) => <PurchaseOrderStatusChip status={r.status} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitleClassName}>Purchase Orders</h1>
          <p className={cn('mt-2', hintClassName)}>
            POs you created. Each orders from one material request.
          </p>
        </div>
        {canManage ? (
          <Link
            to="/dashboard/purchasing/orders/new"
            className={cn(
              buttonClassName,
              'inline-flex h-9 items-center gap-1.5 no-underline',
            )}
          >
            <Plus className="size-4" aria-hidden />
            New PO
          </Link>
        ) : null}
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
            <>
              <ListSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Filter by PO, vendor, project or SPP…"
                aria-label="Filter purchase orders"
              />
              <Combobox
                value={status}
                onValueChange={(v) => setStatus(v || ALL)}
                options={[
                  { value: ALL, label: 'All statuses' },
                  ...PURCHASE_ORDER_STATUSES.map((s) => ({
                    value: s,
                    label: PURCHASE_ORDER_STATUS_LABELS[s],
                  })),
                ]}
                className="w-48"
                aria-label="Filter by status"
              />
            </>
          }
          loading={loading}
          loadingLabel="Loading purchase orders…"
          empty={
            debounced.trim() || status !== ALL
              ? 'No purchase orders match the current filter.'
              : 'You have not created a purchase order yet.'
          }
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.id}
          minWidthClassName="min-w-[900px]"
          onRowClick={(r) =>
            void navigate({
              to: '/dashboard/purchasing/orders/$orderId',
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
