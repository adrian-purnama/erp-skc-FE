import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  CalendarClock,
  CircleDot,
  FileText,
  Hammer,
  ListChecks,
  LoaderCircle,
  Package,
  UserRound,
} from 'lucide-react'
import ProductionOrderDialog, {
  ProductionStatusChip,
} from '#/components/forms/production/ProductionOrderDialog'
import ProductionItemList from '#/components/forms/production/ProductionItemList'
import ProductionNotesField from '#/components/forms/production/ProductionNotesField'
import ProductionPicPicker from '#/components/forms/production/ProductionPicPicker'
import ProductionProcessDialog from '#/components/forms/production/ProductionProcessDialog'
import ListTable from '#/components/forms/shared/ListTable'
import type { ListTableColumn } from '#/components/forms/shared/ListTable'
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
  PRODUCTION_EXECUTOR_LABELS,
  PRODUCTION_ORDER_STATUS_LABELS,
} from '#/lib/production'
import type {
  ProductionItemProgress,
  ProductionOrder,
  ProductionOrderSummary,
  ProductionProjectProgress,
  ProductionStageProgress,
} from '#/lib/production'
import {
  dialogInputClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { formatYmdShort } from '#/lib/projectSchedule'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
}

type CreateForm = {
  item: ProductionItemProgress
  stage: ProductionStageProgress
  qty: string
  plannedStart: string
  plannedFinish: string
  picUserId: string | null
  notes: string
}

/** "Stage 2 · 40%" / "Install 1 · 30%". */
function stageLabel(stage: {
  role: ProductionStageProgress['role']
  sequence: number | null
  weightPercent?: number | null
}): string {
  const weight = stage.weightPercent != null ? ` · ${stage.weightPercent}%` : ''
  const name = stage.role === 'install' ? 'Install' : 'Stage'
  return `${name} ${stage.sequence ?? '—'}${weight}`
}

/** Production phase of a project: per-item stages and their SPKs (one per labour line). */
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
  const [showCancelled, setShowCancelled] = useState(false)
  const [processItemId, setProcessItemId] = useState<string | null>(null)
  const processItem =
    progress?.items.find((i) => i.itemId === processItemId) ?? null
  const cancelledCount = orders.filter((o) => o.status === 'cancelled').length
  const visibleOrders = showCancelled
    ? orders
    : orders.filter((o) => o.status !== 'cancelled')

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
          labourItemId: create.stage.labourItemId,
          labourUomId: create.stage.labourUomId,
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

  function openCreate(
    item: ProductionItemProgress,
    stage: ProductionStageProgress,
  ) {
    setCreate({
      item,
      stage,
      qty: stage.remainingToOrder,
      plannedStart: '',
      plannedFinish: '',
      picUserId: null,
      notes: '',
    })
  }

  const orderColumns = useMemo<ListTableColumn<ProductionOrderSummary>[]>(
    () => [
      {
        header: 'SPK',
        icon: FileText,
        cellClassName: 'w-40 font-medium whitespace-nowrap tabular-nums',
        cell: (o) => o.number,
      },
      { header: 'Item', icon: Package, cell: (o) => o.itemLabel },
      {
        header: 'Labour',
        icon: Hammer,
        cellClassName: 'w-44',
        cell: (o) => (
          <div className="min-w-0">
            <p className="truncate">{o.labourName}</p>
            <p className={cn('text-sm', hintClassName)}>
              {stageLabel(o)}
              {o.executor === 'vendor' ? ' · Vendor' : ''}
            </p>
          </div>
        ),
      },
      {
        header: 'Done / qty',
        icon: ListChecks,
        cellClassName: 'w-24 text-right tabular-nums',
        cell: (o) => `${o.doneQty} / ${o.qty}`,
      },
      {
        header: 'Planned',
        icon: CalendarClock,
        cellClassName: 'w-40 tabular-nums whitespace-nowrap',
        cell: (o) =>
          o.plannedStart || o.plannedFinish ? (
            `${o.plannedStart ? formatYmdShort(o.plannedStart) : '—'} → ${o.plannedFinish ? formatYmdShort(o.plannedFinish) : '—'}`
          ) : (
            <span className={hintClassName}>Not planned</span>
          ),
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
      <ProductionItemList
        progress={progress}
        orders={orders}
        onOpenOrder={setOpenOrderId}
        onNew={canManage ? openCreate : undefined}
        onProcess={
          canManage ? (item) => setProcessItemId(item.itemId) : undefined
        }
      />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClassName}>SPK Produksi</h2>
          {cancelledCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => setShowCancelled((v) => !v)}
            >
              {showCancelled
                ? 'Hide cancelled'
                : `Show ${cancelledCount} cancelled`}
            </Button>
          ) : null}
        </div>
        <ListTable
          empty={
            orders.length > 0
              ? 'No open SPK. Use New SPK on a labour line above.'
              : 'No SPK yet. Use New SPK on a labour line above.'
          }
          columns={orderColumns}
          rows={visibleOrders}
          rowKey={(o) => o.id}
          minWidthClassName="min-w-[760px]"
          onRowClick={(o) => setOpenOrderId(o.id)}
        />
      </section>

      <ProductionProcessDialog
        projectId={projectId}
        item={processItem}
        onOpenChange={(open) => {
          if (!open) setProcessItemId(null)
        }}
        onSaved={(next) => {
          setProgress(next)
          setProcessItemId(null)
          void load()
        }}
      />

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
            <AlertDialogTitle>
              New SPK · {create?.item.label} · {create?.stage.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {create
                ? `${stageLabel(create.stage)} · ${PRODUCTION_EXECUTOR_LABELS[create.stage.executor]}. ${create.stage.remainingToOrder} of ${
                    create.stage.role === 'install'
                      ? create.stage.sequence === 1
                        ? `${create.item.doneQty} fully made`
                        : 'the previous install step'
                      : create.item.makeQty
                  } still free on this labour.`
                : null}
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
