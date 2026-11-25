import { useMemo, useState } from 'react'
import {
  CircleDot,
  Footprints,
  MoreHorizontal,
  Package,
  Plus,
  Settings2,
  TrendingUp,
} from 'lucide-react'
import ListTable, {
  ListChip,
  ListProgress,
} from '#/components/forms/shared/ListTable'
import type {
  ListChipTone,
  ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  PRODUCTION_ORDER_STATUS_LABELS,
  PRODUCTION_ORDER_TYPE_LABELS,
  PRODUCTION_ORDER_TYPE_TONES,
} from '#/lib/production'
import type {
  ProductionItemProgress,
  ProductionOrderStatus,
  ProductionOrderSummary,
  ProductionProjectProgress,
  ProductionStageProgress,
} from '#/lib/production'
import { hintClassName, sectionTitleClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const STATUS_TONE: Record<ProductionOrderStatus, ListChipTone> = {
  draft: 'warning',
  released: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'neutral',
}

function lineKey(o: ProductionOrderSummary): string {
  return `${o.shopDrawingItemId}:${o.labourItemId}:${o.labourUomId}`
}

function isDone(st: ProductionStageProgress, makeQty: string): boolean {
  return Number(makeQty) > 0 && Number(st.doneQty) >= Number(makeQty)
}

/** First stage (making, then install) not fully done. */
function currentStage(
  item: ProductionItemProgress,
): ProductionStageProgress | null {
  return item.stages.find((st) => !isDone(st, item.makeQty)) ?? null
}

/** Pcs a stage's SPKs may hold in all (install: what feeds it). */
function stageCapacity(st: ProductionStageProgress): string {
  return String(Number(st.orderedQty) + Number(st.remainingToOrder))
}

type Props = {
  progress: ProductionProjectProgress
  orders: ProductionOrderSummary[]
  onOpenOrder: (id: string) => void
  onNew?: (item: ProductionItemProgress, stage: ProductionStageProgress) => void
  onProcess?: (item: ProductionItemProgress) => void
}

/** Progress per item: current step, SPKs so far, and progress; click for stages. */
export default function ProductionItemList({
  progress,
  orders,
  onOpenOrder,
  onNew,
  onProcess,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  const liveOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled'),
    [orders],
  )
  const ordersByItem = useMemo(() => {
    const map = new Map<string, ProductionOrderSummary[]>()
    for (const o of liveOrders) {
      const list = map.get(o.shopDrawingItemId) ?? []
      list.push(o)
      map.set(o.shopDrawingItemId, list)
    }
    return map
  }, [liveOrders])

  const columns = useMemo<ListTableColumn<ProductionItemProgress>[]>(
    () => [
      {
        header: 'Item',
        icon: Package,
        cell: (item) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{item.label}</span>
            {item.makeType !== 'inhouse' ? (
              <ListChip dot tone={PRODUCTION_ORDER_TYPE_TONES[item.makeType]}>
                {PRODUCTION_ORDER_TYPE_LABELS[item.makeType]}
              </ListChip>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Current step',
        icon: Footprints,
        widthClassName: 'w-80',
        cell: (item) => <CurrentStepCell item={item} />,
      },
      {
        header: 'Progress',
        icon: TrendingUp,
        widthClassName: 'w-64',
        cell: (item) => <ProgressCell item={item} />,
      },
      ...(onNew || onProcess
        ? [
            {
              header: '',
              widthClassName: 'w-12',
              align: 'center' as const,
              cell: (item: ProductionItemProgress) => (
                <ItemActions
                  item={item}
                  onNew={onNew ? (st) => onNew(item, st) : undefined}
                  onProcess={onProcess ? () => onProcess(item) : undefined}
                />
              ),
            },
          ]
        : []),
    ],
    [ordersByItem, onNew, onProcess],
  )

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className={sectionTitleClassName}>Progress per item</h2>
          <p className={cn('tabular-nums', hintClassName)}>
            {progress.totals.doneQty} of {progress.totals.makeQty} units made ·{' '}
            {liveOrders.length} SPK
          </p>
        </div>
        <ListProgress percent={progress.totals.percent} className="w-48" />
      </div>
      <ListTable
        empty="No shop drawing items."
        columns={columns}
        rows={progress.items}
        rowKey={(item) => item.itemId}
        minWidthClassName="min-w-[760px]"
        onRowClick={(item) =>
          setOpenId((id) => (id === item.itemId ? null : item.itemId))
        }
        renderExpanded={(item) =>
          item.itemId === openId ? (
            <StageBreakdown
              item={item}
              orders={ordersByItem.get(item.itemId) ?? []}
              onOpenOrder={onOpenOrder}
              onNew={onNew ? (st) => onNew(item, st) : undefined}
            />
          ) : null
        }
      />
    </section>
  )
}

/** One bar for making; install progress as a line of text under it. */
function ProgressCell({ item }: { item: ProductionItemProgress }) {
  const hasInstall = item.stages.some((st) => st.role === 'install')
  return (
    <div className="min-w-0 space-y-0.5">
      <ListProgress
        percent={item.percent}
        tone={item.percent >= 100 ? 'success' : 'neutral'}
      />
      <p className={cn('text-sm tabular-nums', hintClassName)}>
        {item.doneQty}/{item.makeQty} made
        {hasInstall ? ` · ${item.installedQty}/${item.makeQty} installed` : ''}
      </p>
    </div>
  )
}

function CurrentStepCell({ item }: { item: ProductionItemProgress }) {
  if (!item.processReady) {
    return (
      <ListChip tone="warning" className="max-w-full">
        <span className="truncate">Set up process</span>
      </ListChip>
    )
  }
  const st = currentStage(item)
  if (!st) {
    return (
      <ListChip tone="success">
        {item.stages.some((s) => s.role === 'install') ? 'Installed' : 'Made'}
      </ListChip>
    )
  }
  const track = item.stages.filter((s) => s.role === st.role)
  const needsSpk = Number(st.orderedQty) === 0
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{st.name}</p>
      <p className={cn('text-sm tabular-nums', hintClassName)}>
        {st.role === 'install' ? 'Install' : 'Making'} {st.sequence} of{' '}
        {track.length}
        {' · '}
        {needsSpk ? (
          <span className="text-amber-700">needs an SPK</span>
        ) : (
          `${st.orderedQty}/${stageCapacity(st)} in SPK`
        )}
      </p>
    </div>
  )
}

function ItemActions({
  item,
  onNew,
  onProcess,
}: {
  item: ProductionItemProgress
  onNew?: (stage: ProductionStageProgress) => void
  onProcess?: () => void
}) {
  const orderable = item.processReady
    ? item.stages.filter((st) => Number(st.remainingToOrder) > 0)
    : []
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${item.label}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {onNew && orderable.length > 0 ? (
            <>
              <DropdownMenuLabel className="text-xs text-(--muted)">
                New SPK
              </DropdownMenuLabel>
              {orderable.map((st) => (
                <DropdownMenuItem key={st.key} onClick={() => onNew(st)}>
                  <Plus />
                  <span className="truncate">
                    {st.role === 'install' ? 'Install ' : ''}
                    {st.sequence}. {st.name}
                  </span>
                  <span className="ml-auto pl-3 text-xs text-(--muted) tabular-nums">
                    {st.remainingToOrder} free
                  </span>
                </DropdownMenuItem>
              ))}
              {onProcess ? <DropdownMenuSeparator /> : null}
            </>
          ) : null}
          {onProcess ? (
            <DropdownMenuItem onClick={onProcess}>
              <Settings2 />
              {item.processReady ? 'Edit process' : 'Set up process'}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Expanded row: every stage with its SPKs (click to open). */
function StageBreakdown({
  item,
  orders,
  onOpenOrder,
  onNew,
}: {
  item: ProductionItemProgress
  orders: ProductionOrderSummary[]
  onOpenOrder: (id: string) => void
  onNew?: (stage: ProductionStageProgress) => void
}) {
  const current = currentStage(item)?.key
  if (!item.processReady) {
    return (
      <p className="px-4 py-3 text-sm text-amber-700">{item.processDetail}</p>
    )
  }
  return (
    <div className="divide-y divide-(--line) bg-(--surface) pl-6">
      {item.stages.map((st) => {
        const spks = orders.filter((o) => lineKey(o) === st.key)
        const done = isDone(st, item.makeQty)
        const canOrder = onNew && Number(st.remainingToOrder) > 0
        return (
          <div
            key={st.key}
            className="grid grid-cols-[minmax(0,16rem)_8rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CircleDot
                className={cn(
                  'size-3.5 shrink-0',
                  done
                    ? 'text-emerald-600'
                    : st.key === current
                      ? 'text-sky-600'
                      : 'text-(--line)',
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate">{st.name}</p>
                <p className={cn('text-sm', hintClassName)}>
                  {st.role === 'install' ? 'Install' : 'Making'} {st.sequence} ·
                  weight {st.weightPercent ?? '—'}%
                  {st.executor === 'vendor' ? ' · Vendor' : ''}
                </p>
              </div>
            </div>
            <span className="tabular-nums">
              {st.doneQty}/{item.makeQty} done
            </span>
            <div className="flex min-w-0 flex-wrap gap-1">
              {spks.length === 0 ? (
                <span className={cn('text-xs', hintClassName)}>No SPK</span>
              ) : (
                spks.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onOpenOrder(o.id)}
                    className="rounded-md hover:opacity-80"
                  >
                    <ListChip tone={STATUS_TONE[o.status]}>
                      {o.number} · {o.qty} pcs ·{' '}
                      {PRODUCTION_ORDER_STATUS_LABELS[o.status]}
                    </ListChip>
                  </button>
                ))
              )}
            </div>
            <div>
              {canOrder ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => onNew(st)}
                >
                  <Plus className="size-3" aria-hidden />
                  SPK
                </Button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
