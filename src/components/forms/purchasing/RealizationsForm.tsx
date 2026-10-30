import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Camera,
  CircleDot,
  FolderOpen,
  Hash,
  Paperclip,
  Pencil,
  Receipt,
  ShoppingCart,
  UserRound,
  Wallet,
} from 'lucide-react'
import { RealizationStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
import { RabCompareButton } from '#/components/forms/purchasing/RabCompareDialog'
import ListTable, {
  ListChip,
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import {
  REALIZATION_DOC_LABELS,
  REALIZATION_METHOD_LABELS,
  REALIZATION_PROGRESS_LABELS,
  REALIZATION_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatRupiah,
  formatRupiahDiff,
} from '#/lib/purchasing'
import type {
  RealizationQueueRow,
  RealizationStatus,
  RealizationSummary,
} from '#/lib/purchasing'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'
const STATUSES: RealizationStatus[] = ['draft', 'posted', 'voided']

function diffClass(digits: string): string {
  const n = Number(digits)
  if (n > 0) return 'text-red-700 dark:text-red-300'
  if (n < 0) return 'text-emerald-700 dark:text-emerald-300'
  return 'text-(--muted)'
}

/** Approved POs still open, and every realization (Penerimaan / Nota Realisasi) so far. */
export default function RealizationsForm() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'queue' | 'notas'>('queue')
  const [queue, setQueue] = useState<RealizationQueueRow[] | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [notas, setNotas] = useState<RealizationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  const loadQueue = useCallback(async () => {
    setQueueError(null)
    try {
      const response = await apiFetch<RealizationQueueRow[]>(
        '/purchasing/realizations/queue',
      )
      if (!response.success) {
        setQueueError(response.message || 'Failed to load approved POs')
        return
      }
      setQueue(response.data)
    } catch {
      setQueueError('Unable to reach the server')
    }
  }, [])

  const loadNotas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (status !== ALL) params.set('status', status)
      if (debounced.trim()) params.set('q', debounced.trim())
      const qs = params.toString()
      const response = await apiFetch<RealizationSummary[]>(
        `/purchasing/realizations${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load realizations')
        return
      }
      setNotas(response.data)
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
    void loadNotas()
  }, [loadNotas])

  useEffect(() => {
    setPage(1)
  }, [status, debounced])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(notas, page, DEFAULT_PAGE_SIZE), [notas, page])

  const columns = useMemo<ListTableColumn<RealizationSummary>[]>(
    () => [
      {
        header: 'No.',
        icon: Hash,
        cellClassName: 'w-36 whitespace-nowrap tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">{r.number}</p>
            <p className="text-xs text-(--muted)">
              {REALIZATION_DOC_LABELS[r.method]}
            </p>
          </div>
        ),
      },
      {
        header: 'PO',
        icon: ShoppingCart,
        cell: (r) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate tabular-nums">{r.poNumber}</p>
              <p className="truncate text-xs text-(--muted)">
                {r.vendorName} · {r.projectNumber}
              </p>
            </div>
            <RabCompareButton orderId={r.purchaseOrderId} size="xs" />
          </div>
        ),
      },
      {
        header: 'Who · when',
        icon: UserRound,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate">
              {(r.method === 'staff' ? r.buyerName : r.receivedByName) ||
                REALIZATION_METHOD_LABELS[r.method]}
            </p>
            <p className="truncate text-xs text-(--muted) tabular-nums">
              {r.purchaseDate}
              {r.place ? ` · ${r.place}` : ''}
            </p>
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
            <p className={cn('text-xs', diffClass(r.difference))}>
              {formatRupiahDiff(r.difference)}
              {r.chargesTotal !== '0' ? (
                <span className="text-(--muted)">
                  {' '}
                  · +{formatRupiah(r.chargesTotal)}
                </span>
              ) : null}
            </p>
          </div>
        ),
      },
      {
        header: 'Files',
        icon: Paperclip,
        cellClassName: 'w-16 text-xs tabular-nums',
        cell: (r) => (
          <span className="inline-flex items-center gap-1 text-(--muted)">
            <Camera className="size-3.5" aria-hidden />
            {r.photoCount}
          </span>
        ),
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-36',
        cell: (r) => (
          <div className="space-y-0.5">
            <RealizationStatusChip status={r.status} />
            {r.method === 'staff' && r.status === 'posted' ? (
              <p className="text-xs text-(--muted)">
                {r.reimbursement
                  ? `${r.reimbursement.number} · ${PAYMENT_STATUS_LABELS[r.reimbursement.status].toLowerCase()}`
                  : 'Not reimbursed yet'}
              </p>
            ) : r.deliveredTo === 'vendor' ? (
              <p className="text-xs text-(--muted)">Straight to vendor</p>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  )

  /** A PO with a draft opens that draft; otherwise a new realization. */
  function openQueueRow(o: RealizationQueueRow) {
    const draft = o.drafts.at(0)
    if (draft) {
      void navigate({
        to: '/dashboard/purchasing/realizations/$realizationId',
        params: { realizationId: draft.id },
      })
    } else {
      void navigate({
        to: '/dashboard/purchasing/realizations/new',
        search: { orderId: o.id },
      })
    }
  }

  const queueColumns = useMemo<ListTableColumn<RealizationQueueRow>[]>(
    () => [
      {
        header: 'PO',
        icon: ShoppingCart,
        cellClassName: 'w-72',
        cell: (o) => (
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium tabular-nums">{o.number}</p>
              <p className="truncate text-xs text-(--muted)">{o.vendorName}</p>
            </div>
            <RabCompareButton orderId={o.id} size="xs" />
          </div>
        ),
      },
      {
        header: 'From',
        icon: FolderOpen,
        cell: (o) => (
          <div className="min-w-0">
            <p className="truncate">
              {o.projectNumber} · {o.projectName}
            </p>
            <p className="truncate text-xs text-(--muted) tabular-nums">
              {o.requestNumber}
              {o.expectedDate ? ` · delivery ${o.expectedDate}` : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Total',
        icon: Wallet,
        align: 'right',
        cellClassName: 'w-40',
        cell: (o) => (
          <div>
            <p className="font-medium">{formatRupiah(o.total)}</p>
            {o.realizationStatus === 'partial' ? (
              <p className="text-xs text-(--muted)">
                {formatRupiah(o.realizedTotal)} posted
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-52',
        cell: (o) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <ListChip
              tone={o.realizationStatus === 'partial' ? 'info' : 'neutral'}
            >
              {REALIZATION_PROGRESS_LABELS[o.realizationStatus]}
            </ListChip>
            {o.drafts.length > 0 ? (
              <ListChip tone="warning">
                Draft {o.drafts.map((d) => d.number).join(', ')}
              </ListChip>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Record',
        icon: Receipt,
        align: 'right',
        cellClassName: 'w-44',
        cell: (o) => (
          <div className="flex justify-end gap-1.5">
            {o.drafts.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant={o.heldByDrafts ? 'default' : 'outline'}
                className="h-7"
                onClick={(e) => {
                  e.stopPropagation()
                  openQueueRow(o)
                }}
              >
                <Pencil className="size-3.5" aria-hidden />
                Open draft
              </Button>
            ) : null}
            {!o.heldByDrafts ? (
              <Link
                to="/dashboard/purchasing/realizations/new"
                search={{ orderId: o.id }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  o.drafts.length > 0
                    ? buttonOutlineClassName
                    : buttonClassName,
                  'inline-flex h-7 items-center gap-1.5 no-underline',
                )}
              >
                <Receipt className="size-3.5" aria-hidden />
                Record
              </Link>
            ) : null}
          </div>
        ),
      },
    ],
    [navigate],
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Realizations</h1>
        <p className={cn('mt-2', hintClassName)}>
          For approved POs: record a Penerimaan when the vendor delivers, or a
          Nota Realisasi when staff bought it. Posted qty counts as arrived on
          the SPP / SPK.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v === 'notas' ? 'notas' : 'queue')}
      >
        <TabsList>
          <TabsTrigger value="queue">
            Waiting{queue && queue.length > 0 ? ` (${queue.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="notas">Recorded</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          {queueError ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-red-600">{queueError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadQueue()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <ListTable
              loading={queue === null}
              loadingLabel="Loading approved POs…"
              empty="Everything on approved POs has arrived."
              columns={queueColumns}
              rows={queue ?? []}
              rowKey={(o) => o.id}
              minWidthClassName="min-w-[900px]"
              onRowClick={openQueueRow}
            />
          )}
        </TabsContent>

        <TabsContent value="notas" className="mt-6">
          {error ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-red-600">{error}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadNotas()}
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
                    placeholder="Filter by no., PO, vendor, project, person, shop or surat jalan…"
                    aria-label="Filter realizations"
                  />
                  <Combobox
                    value={status}
                    onValueChange={(v) => setStatus(v || ALL)}
                    options={[
                      { value: ALL, label: 'All statuses' },
                      ...STATUSES.map((s) => ({
                        value: s,
                        label: REALIZATION_STATUS_LABELS[s],
                      })),
                    ]}
                    className="w-44"
                    aria-label="Filter by status"
                  />
                </>
              }
              loading={loading}
              loadingLabel="Loading realizations…"
              empty={
                debounced.trim() || status !== ALL
                  ? 'Nothing matches the current filter.'
                  : 'Nothing recorded yet.'
              }
              columns={columns}
              rows={pageItems}
              rowKey={(r) => r.id}
              minWidthClassName="min-w-[900px]"
              onRowClick={(r) =>
                void navigate({
                  to: '/dashboard/purchasing/realizations/$realizationId',
                  params: { realizationId: r.id },
                })
              }
              pagination={{
                page: safePage,
                totalPages,
                totalItems: notas.length,
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
