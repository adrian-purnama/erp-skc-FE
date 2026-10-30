import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ClipboardList,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
} from 'lucide-react'
import {
  Badge as PipelineBadge,
  TONE_BAR,
} from '#/components/forms/ProjectPipelineHeader'
import { Button } from '#/components/ui/button'
import { apiFetch } from '#/lib/api'
import type { PipelineTone } from '#/lib/projectPipeline'
import { buildPurchaseFlowInsight } from '#/lib/purchaseFlow'
import type {
  FlowStageInsight,
  PurchaseFlow,
  PurchaseFlowKind,
} from '#/lib/purchaseFlow'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  kind: PurchaseFlowKind
  id: string
  /** Bump to refetch after the page changed something. */
  refreshKey?: number
}

const MAX_LINKS = 3

/** A document link in a stage; the page's own document is bold and not a link. */
function DocLink({
  current,
  children,
  to,
}: {
  current: boolean
  children: ReactNode
  to: ReactNode
}) {
  if (current) return <span className="font-medium">{children} (this)</span>
  return <>{to}</>
}

const linkClass =
  'text-sky-700 underline-offset-4 hover:underline dark:text-sky-300'

/**
 * Where a purchase stands: SPP → PO → receipts, showing only the documents
 * linked to this one, with what to do next. Payments live on Finance.
 * Hidden when the viewer may not see the chain.
 */
export default function PurchaseFlowHeader({
  kind,
  id,
  refreshKey = 0,
}: Props) {
  const [flow, setFlow] = useState<PurchaseFlow | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<PurchaseFlow>(
        `/purchasing/flow?kind=${kind}&id=${encodeURIComponent(id)}`,
      )
      setFlow(response.success ? response.data : null)
    } catch {
      setFlow(null)
    } finally {
      setLoading(false)
    }
  }, [kind, id])

  useEffect(() => {
    const handle = window.setTimeout(
      () => void load(),
      refreshKey === 0 ? 0 : 300,
    )
    return () => window.clearTimeout(handle)
  }, [load, refreshKey])

  if (!flow) return null
  const insight = buildPurchaseFlowInsight(flow)
  const is = (k: PurchaseFlowKind, docId: string) =>
    flow.focus.kind === k && flow.focus.id === docId
  const more = (n: number) =>
    n > MAX_LINKS ? (
      <p className={hintClassName}>+{n - MAX_LINKS} more</p>
    ) : null

  return (
    <section
      aria-label="Purchase flow"
      className="rounded-md border border-(--line) bg-(--background)"
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b border-(--line) px-4 py-2',
          insight.next.tone === 'warn' && 'bg-amber-500/10',
        )}
      >
        <p className="min-w-0 text-sm font-medium">{insight.next.text}</p>
        <div className="flex items-center gap-2 text-xs">
          {flow.spks.map((s) => (
            <Link
              key={s.id}
              to="/dashboard/production"
              search={{ spk: s.id }}
              className={linkClass}
            >
              {s.number}
              {s.type !== 'inhouse' ? ` (${s.type})` : ''}
            </Link>
          ))}
          {flow.purchaseRabs.map((r) => (
            <Link
              key={r.id}
              to="/dashboard/purchasing/rabs/$rabId"
              params={{ rabId: r.id }}
              className={linkClass}
            >
              {r.number}
            </Link>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Refresh flow"
            title="Refresh flow"
          >
            <RefreshCw
              className={cn('size-3.5', loading && 'animate-spin')}
              aria-hidden
            />
          </Button>
        </div>
      </div>
      <ol className="grid gap-px bg-(--line) sm:grid-cols-3">
        <FlowStage
          index={1}
          title="Request"
          icon={<ClipboardList className="size-3.5" aria-hidden />}
          insight={insight.request}
          active={flow.focus.kind === 'request'}
        >
          {flow.requests.slice(0, MAX_LINKS).map((r) => (
            <p key={r.id} className="truncate tabular-nums">
              <DocLink
                current={is('request', r.id)}
                to={
                  <Link
                    to="/dashboard/purchasing/requests/$requestId"
                    params={{ requestId: r.id }}
                    className={linkClass}
                  >
                    {r.number}
                  </Link>
                }
              >
                {r.number}
              </DocLink>
            </p>
          ))}
          {more(flow.requests.length)}
        </FlowStage>
        <FlowStage
          index={2}
          title="Order"
          icon={<ShoppingCart className="size-3.5" aria-hidden />}
          insight={insight.order}
          active={flow.focus.kind === 'order'}
        >
          {flow.orders.slice(0, MAX_LINKS).map((o) => (
            <p
              key={o.id}
              className="truncate tabular-nums"
              title={o.vendorName}
            >
              <DocLink
                current={is('order', o.id)}
                to={
                  <Link
                    to="/dashboard/purchasing/orders/$orderId"
                    params={{ orderId: o.id }}
                    className={linkClass}
                  >
                    {o.number}
                  </Link>
                }
              >
                {o.number}
              </DocLink>
              <span className={hintClassName}>
                {' '}
                · {o.vendorFee ? 'vendor fee' : o.vendorName}
              </span>
            </p>
          ))}
          {more(flow.orders.length)}
        </FlowStage>
        <FlowStage
          index={3}
          title="Receive"
          icon={<PackageCheck className="size-3.5" aria-hidden />}
          insight={insight.receive}
          active={flow.focus.kind === 'realization'}
        >
          {flow.realizations.slice(0, MAX_LINKS).map((r) => (
            <p
              key={r.id}
              className={cn(
                'truncate tabular-nums',
                r.status === 'draft' && 'italic',
              )}
            >
              <DocLink
                current={is('realization', r.id)}
                to={
                  <Link
                    to="/dashboard/purchasing/realizations/$realizationId"
                    params={{ realizationId: r.id }}
                    className={linkClass}
                  >
                    {r.number}
                  </Link>
                }
              >
                {r.number}
              </DocLink>
              <span className={hintClassName}>
                {' '}
                ·{' '}
                {r.status === 'draft'
                  ? 'draft'
                  : r.method === 'staff'
                    ? 'staff bought'
                    : r.deliveredTo === 'vendor'
                      ? 'to vendor'
                      : 'arrived'}
              </span>
            </p>
          ))}
          {more(flow.realizations.length)}
        </FlowStage>
      </ol>
    </section>
  )
}

function FlowStage({
  index,
  title,
  icon,
  insight,
  active,
  children,
}: {
  index: number
  title: string
  icon: ReactNode
  insight: FlowStageInsight
  active: boolean
  children: ReactNode
}) {
  return (
    <li
      className={cn(
        'relative flex min-w-0 flex-col gap-1.5 bg-(--background) px-4 py-3 text-xs',
        active && 'bg-(--surface)',
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5',
          active ? 'bg-(--ink)' : 'bg-transparent',
        )}
        aria-hidden
      />
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-(--line) text-[10px] tabular-nums">
            {index}
          </span>
          {icon}
          <span className="truncate">{title}</span>
        </span>
        <PipelineBadge tone={insight.tone as PipelineTone}>
          {insight.label}
        </PipelineBadge>
      </span>
      <p className={cn('tabular-nums', hintClassName)}>{insight.detail}</p>
      <div className="space-y-0.5">{children}</div>
      {insight.pct !== null ? (
        <span className="mt-auto block h-1 w-full overflow-hidden rounded-full bg-(--line)">
          <span
            className={cn('block h-full rounded-full', TONE_BAR[insight.tone])}
            style={{ width: `${insight.pct}%` }}
          />
        </span>
      ) : null}
    </li>
  )
}
