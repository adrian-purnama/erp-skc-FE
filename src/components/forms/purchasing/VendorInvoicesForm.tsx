import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  CalendarClock,
  CircleDot,
  Hash,
  PackageCheck,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { VENDOR_INVOICE_STATUS_LABELS, formatRupiah } from '#/lib/purchasing'
import type {
  VendorInvoiceQueueRow,
  VendorInvoiceStatus,
  VendorInvoiceSummary,
} from '#/lib/purchasing'
import {
  buttonOutlineClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'
const STATUSES: VendorInvoiceStatus[] = ['draft', 'posted', 'voided']

/** Deliveries still waiting for the vendor's invoice, and every vendor invoice so far. */
export default function VendorInvoicesForm() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const canRealize = can('purchasing.realize')
  const [tab, setTab] = useState<'queue' | 'all'>(canRealize ? 'queue' : 'all')
  const [queue, setQueue] = useState<VendorInvoiceQueueRow[] | null>(null)
  const [rows, setRows] = useState<VendorInvoiceSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (debounced.trim()) qs.set('q', debounced.trim())
      if (status !== ALL) qs.set('status', status)
      const [list, waiting] = await Promise.all([
        apiFetch<VendorInvoiceSummary[]>(`/purchasing/invoices?${qs.toString()}`),
        apiFetch<VendorInvoiceQueueRow[]>('/purchasing/invoices/queue'),
      ])
      if (!list.success) {
        setError(list.message || 'Failed to load vendor invoices')
        return
      }
      setRows(list.data)
      setQueue(waiting.success ? waiting.data : [])
    } catch {
      setError('Unable to reach the server')
    }
  }, [debounced, status])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debounced, status])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(rows ?? [], page, DEFAULT_PAGE_SIZE), [rows, page])

  const queueColumns = useMemo<ListTableColumn<VendorInvoiceQueueRow>[]>(
    () => [
      {
        header: 'PO',
        icon: ShoppingCart,
        cellClassName: 'w-44 font-medium whitespace-nowrap tabular-nums',
        cell: (r) => r.poNumber,
      },
      {
        header: 'Vendor',
        icon: Truck,
        cell: (r) => <span className="truncate">{r.vendorName}</span>,
      },
      {
        header: 'Goods receipts without an invoice',
        icon: PackageCheck,
        cell: (r) => (
          <p className="truncate text-xs tabular-nums">
            {r.receipts
              .map((g) => `${g.number}${g.deliveryNoteNumber ? ` (SJ ${g.deliveryNoteNumber})` : ''}`)
              .join(', ')}
          </p>
        ),
      },
      {
        header: 'At PO price',
        icon: Wallet,
        cellClassName: 'w-40 text-right tabular-nums',
        cell: (r) =>
          formatRupiah(String(r.receipts.reduce((s, g) => s + Number(g.total), 0))),
      },
      {
        header: '',
        cellClassName: 'w-32 text-right',
        cell: (r) =>
          canRealize ? (
            <Link
              to="/dashboard/purchasing/invoices/new"
              search={{ orderId: r.purchaseOrderId }}
              className={cn(buttonOutlineClassName, 'inline-flex h-7 items-center px-2 text-xs no-underline')}
              onClick={(e) => e.stopPropagation()}
            >
              Add invoice
            </Link>
          ) : null,
      },
    ],
    [canRealize],
  )

  const columns = useMemo<ListTableColumn<VendorInvoiceSummary>[]>(
    () => [
      {
        header: 'No.',
        icon: Hash,
        cellClassName: 'w-44 whitespace-nowrap tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">{r.number}</p>
            <p className="text-xs text-(--muted)">
              {r.vendorInvoiceNumber || 'no vendor no.'}
            </p>
          </div>
        ),
      },
      {
        header: 'Vendor · PO',
        icon: Truck,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate">{r.vendorName}</p>
            <p className="truncate text-xs text-(--muted) tabular-nums">
              {r.poNumber} · {r.receipts.length}{' '}
              {r.receipts.length === 1 ? 'GR' : 'GRs'}
            </p>
          </div>
        ),
      },
      {
        header: 'Total',
        icon: Wallet,
        cellClassName: 'w-36 text-right font-medium tabular-nums',
        cell: (r) => formatRupiah(r.total),
      },
      {
        header: 'Invoice date · due',
        icon: CalendarClock,
        cellClassName: 'w-40 text-xs tabular-nums',
        cell: (r) => `${r.invoiceDate} · ${r.dueDate ?? '—'}`,
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-28',
        cell: (r) => <RealizationStatusChip status={r.status} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Vendor invoices</h1>
        <p className={cn('mt-2', hintClassName)}>
          What vendors billed for their deliveries. A goods receipt counts at
          the PO price until its invoice is posted; the invoice is the only
          place vendor prices are entered.
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
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'queue' | 'all')}>
          <TabsList>
            <TabsTrigger value="queue">
              To invoice{queue && queue.length > 0 ? ` (${queue.length})` : ''}
            </TabsTrigger>
            <TabsTrigger value="all">All invoices</TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="mt-6">
            <ListTable
              loading={queue === null}
              loadingLabel="Loading…"
              empty="Every posted goods receipt has an invoice."
              columns={queueColumns}
              rows={queue ?? []}
              rowKey={(r) => r.purchaseOrderId}
              minWidthClassName="min-w-[860px]"
            />
          </TabsContent>
          <TabsContent value="all" className="mt-6">
            <ListTable
              filters={
                <>
                  <ListSearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Filter by no., vendor no., PO, GR or surat jalan…"
                    aria-label="Filter vendor invoices"
                  />
                  <Combobox
                    value={status}
                    onValueChange={(v) => setStatus(v || ALL)}
                    options={[
                      { value: ALL, label: 'All statuses' },
                      ...STATUSES.map((s) => ({
                        value: s,
                        label: VENDOR_INVOICE_STATUS_LABELS[s],
                      })),
                    ]}
                    aria-label="Filter by status"
                    className="w-44"
                  />
                </>
              }
              loading={rows === null}
              loadingLabel="Loading vendor invoices…"
              empty="No vendor invoices match."
              columns={columns}
              rows={pageItems}
              rowKey={(r) => r.id}
              minWidthClassName="min-w-[860px]"
              onRowClick={(r) =>
                void navigate({
                  to: '/dashboard/purchasing/invoices/$invoiceId',
                  params: { invoiceId: r.id },
                })
              }
              pagination={{
                page: safePage,
                totalPages,
                totalItems: rows?.length ?? 0,
                pageSize: DEFAULT_PAGE_SIZE,
                onPageChange: setPage,
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
