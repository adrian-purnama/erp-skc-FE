import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { RabCompareButton } from '#/components/forms/purchasing/RabCompareDialog'
import PaymentApprovalsList from '#/components/forms/purchasing/PaymentApprovalsList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { formatRupiah } from '#/lib/purchasing'
import type { PurchaseOrderSummary } from '#/lib/purchasing'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'
import {
  ClipboardList,
  Hourglass,
  Layers,
  Scale,
  ShoppingCart,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'

/** "today", "1 day", "3 days" since the PO was sent. */
function waitingFor(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}

/** When the PO reached its current level: sent (level 1) or level 1 approved (level 2). */
function reachedLevelAt(r: PurchaseOrderSummary): string | null {
  return r.approvalLevel === 2 ? r.approved1At : r.submittedAt
}

/** POs and payments waiting on your approval (level 1 or level 2), oldest first. */
export default function PurchaseOrderApprovalsForm() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState('orders')
  const [paymentCount, setPaymentCount] = useState<number | null>(null)

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
          (reachedLevelAt(a) ?? '').localeCompare(reachedLevelAt(b) ?? ''),
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
        header: 'Level',
        icon: Layers,
        cellClassName: 'w-28',
        cell: (r) => (
          <div>
            <p className="font-medium">Level {r.approvalLevel ?? '—'}</p>
            {r.approvalLevel === 2 ? (
              <p className="text-xs text-(--muted)">
                L1 by {r.approver1?.name ?? '—'}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Sent by',
        icon: UserRound,
        cellClassName: 'w-36',
        cell: (r) => r.createdBy?.name ?? '—',
      },
      {
        header: 'Waiting',
        icon: Hourglass,
        cellClassName: 'w-24 text-xs tabular-nums',
        cell: (r) => waitingFor(reachedLevelAt(r)),
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
            ? 'Purchase orders waiting for your approval.'
            : rows.length === 0
              ? 'Nothing is waiting for approval.'
              : `${rows.length} purchase ${rows.length === 1 ? 'order is' : 'orders are'} waiting. Oldest first.`}
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="orders">
            Purchase orders{loading ? '' : ` (${rows.length})`}
          </TabsTrigger>
          <TabsTrigger value="payments">
            Payments{paymentCount === null ? '' : ` (${paymentCount})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="payments" forceMount className="pt-4 data-[state=inactive]:hidden">
          <PaymentApprovalsList onCount={setPaymentCount} />
        </TabsContent>
        <TabsContent value="orders" className="pt-4">
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
          minWidthClassName="min-w-[1100px]"
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
