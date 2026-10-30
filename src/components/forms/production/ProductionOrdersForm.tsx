import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import ProductionOrderDialog, {
  ProductionStatusChip,
} from '#/components/forms/production/ProductionOrderDialog'
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
  PRODUCTION_ORDER_STATUS_LABELS,
  PRODUCTION_ORDER_STATUSES,
  PRODUCTION_ORDER_TYPE_LABELS,
} from '#/lib/production'
import type { ProductionOrderSummary } from '#/lib/production'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  CalendarClock,
  CircleDot,
  Factory,
  FileText,
  FolderKanban,
  ListChecks,
  Package,
  UserRound,
} from 'lucide-react'

const ALL = 'all'
/** Default view: everything except cancelled SPKs, like an open-orders list. */
const OPEN = 'open'

/** Every SPK across projects: the production floor's daily list. */
export default function ProductionOrdersForm({
  initialOrderId = null,
}: {
  /** SPK to open on load (a `?spk=` link). */
  initialOrderId?: string | null
} = {}) {
  const { can } = useAuth()
  const viewAll = can('production.viewAll')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(OPEN)
  const [page, setPage] = useState(1)
  const [openOrderId, setOpenOrderId] = useState<string | null>(initialOrderId)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== ALL && status !== OPEN) params.set('status', status)
      if (debounced.trim()) params.set('q', debounced.trim())
      const qs = params.toString()
      const response = await apiFetch<ProductionOrderSummary[]>(
        `/production/orders${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load SPK')
        return
      }
      setOrders(
        status === OPEN
          ? response.data.filter((o) => o.status !== 'cancelled')
          : response.data,
      )
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
  } = useMemo(() => paginate(orders, page, DEFAULT_PAGE_SIZE), [orders, page])

  const columns = useMemo<ListTableColumn<ProductionOrderSummary>[]>(
    () => [
      {
        header: 'SPK',
        icon: FileText,
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (o) => o.number,
      },
      {
        header: 'Project',
        icon: FolderKanban,
        cell: (o) => (
          <div className="min-w-0">
            <Link
              to="/dashboard/projects/$projectId"
              params={{ projectId: o.projectId }}
              className="tabular-nums underline-offset-4 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {o.projectNumber}
            </Link>
            <p className="truncate text-xs text-(--muted)">{o.projectName}</p>
          </div>
        ),
      },
      { header: 'Item', icon: Package, cell: (o) => o.itemLabel },
      {
        header: 'Type',
        icon: Factory,
        cellClassName: 'w-28',
        cell: (o) => PRODUCTION_ORDER_TYPE_LABELS[o.type],
      },
      {
        header: 'Progress',
        icon: ListChecks,
        cellClassName: 'w-28 text-right tabular-nums',
        cell: (o) =>
          o.type === 'inhouse' && o.progressPercent != null
            ? `${o.progressPercent}% · ${o.doneQty}/${o.qty}`
            : `${o.doneQty} / ${o.qty}`,
      },
      {
        header: 'Planned finish',
        icon: CalendarClock,
        cellClassName: 'w-28 text-xs tabular-nums',
        cell: (o) => o.plannedFinish ?? '—',
      },
      {
        header: 'PIC',
        icon: UserRound,
        cellClassName: 'w-32',
        cell: (o) => o.pic || <span className={hintClassName}>—</span>,
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-28',
        cell: (o) => (
          <ProductionStatusChip
            status={o.status}
            label={PRODUCTION_ORDER_STATUS_LABELS[o.status]}
          />
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>SPK Produksi</h1>
        <p className={`mt-2 ${hintClassName}`}>
          {viewAll
            ? 'Production orders across all projects. Create SPK from a project’s Production page.'
            : 'SPK where you are the PIC.'}
        </p>
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
                placeholder="Filter by SPK, project, item or PIC…"
                aria-label="Filter SPK"
              />
              <Combobox
                value={status}
                onValueChange={(v) => setStatus(v || OPEN)}
                options={[
                  { value: OPEN, label: 'All except cancelled' },
                  { value: ALL, label: 'All statuses' },
                  ...PRODUCTION_ORDER_STATUSES.filter(
                    (s) => viewAll || s !== 'draft',
                  ).map((s) => ({
                    value: s,
                    label: PRODUCTION_ORDER_STATUS_LABELS[s],
                  })),
                ]}
                className="w-44"
                aria-label="Filter by status"
              />
            </>
          }
          loading={loading}
          loadingLabel="Loading SPK…"
          empty={
            debounced.trim() || (status !== ALL && status !== OPEN)
              ? 'No SPK match the current filter.'
              : viewAll
                ? 'No SPK yet.'
                : 'No SPK assigned to you yet.'
          }
          columns={columns}
          rows={pageItems}
          rowKey={(o) => o.id}
          minWidthClassName="min-w-[900px]"
          onRowClick={(o) => setOpenOrderId(o.id)}
          pagination={{
            page: safePage,
            totalPages,
            totalItems: orders.length,
            pageSize: DEFAULT_PAGE_SIZE,
            onPageChange: setPage,
          }}
        />
      )}

      <ProductionOrderDialog
        orderId={openOrderId}
        onOpenChange={(open) => {
          if (!open) setOpenOrderId(null)
        }}
        onChanged={() => void load()}
        canManage={can('production.manage')}
        canReport={can('production.report')}
      />
    </div>
  )
}
