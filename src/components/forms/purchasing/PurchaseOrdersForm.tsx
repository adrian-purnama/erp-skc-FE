import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarClock,
  CircleDot,
  ClipboardList,
  FolderKanban,
  Package,
  Scale,
  ShoppingCart,
  Target,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'
import {
  PurchaseOrderStatusChip,
  RequestOrderStatusChip,
} from '#/components/forms/purchasing/PurchaseRequestBadges'
import { RabCompareButton } from '#/components/forms/purchasing/RabCompareDialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUSES,
  REALIZATION_PROGRESS_LABELS,
  formatRupiah,
} from '#/lib/purchasing'
import type { PurchaseOrderSummary, PurchaseRequestSummary } from '#/lib/purchasing'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'

export type PurchaseOrdersTab = 'orders' | 'waiting'

/** Submitted SPPs that still have items to order. */
function useWaitingRequests() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseRequestSummary[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<PurchaseRequestSummary[]>(
        '/purchasing/requests?status=submitted',
      )
      if (!response.success) {
        setError(response.message || 'Failed to load waiting requests')
        return
      }
      setRows(response.data.filter((r) => r.orderStatus !== 'ordered'))
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { loading, error, rows, load }
}

/** Your POs, and the SPPs still waiting to be ordered. */
export default function PurchaseOrdersForm({
  tab,
  onTabChange,
}: {
  tab: PurchaseOrdersTab
  onTabChange: (tab: PurchaseOrdersTab) => void
}) {
  const waiting = useWaitingRequests()
  const reloadWaiting = waiting.load

  // Fresh count each time the tab opens (others may have ordered meanwhile).
  useEffect(() => {
    if (tab === 'waiting') void reloadWaiting()
  }, [tab, reloadWaiting])

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Purchase Orders</h1>
        <p className={cn('mt-2', hintClassName)}>
          {tab === 'waiting'
            ? 'Submitted material requests with items still to order. Open one to make its PO.'
            : 'POs you created. Each orders from one material request.'}
        </p>
      </div>
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as PurchaseOrdersTab)}>
        <TabsList>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          <TabsTrigger value="waiting" className="gap-1.5">
            Waiting to order
            {waiting.rows.length > 0 ? (
              <span
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums"
                aria-label={`${waiting.rows.length} waiting`}
              >
                {waiting.rows.length > 99 ? '99+' : waiting.rows.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="pt-4">
          <MyOrders />
        </TabsContent>
        <TabsContent value="waiting" className="pt-4">
          <WaitingRequests {...waiting} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function WaitingRequests({
  loading,
  error,
  rows,
  load,
}: ReturnType<typeof useWaitingRequests>) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.number,
        r.projectNumber,
        r.projectName,
        r.productionOrderNumber ?? '',
        r.purchaseRabNumber ?? '',
        r.purchaseRabTitle ?? '',
        r.requestedBy?.name ?? '',
      ].some((v) => v.toLowerCase().includes(q)),
    )
  }, [rows, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(filtered, page, DEFAULT_PAGE_SIZE), [filtered, page])

  const columns = useMemo<ListTableColumn<PurchaseRequestSummary>[]>(
    () => [
      {
        header: 'SPP',
        icon: ClipboardList,
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      {
        header: 'Project',
        icon: FolderKanban,
        cell: (r) => (
          <div className="min-w-0">
            <p className="tabular-nums">{r.projectNumber}</p>
            <p className="truncate text-xs text-(--muted)">{r.projectName}</p>
          </div>
        ),
      },
      {
        header: 'For',
        icon: Target,
        cell: (r) => (
          <div className="min-w-0">
            <p className="tabular-nums">
              {r.productionOrderNumber ?? r.purchaseRabNumber ?? '—'}
            </p>
            <p className="truncate text-xs text-(--muted)">
              {r.productionOrderNumber ? r.itemLabel : r.purchaseRabTitle}
            </p>
          </div>
        ),
      },
      {
        header: 'Needed by',
        icon: CalendarClock,
        cellClassName: 'w-28 text-xs tabular-nums',
        cell: (r) => r.neededDate,
      },
      {
        header: 'Items',
        icon: Package,
        cellClassName: 'w-32',
        cell: (r) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="tabular-nums">{r.lineCount}</span>
            {r.flaggedCount > 0 ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {r.flaggedCount} flagged
              </span>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Requested by',
        icon: UserRound,
        cellClassName: 'w-36',
        cell: (r) => r.requestedBy?.name ?? '—',
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-32',
        cell: (r) => <RequestOrderStatusChip status={r.orderStatus} />,
      },
    ],
    [],
  )

  if (error) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-red-600">{error}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <ListTable
      filters={
        <ListSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Filter by SPP, project, SPK or RAB…"
          aria-label="Filter waiting requests"
        />
      }
      loading={loading && rows.length === 0}
      loadingLabel="Loading waiting requests…"
      empty={
        query.trim()
          ? 'No waiting requests match the filter.'
          : 'No submitted request is waiting to be ordered.'
      }
      columns={columns}
      rows={pageItems}
      rowKey={(r) => r.id}
      minWidthClassName="min-w-[900px]"
      onRowClick={(r) =>
        void navigate({
          to: '/dashboard/purchasing/orders/new',
          search: { requestId: r.id },
        })
      }
      pagination={{
        page: safePage,
        totalPages,
        totalItems: filtered.length,
        pageSize: DEFAULT_PAGE_SIZE,
        onPageChange: setPage,
      }}
    />
  )
}

/** The signed-in purchaser's own POs. */
function MyOrders() {
  const navigate = useNavigate()
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
        icon: ShoppingCart,
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      { header: 'Vendor', icon: Truck, cell: (r) => r.vendorName },
      {
        header: 'SPP',
        icon: ClipboardList,
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
        header: 'RAB',
        icon: Scale,
        cellClassName: 'w-56',
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-2">
            <p
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                r.rabLabel ? 'font-medium' : 'text-(--muted)',
              )}
              title={r.rabLabel ?? undefined}
            >
              {r.rabLabel ?? 'No RAB'}
            </p>
            <RabCompareButton orderId={r.id} size="xs" />
          </div>
        ),
      },
      {
        header: 'Total',
        icon: Wallet,
        cellClassName: 'w-40 text-right tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">{formatRupiah(r.total)}</p>
            {r.estimatedTotal !== r.total ? (
              <p className="text-xs text-(--muted)">
                est. {formatRupiah(r.estimatedTotal)} with additional costs
              </p>
            ) : null}
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
        icon: CalendarClock,
        cellClassName: 'w-28 text-xs tabular-nums',
        cell: (r) => r.expectedDate ?? '—',
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-36',
        cell: (r) => (
          <div className="space-y-0.5">
            <PurchaseOrderStatusChip status={r.status} />
            {r.status === 'approved' ? (
              <p className="text-xs text-(--muted)">
                {REALIZATION_PROGRESS_LABELS[r.receiptStatus]}
                {Number(r.paidTotal) > 0
                  ? ` · paid ${formatRupiah(r.paidTotal)}`
                  : ''}
              </p>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <>
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
          minWidthClassName="min-w-[1100px]"
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
    </>
  )
}
