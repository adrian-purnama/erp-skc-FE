import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import {
  PurchaseRequestStatusChip,
  RequestOrderStatusChip,
} from '#/components/forms/purchasing/PurchaseRequestBadges'
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
  PURCHASE_REQUEST_STATUS_LABELS,
  PURCHASE_REQUEST_STATUSES,
} from '#/lib/purchasing'
import type { PurchaseRequestSummary } from '#/lib/purchasing'
import {
  buttonClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'

/** Material requests (SPP): production asks, purchasing buys. */
export default function PurchaseRequestsForm() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const viewAll = can('purchasing.viewAll')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseRequestSummary[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  // Purchasing mostly works the submitted queue.
  const [status, setStatus] = useState<string>(viewAll ? 'submitted' : ALL)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== ALL) params.set('status', status)
      if (debounced.trim()) params.set('q', debounced.trim())
      const qs = params.toString()
      const response = await apiFetch<PurchaseRequestSummary[]>(
        `/purchasing/requests${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load requests')
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

  const columns = useMemo<ListTableColumn<PurchaseRequestSummary>[]>(
    () => [
      {
        header: 'SPP',
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      {
        header: 'Project',
        cell: (r) => (
          <div className="min-w-0">
            <p className="tabular-nums">{r.projectNumber}</p>
            <p className="truncate text-xs text-(--muted)">{r.projectName}</p>
          </div>
        ),
      },
      {
        header: 'For',
        cell: (r) =>
          r.productionOrderNumber ? (
            <div className="min-w-0">
              <p className="tabular-nums">{r.productionOrderNumber}</p>
              <p className="truncate text-xs text-(--muted)">{r.itemLabel}</p>
            </div>
          ) : (
            <span className={hintClassName}>Extra items</span>
          ),
      },
      {
        header: 'Needed by',
        cellClassName: 'w-28 text-xs tabular-nums',
        cell: (r) => r.neededDate,
      },
      {
        header: 'Items',
        cellClassName: 'w-36',
        cell: (r) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="tabular-nums">{r.lineCount}</span>
            {r.flaggedCount > 0 ? (
              <span
                className="text-xs text-amber-700 dark:text-amber-300"
                title="Extra, over plan or not in RAB"
              >
                {r.flaggedCount} flagged
              </span>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Requested by',
        cellClassName: 'w-36',
        cell: (r) => r.requestedBy?.name ?? '—',
      },
      {
        header: 'Status',
        cellClassName: 'w-32',
        cell: (r) =>
          r.status === 'submitted' ? (
            r.receiptStatus === 'full' ? (
              <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-300">
                All arrived
              </span>
            ) : (
              <RequestOrderStatusChip status={r.orderStatus} />
            )
          ) : (
            <PurchaseRequestStatusChip status={r.status} />
          ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitleClassName}>Material Requests</h1>
          <p className={cn('mt-2', hintClassName)}>
            {viewAll
              ? 'SPP from production. Flagged items are extra, over plan or not in the RAB.'
              : 'Your SPP. Start one from an SPK, or here for extra items.'}
          </p>
        </div>
        {can('purchasing.request') ? (
          <Link
            to="/dashboard/purchasing/requests/new"
            className={cn(
              buttonClassName,
              'inline-flex h-9 items-center gap-1.5 no-underline',
            )}
          >
            <Plus className="size-4" aria-hidden />
            New request
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-red-600">{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
          >
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
                placeholder="Filter by SPP, project or SPK…"
                aria-label="Filter requests"
              />
              <Combobox
                value={status}
                onValueChange={(v) => setStatus(v || ALL)}
                options={[
                  { value: ALL, label: 'All statuses' },
                  ...PURCHASE_REQUEST_STATUSES.map((s) => ({
                    value: s,
                    label: PURCHASE_REQUEST_STATUS_LABELS[s],
                  })),
                ]}
                className="w-44"
                aria-label="Filter by status"
              />
            </>
          }
          loading={loading}
          loadingLabel="Loading requests…"
          empty={
            debounced.trim() || status !== ALL
              ? 'No requests match the current filter.'
              : 'No material requests yet.'
          }
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.id}
          minWidthClassName="min-w-[900px]"
          onRowClick={(r) =>
            void navigate({
              to: '/dashboard/purchasing/requests/$requestId',
              params: { requestId: r.id },
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
