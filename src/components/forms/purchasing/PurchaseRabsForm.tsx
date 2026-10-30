import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  CircleDot,
  FileSpreadsheet,
  Package,
  Plus,
  Wallet,
} from 'lucide-react'
import { PurchaseRabStatusChip } from '#/components/forms/purchasing/PurchaseRequestBadges'
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
  PURCHASE_RAB_STATUS_LABELS,
  PURCHASE_RAB_STATUSES,
  formatRupiah,
} from '#/lib/purchasing'
import type { PurchaseRabSummary } from '#/lib/purchasing'
import {
  buttonClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cn } from '#/lib/utils'

const ALL = 'all'

/** Purchasing RABs: budgets for buying outside the BOQ. */
export default function PurchaseRabsForm() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PurchaseRabSummary[]>([])
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
      const response = await apiFetch<PurchaseRabSummary[]>(
        `/purchasing/rabs${qs ? `?${qs}` : ''}`,
      )
      if (!response.success) {
        setError(response.message || 'Failed to load RABs')
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

  const columns = useMemo<ListTableColumn<PurchaseRabSummary>[]>(
    () => [
      {
        header: 'RAB',
        icon: FileSpreadsheet,
        cell: (r) => (
          <div className="min-w-0">
            <p className="font-medium whitespace-nowrap tabular-nums">{r.number}</p>
            <p className="truncate text-xs text-(--muted)">{r.title}</p>
          </div>
        ),
      },
      {
        header: 'Items',
        icon: Package,
        cellClassName: 'w-24 tabular-nums',
        cell: (r) => r.lineCount,
      },
      {
        header: 'Budget',
        icon: Wallet,
        cellClassName: 'w-40 text-right tabular-nums',
        cell: (r) => formatRupiah(r.total),
      },
      {
        header: 'Status',
        icon: CircleDot,
        cellClassName: 'w-28',
        cell: (r) => <PurchaseRabStatusChip status={r.status} />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageTitleClassName}>RAB</h1>
          <p className={cn('mt-2', hintClassName)}>
            Budgets for buying outside projects, such as supplies or tools.
            Lock a RAB so material requests (SPP) can be made from it.
          </p>
        </div>
        {can('purchasing.rab') ? (
          <Link
            to="/dashboard/purchasing/rabs/new"
            className={cn(
              buttonClassName,
              'inline-flex h-9 items-center gap-1.5 no-underline',
            )}
          >
            <Plus className="size-4" aria-hidden />
            New RAB
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
                placeholder="Filter by RAB or title…"
                aria-label="Filter RABs"
              />
              <Combobox
                value={status}
                onValueChange={(v) => setStatus(v || ALL)}
                options={[
                  { value: ALL, label: 'All statuses' },
                  ...PURCHASE_RAB_STATUSES.map((s) => ({
                    value: s,
                    label: PURCHASE_RAB_STATUS_LABELS[s],
                  })),
                ]}
                className="w-44"
                aria-label="Filter by status"
              />
            </>
          }
          loading={loading}
          loadingLabel="Loading RABs…"
          empty={
            debounced.trim() || status !== ALL
              ? 'No RABs match the current filter.'
              : 'No RABs yet.'
          }
          columns={columns}
          rows={pageItems}
          rowKey={(r) => r.id}
          minWidthClassName="min-w-[640px]"
          onRowClick={(r) =>
            void navigate({
              to: '/dashboard/purchasing/rabs/$rabId',
              params: { rabId: r.id },
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
