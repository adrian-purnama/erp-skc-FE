import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle, Plus } from 'lucide-react'
import ProductionOrderDialog, {
  ProductionStatusChip,
  ProgressBar,
} from '#/components/forms/production/ProductionOrderDialog'
import ProductionNotesField from '#/components/forms/production/ProductionNotesField'
import ProductionPicPicker from '#/components/forms/production/ProductionPicPicker'
import ListTable, {
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import {
  PRODUCTION_ITEM_STATUS_LABELS,
  PRODUCTION_ORDER_STATUS_LABELS,
} from '#/lib/production'
import type {
  ProductionItemProgress,
  ProductionOrder,
  ProductionOrderSummary,
  ProductionProjectProgress,
} from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
}

type CreateForm = {
  item: ProductionItemProgress
  qty: string
  plannedStart: string
  plannedFinish: string
  picUserId: string | null
  notes: string
}

/** Production phase of a project: per-item progress and its SPKs. */
export default function ProjectProductionPanel({ projectId }: Props) {
  const { can } = useAuth()
  const canManage = can('production.manage')
  const canReport = can('production.report')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProductionProjectProgress | null>(
    null,
  )
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([])
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [create, setCreate] = useState<CreateForm | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [progressRes, ordersRes] = await Promise.all([
        apiFetch<ProductionProjectProgress>(
          `/production/projects/${projectId}/progress`,
        ),
        apiFetch<ProductionOrderSummary[]>(
          `/production/orders?projectId=${encodeURIComponent(projectId)}`,
        ),
      ])
      if (!progressRes.success || !ordersRes.success) {
        setError(
          progressRes.message ||
            ordersRes.message ||
            'Failed to load production',
        )
        return
      }
      setProgress(progressRes.data)
      setOrders(ordersRes.data)
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  async function submitCreate() {
    if (!create) return
    setCreating(true)
    try {
      const response = await apiFetch<ProductionOrder>('/production/orders', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          shopDrawingItemId: create.item.itemId,
          qty: create.qty,
          plannedStart: create.plannedStart || null,
          plannedFinish: create.plannedFinish || null,
          picUserId: create.picUserId,
          notes: create.notes,
        }),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to create SPK')
        return
      }
      toast.success(`${response.data.number} created as draft`)
      setCreate(null)
      setOpenOrderId(response.data.id)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setCreating(false)
    }
  }

  const itemColumns = useMemo<ListTableColumn<ProductionItemProgress>[]>(
    () => [
      {
        header: 'Item',
        cellClassName: 'font-medium',
        cell: (i) => (
          <div className="min-w-0">
            <p>{i.label}</p>
            {i.category ? (
              <p className="text-[10px] font-normal tracking-wide text-(--muted)">
                {i.category}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Make',
        cellClassName: 'w-16 text-right tabular-nums',
        cell: (i) => i.makeQty,
      },
      {
        header: 'In SPK',
        cellClassName: 'w-16 text-right tabular-nums',
        cell: (i) => i.orderedQty,
      },
      {
        header: 'Done',
        cellClassName: 'w-16 text-right font-medium tabular-nums',
        cell: (i) => i.doneQty,
      },
      {
        header: 'Progress',
        cellClassName: 'w-40',
        cell: (i) => (
          <div className="flex items-center gap-2">
            <ProgressBar percent={i.percent} />
            <span className="w-9 text-right text-xs tabular-nums">
              {i.percent}%
            </span>
          </div>
        ),
      },
      {
        header: 'Status',
        cellClassName: 'w-28',
        cell: (i) => (
          <ProductionStatusChip
            status={i.status}
            label={PRODUCTION_ITEM_STATUS_LABELS[i.status]}
          />
        ),
      },
      {
        header: '',
        cellClassName: 'w-28 text-right',
        cell: (i) =>
          canManage && Number(i.remainingToOrder) > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                setCreate({
                  item: i,
                  qty: i.remainingToOrder,
                  plannedStart: '',
                  plannedFinish: '',
                  picUserId: null,
                  notes: '',
                })
              }
            >
              <Plus className="size-3" aria-hidden />
              New SPK
            </Button>
          ) : null,
      },
    ],
    [canManage],
  )

  const orderColumns = useMemo<ListTableColumn<ProductionOrderSummary>[]>(
    () => [
      {
        header: 'SPK',
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (o) => o.number,
      },
      { header: 'Item', cell: (o) => o.itemLabel },
      {
        header: 'Done / qty',
        cellClassName: 'w-24 text-right tabular-nums',
        cell: (o) => `${o.doneQty} / ${o.qty}`,
      },
      {
        header: 'Planned',
        cellClassName: 'w-48 text-xs tabular-nums whitespace-nowrap',
        cell: (o) =>
          o.plannedStart || o.plannedFinish
            ? `${o.plannedStart ?? '—'} → ${o.plannedFinish ?? '—'}`
            : '—',
      },
      {
        header: 'PIC',
        cellClassName: 'w-32',
        cell: (o) => o.pic || <span className={hintClassName}>—</span>,
      },
      {
        header: 'Status',
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

  if (loading && !progress) {
    return (
      <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading production…
      </p>
    )
  }

  if (error) {
    return (
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
    )
  }

  if (!progress) return null

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className={sectionTitleClassName}>Progress per item</h2>
            <p className={hintClassName}>
              {progress.totals.doneQty} of {progress.totals.makeQty} units done
              ({progress.totals.percent}%).
            </p>
          </div>
          <div className="w-48">
            <ProgressBar percent={progress.totals.percent} />
          </div>
        </div>
        <ListTable
          empty="No shop drawing items."
          columns={itemColumns}
          rows={progress.items}
          rowKey={(i) => i.itemId}
          minWidthClassName="min-w-[760px]"
        />
      </section>

      <section className="space-y-3">
        <h2 className={sectionTitleClassName}>SPK Produksi</h2>
        <ListTable
          empty="No SPK yet. Use New SPK on an item above."
          columns={orderColumns}
          rows={orders}
          rowKey={(o) => o.id}
          minWidthClassName="min-w-[760px]"
          onRowClick={(o) => setOpenOrderId(o.id)}
        />
      </section>

      <ProductionOrderDialog
        orderId={openOrderId}
        onOpenChange={(open) => {
          if (!open) setOpenOrderId(null)
        }}
        onChanged={() => void load()}
        canManage={canManage}
        canReport={canReport}
      />

      <AlertDialog
        open={create !== null}
        onOpenChange={(next) => {
          if (!next && !creating) setCreate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New SPK · {create?.item.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Inhouse production. {create?.item.remainingToOrder} of{' '}
              {create?.item.makeQty} still free for this item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {create ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Qty</span>
                  <input
                    inputMode="decimal"
                    value={create.qty}
                    disabled={creating}
                    onChange={(e) =>
                      setCreate({ ...create, qty: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">PIC</span>
                  <ProductionPicPicker
                    value={create.picUserId}
                    disabled={creating}
                    onChange={(picUserId) =>
                      setCreate({ ...create, picUserId })
                    }
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Planned start</span>
                  <input
                    type="date"
                    value={create.plannedStart}
                    disabled={creating}
                    onChange={(e) =>
                      setCreate({ ...create, plannedStart: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Planned finish</span>
                  <input
                    type="date"
                    value={create.plannedFinish}
                    disabled={creating}
                    onChange={(e) =>
                      setCreate({ ...create, plannedFinish: e.target.value })
                    }
                    className={dialogInputClassName}
                  />
                </label>
              </div>
              <ProductionNotesField
                notes={create.notes}
                disabled={creating}
                onChange={(notes) => setCreate({ ...create, notes })}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={creating || !create?.qty.trim()}
              onClick={(e) => {
                e.preventDefault()
                void submitCreate()
              }}
            >
              {creating ? 'Creating…' : 'Create draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
