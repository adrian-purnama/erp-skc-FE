import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CircleDot,
  Hash,
  Plus,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react'
import ReimbursementDialog from '#/components/forms/finance/ReimbursementDialog'
import PaymentDialog from '#/components/forms/purchasing/PaymentDialog'
import VendorPaymentDialog from '#/components/forms/purchasing/VendorPaymentDialog'
import ListTable, {
  ListChip,
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import {
  PAYMENT_STATUS_LABELS,
  formatRupiah,
  paymentLabel,
  paymentStatusTone,
} from '#/lib/purchasing'
import type {
  PurchasePayment,
  PurchasePaymentKind,
  PurchasePaymentStatus,
} from '#/lib/purchasing'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'
const STATUSES: PurchasePaymentStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'rejected',
  'cancelled',
]

/** Finance: approved payments to pay, and every vendor payment and reimbursement. */
export default function PaymentsForm({
  initialPaymentId = null,
}: {
  /** Payment to open on load (a `?payment=` link). */
  initialPaymentId?: string | null
} = {}) {
  const { can } = useAuth()
  const canPay = can('purchasing.pay')
  const canManage = can('purchasing.manage')
  const canReimburse = can('purchasing.realize')
  const [tab, setTab] = useState(canPay ? 'topay' : 'all')
  const [toPay, setToPay] = useState<PurchasePayment[] | null>(null)
  const [rows, setRows] = useState<PurchasePayment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [status, setStatus] = useState<string>(ALL)
  const [kind, setKind] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(initialPaymentId)
  const [vendorEditing, setVendorEditing] = useState<
    PurchasePayment | 'new' | null
  >(null)
  const [reimbursing, setReimbursing] = useState<
    PurchasePayment | 'new' | null
  >(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (debounced.trim()) qs.set('q', debounced.trim())
      if (status !== ALL) qs.set('status', status)
      if (kind !== ALL) qs.set('kind', kind)
      const [all, approved] = await Promise.all([
        apiFetch<PurchasePayment[]>(`/purchasing/payments?${qs.toString()}`),
        canPay
          ? apiFetch<PurchasePayment[]>('/purchasing/payments?status=approved')
          : Promise.resolve(null),
      ])
      if (!all.success) {
        setError(all.message || 'Failed to load payments')
        return
      }
      setRows(all.data)
      if (approved?.success) {
        // Oldest due first; no due date last.
        setToPay(
          [...approved.data].sort((a, b) =>
            (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'),
          ),
        )
      }
    } catch {
      setError('Unable to reach the server')
    }
  }, [debounced, status, kind, canPay])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [debounced, status, kind])

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(() => paginate(rows ?? [], page, DEFAULT_PAGE_SIZE), [rows, page])

  const columns = useMemo<ListTableColumn<PurchasePayment>[]>(
    () => [
      {
        header: 'No.',
        icon: Hash,
        cellClassName: 'w-40 whitespace-nowrap tabular-nums',
        cell: (r) => (
          <div>
            <p className="font-medium">{r.number}</p>
            <p className="text-xs text-(--muted)">{paymentLabel(r)}</p>
          </div>
        ),
      },
      {
        header: 'Pay to',
        icon: Truck,
        cell: (r) => (
          <div className="min-w-0">
            <p className="truncate">
              {r.kind === 'vendor' ? r.vendorName : r.payeeName}
            </p>
            <p className="truncate text-xs text-(--muted) tabular-nums">
              {r.kind === 'vendor'
                ? r.purchaseOrderNumber
                : `${r.items.length} ${r.items.length === 1 ? 'nota' : 'notas'}`}
            </p>
          </div>
        ),
      },
      {
        header: 'Amount',
        icon: Wallet,
        cellClassName: 'w-36 text-right font-medium tabular-nums',
        cell: (r) => formatRupiah(r.amount),
      },
      {
        header: 'Due / paid',
        icon: CalendarClock,
        cellClassName: 'w-32 text-xs tabular-nums',
        cell: (r) =>
          r.status === 'paid' ? `paid ${r.paidDate}` : (r.dueDate ?? '—'),
      },
      {
        header: 'Requested by',
        icon: UserRound,
        cellClassName: 'w-36',
        cell: (r) => r.createdBy?.name ?? '—',
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-36',
        cell: (r) => (
          <ListChip tone={paymentStatusTone(r.status)}>
            {PAYMENT_STATUS_LABELS[r.status]}
          </ListChip>
        ),
      },
    ],
    [],
  )

  const toPayTotal = (toPay ?? []).reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={pageTitleClassName}>Payments</h1>
          <p className={cn('mt-2', hintClassName)}>
            Create vendor stages (DP, termin, or pelunasan) and staff
            reimbursements here. Approved ones are paid with proof.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setVendorEditing('new')}
            >
              <Plus className="size-3.5" aria-hidden />
              New vendor payment
            </Button>
          ) : null}
          {canReimburse ? (
            <Button
              type="button"
              size="sm"
              variant={canManage ? 'outline' : 'default'}
              className="h-8 gap-1.5"
              onClick={() => setReimbursing('new')}
            >
              <Plus className="size-3.5" aria-hidden />
              New reimbursement
            </Button>
          ) : null}
        </div>
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
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {canPay ? (
              <TabsTrigger value="topay">
                To pay{toPay && toPay.length > 0 ? ` (${toPay.length})` : ''}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="all">All payments</TabsTrigger>
          </TabsList>

          {canPay ? (
            <TabsContent value="topay" className="mt-6 space-y-2">
              {toPay && toPay.length > 0 ? (
                <p className={cn('text-sm tabular-nums', hintClassName)}>
                  {formatRupiah(String(toPayTotal))} approved and waiting to be
                  paid. Oldest due date first.
                </p>
              ) : null}
              <ListTable
                loading={toPay === null}
                loadingLabel="Loading payments…"
                empty="Nothing is waiting to be paid."
                columns={columns}
                rows={toPay ?? []}
                rowKey={(r) => r.id}
                minWidthClassName="min-w-[900px]"
                onRowClick={(r) => setOpenId(r.id)}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="all" className="mt-6">
            <ListTable
              filters={
                <>
                  <ListSearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder="Filter by no., PO or person…"
                    aria-label="Filter payments"
                  />
                  <Combobox
                    value={kind}
                    onValueChange={(v) => setKind(v || ALL)}
                    options={[
                      { value: ALL, label: 'All kinds' },
                      {
                        value: 'vendor' satisfies PurchasePaymentKind,
                        label: 'Vendor payments',
                      },
                      {
                        value: 'reimburse' satisfies PurchasePaymentKind,
                        label: 'Reimbursements',
                      },
                    ]}
                    aria-label="Filter by kind"
                    className="w-48"
                  />
                  <Combobox
                    value={status}
                    onValueChange={(v) => setStatus(v || ALL)}
                    options={[
                      { value: ALL, label: 'All statuses' },
                      ...STATUSES.map((s) => ({
                        value: s,
                        label: PAYMENT_STATUS_LABELS[s],
                      })),
                    ]}
                    aria-label="Filter by status"
                    className="w-44"
                  />
                </>
              }
              loading={rows === null}
              loadingLabel="Loading payments…"
              empty="No payments match."
              columns={columns}
              rows={pageItems}
              rowKey={(r) => r.id}
              minWidthClassName="min-w-[900px]"
              onRowClick={(r) => setOpenId(r.id)}
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

      <PaymentDialog
        paymentId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
        onChanged={() => void load()}
        onEdit={(p) => {
          setOpenId(null)
          if (p.kind === 'reimburse') {
            setReimbursing(p)
            return
          }
          if (p.kind === 'vendor' && canManage) setVendorEditing(p)
        }}
      />
      <VendorPaymentDialog
        editing={vendorEditing}
        onOpenChange={(open) => !open && setVendorEditing(null)}
        onSaved={(p) => {
          setVendorEditing(null)
          void load()
          setOpenId(p.id)
        }}
      />
      <ReimbursementDialog
        editing={reimbursing}
        onOpenChange={(open) => !open && setReimbursing(null)}
        onSaved={(p) => {
          setReimbursing(null)
          void load()
          setOpenId(p.id)
        }}
      />
    </div>
  )
}
