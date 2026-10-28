import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { PackageCheck } from 'lucide-react'
import { GoodsReceiptStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { GOODS_RECEIPT_STATUS_LABELS, RECEIPT_PROGRESS_LABELS } from '#/lib/purchasing'
import type {
  GoodsReceiptStatus,
  GoodsReceiptSummary,
  ReceiptQueueRow,
} from '#/lib/purchasing'
import { buttonClassName, hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'
const STATUSES: GoodsReceiptStatus[] = ['posted', 'voided']

/** Approved POs still expecting goods, and every receipt so far. */
export default function GoodsReceiptsForm() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'queue' | 'receipts'>('queue')
  const [queue, setQueue] = useState<ReceiptQueueRow[] | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [rows, setRows] = useState<GoodsReceiptSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  const loadQueue = useCallback(async () => {
    setQueueError(null)
    try {
      const response = await apiFetch<ReceiptQueueRow[]>('/purchasing/receipts/queue')
      if (!response.success) {
        setQueueError(response.message || 'Failed to load approved POs')
        return
      }
      setQueue(response.data)
    } catch {
      setQueueError('Unable to reach the server')
    }
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== ALL) params.set('status', status)
      if (debounced.trim()) params.set('q', debounced.trim())
      const qs = params.toString()
      const response = await apiFetch<GoodsReceiptSummary[]>(
        `/purchasing/receipts${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load receipts')
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
    void loadQueue()
  }, [loadQueue])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    setPage(1)
  }, [status, debounced])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(rows, page, DEFAULT_PAGE_SIZE), [rows, page])

  const columns = useMemo<ListTableColumn<GoodsReceiptSummary>[]>(
    () => [
      {
        header: 'Receipt',
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.number,
      },
      {
        header: 'PO',
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate tabular-nums">{r.poNumber}</p>
            <p className="truncate text-xs text-(--muted)">
              {r.vendorName} · {r.projectNumber}
            </p>
          </div>
        ),
      },
      {
        header: 'Received',
        cell: (r) => (
          <div className="min-w-0">
            <p className="tabular-nums">{r.receivedDate}</p>
            <p className="truncate text-xs text-(--muted)">
              {[r.receivedByName, r.deliveryNoteNumber && `SJ ${r.deliveryNoteNumber}`]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        header: 'Items',
        cellClassName: 'w-16 tabular-nums',
        cell: (r) => r.lineCount,
      },
      {
        header: 'Status',
        cellClassName: 'w-24',
        cell: (r) => <GoodsReceiptStatusChip status={r.status} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Penerimaan Barang</h1>
        <p className={cn('mt-2', hintClassName)}>
          Record goods as they arrive for approved POs. Partial deliveries are fine.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v === 'receipts' ? 'receipts' : 'queue')}>
        <TabsList>
          <TabsTrigger value="queue">
            Expected{queue && queue.length > 0 ? ` (${queue.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          {queueError ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-red-600">{queueError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadQueue()}>
                Retry
              </Button>
            </div>
          ) : queue === null ? (
            <p className={cn('text-sm', hintClassName)}>Loading…</p>
          ) : queue.length === 0 ? (
            <p className={cn('text-sm', hintClassName)}>Nothing is waiting to arrive.</p>
          ) : (
            <ul className="divide-y divide-(--line) rounded-md border border-(--line)">
              {queue.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium tabular-nums">{o.number}</span>
                      <span className={hintClassName}> · {o.vendorName}</span>
                    </p>
                    <p className={cn('truncate text-xs', hintClassName)}>
                      {o.requestNumber} · {o.projectNumber} · {o.projectName}
                      {o.expectedDate ? ` · expected ${o.expectedDate}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'text-xs',
                        o.receiptStatus === 'partial' ? 'text-sky-700 dark:text-sky-300' : hintClassName,
                      )}
                    >
                      {RECEIPT_PROGRESS_LABELS[o.receiptStatus]}
                    </span>
                    <Link
                      to="/dashboard/purchasing/receipts/new"
                      search={{ orderId: o.id }}
                      className={cn(buttonClassName, 'inline-flex h-8 items-center gap-1.5 no-underline')}
                    >
                      <PackageCheck className="size-3.5" aria-hidden />
                      Receive goods
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="receipts" className="mt-6">
          {error ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-red-600">{error}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadRows()}>
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
                    placeholder="Filter by receipt, PO, vendor, project or surat jalan…"
                    aria-label="Filter receipts"
                  />
                  <Combobox
                    value={status}
                    onValueChange={(v) => setStatus(v || ALL)}
                    options={[
                      { value: ALL, label: 'All statuses' },
                      ...STATUSES.map((s) => ({ value: s, label: GOODS_RECEIPT_STATUS_LABELS[s] })),
                    ]}
                    className="w-44"
                    aria-label="Filter by status"
                  />
                </>
              }
              loading={loading}
              loadingLabel="Loading receipts…"
              empty={
                debounced.trim() || status !== ALL
                  ? 'No receipts match the current filter.'
                  : 'No goods received yet.'
              }
              columns={columns}
              rows={pageItems}
              rowKey={(r) => r.id}
              minWidthClassName="min-w-[760px]"
              onRowClick={(r) =>
                void navigate({
                  to: '/dashboard/purchasing/receipts/$receiptId',
                  params: { receiptId: r.id },
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
