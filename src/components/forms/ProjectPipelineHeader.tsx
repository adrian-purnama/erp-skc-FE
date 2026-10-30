import { useCallback, useEffect, useState  } from 'react'
import type {ReactNode} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  FileSpreadsheet,
  LoaderCircle,
  Lock,
  Receipt,
  RefreshCw,
  Ruler,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type { ProjectRab, ProjectShopDrawingItem } from '#/lib/project'
import {
  buildPipelineInsight
  
  
  
} from '#/lib/projectPipeline'
import type {PipelineInsight, PipelineStage, PipelineTone} from '#/lib/projectPipeline';
import { formatRupiah  } from '#/lib/quotation'
import type {QuotationOverview} from '#/lib/quotation';
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  /** Bump to refetch (child panels changed something). */
  refreshKey: number
  active: PipelineStage
  onSelect: (stage: PipelineStage) => void
}

const TONE_BADGE: Record<PipelineTone, string> = {
  idle: 'bg-(--surface) text-(--muted) ring-(--line)',
  progress: 'bg-sky-50 text-sky-800 ring-sky-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  locked: 'bg-slate-100 text-slate-800 ring-slate-300',
}

export const TONE_BAR: Record<PipelineTone, string> = {
  idle: 'bg-(--line)',
  progress: 'bg-sky-500',
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  locked: 'bg-slate-500',
}

function ToneIcon({ tone }: { tone: PipelineTone }) {
  const cls = 'size-3 shrink-0'
  if (tone === 'ok') return <CheckCircle2 className={cls} aria-hidden />
  if (tone === 'warn') return <AlertTriangle className={cls} aria-hidden />
  if (tone === 'locked') return <Lock className={cls} aria-hidden />
  return <CircleDashed className={cls} aria-hidden />
}

export function Badge({
  tone,
  children,
}: {
  tone: PipelineTone
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset',
        TONE_BADGE[tone],
      )}
    >
      <ToneIcon tone={tone} />
      {children}
    </span>
  )
}

function formatDelta(n: number): string {
  if (n === 0) return 'no total change'
  const sign = n > 0 ? '+' : '−'
  return `${sign}${formatRupiah(String(Math.abs(n)))}`
}

/**
 * One-glance status of Shop Drawing BOQ → RAB → Quotation for a project:
 * where the process is, what changed, and what to do next.
 */
export default function ProjectPipelineHeader({
  projectId,
  refreshKey,
  active,
  onSelect,
}: Props) {
  const { can } = useAuth()
  const canQuote = can('quotation.view')
  const [insight, setInsight] = useState<PipelineInsight | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [itemsRes, rabRes, quoteRes] = await Promise.all([
        apiFetch<ProjectShopDrawingItem[]>(
          `/project/${projectId}/shop-drawing`,
        ),
        apiFetch<ProjectRab | null>(`/project/${projectId}/rab`),
        canQuote
          ? apiFetch<QuotationOverview>(`/quotation/project/${projectId}`)
          : Promise.resolve(null),
      ])
      if (!itemsRes.success || !itemsRes.data) {
        setError(itemsRes.message || 'Failed to load project status')
        return
      }
      setError(null)
      setInsight(
        buildPipelineInsight({
          items: itemsRes.data,
          rab: rabRes.success ? (rabRes.data ?? null) : null,
          quotation: quoteRes?.success ? quoteRes.data : null,
        }),
      )
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [projectId, canQuote])

  // Debounce bursts of child change notifications into one refetch.
  useEffect(() => {
    const handle = window.setTimeout(
      () => void load(),
      refreshKey === 0 ? 0 : 400,
    )
    return () => window.clearTimeout(handle)
  }, [load, refreshKey])

  if (!insight) {
    return (
      <div className="rounded-md border border-(--line) bg-white px-4 py-3 text-sm">
        {error ? (
          <span className="flex items-center gap-3">
            <span className="text-red-600">{error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </span>
        ) : (
          <span className={cn('flex items-center gap-2', hintClassName)}>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Loading pipeline…
          </span>
        )}
      </div>
    )
  }

  const { boq, rab, quotation: q, next } = insight
  const boqPct =
    boq.withFile > 0 ? Math.round((boq.withBoq / boq.withFile) * 100) : 0

  return (
    <section
      aria-label="BOQ, RAB and quotation status"
      className="rounded-md border border-(--line) bg-white"
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 border-b border-(--line) px-4 py-2.5',
          next.tone === 'warn' && 'bg-amber-50/60',
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-sm">
        {/* <span className={metaTextClassName}>
            Next
          </span> */}
          <button
            type="button"
            onClick={() => onSelect(next.stage)}
            className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline"
          >
            {next.text}
          </button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh status"
          title="Refresh status"
        >
          <RefreshCw
            className={cn('size-3.5', loading && 'animate-spin')}
            aria-hidden
          />
        </Button>
      </div>

      <ol
        className={cn(
          'grid gap-px bg-(--line)',
          q ? 'md:grid-cols-3' : 'md:grid-cols-2',
        )}
      >
        <Stage
          index={1}
          title="Shop Drawing BOQ"
          icon={<Ruler className="size-3.5" aria-hidden />}
          tone={boq.tone}
          badge={boq.label}
          active={active === 'boq'}
          onClick={() => onSelect('boq')}
          progress={boq.frozen ? null : { pct: boqPct, tone: boq.tone }}
        >
          <p className="tabular-nums">
            <span className="font-medium">
              {boq.withBoq}/{boq.withFile}
            </span>{' '}
            files with BOQ
            {boq.items > boq.withFile ? (
              <span className={hintClassName}>
                {' '}
                · {boq.items - boq.withFile} without file
              </span>
            ) : null}
          </p>
          {boq.missing > 0 ? (
            <p className="text-amber-800">{boq.missing} missing BOQ</p>
          ) : null}
          {boq.changeAdded + boq.changeRemoved > 0 ? (
            <p className={hintClassName}>
              In change: +{boq.changeAdded} / −{boq.changeRemoved} BOQ
            </p>
          ) : boq.frozen ? (
            <p className={hintClassName}>Open a RAB change to edit</p>
          ) : null}
        </Stage>

        <Stage
          index={2}
          title="RAB"
          icon={<FileSpreadsheet className="size-3.5" aria-hidden />}
          tone={rab.tone}
          badge={rab.label}
          active={active === 'rab'}
          onClick={() => onSelect('rab')}
          progress={
            rab.status === 'draft' && rab.lines > 0
              ? {
                  pct: Math.round(
                    ((rab.lines - rab.unpriced) / rab.lines) * 100,
                  ),
                  tone: rab.tone,
                }
              : null
          }
        >
          <p className="tabular-nums">
            <span className="font-medium">{formatRupiah(rab.grandTotal)}</span>
            <span className={hintClassName}> · {rab.lines} lines</span>
          </p>
          {rab.status === 'draft' && rab.unpriced > 0 ? (
            <p className="text-amber-800">{rab.unpriced} unpriced</p>
          ) : null}
          {rab.status === 'change' ? (
            <>
              <p className="truncate" title={rab.changeReason ?? undefined}>
                “{rab.changeReason}”
              </p>
              <p className={cn('tabular-nums', hintClassName)}>
                +{rab.changeAdded} ~{rab.changeChanged} −{rab.changeRemoved}{' '}
                lines
                {rab.changeDelta !== null
                  ? ` · ${formatDelta(rab.changeDelta)}`
                  : ''}
              </p>
            </>
          ) : null}
        </Stage>

        {q ? (
          <Stage
            index={3}
            title="Quotation"
            icon={<Receipt className="size-3.5" aria-hidden />}
            tone={q.tone}
            badge={q.label}
            active={active === 'quotation'}
            onClick={() => onSelect('quotation')}
            progress={null}
          >
            {q.latest ? (
              <p className="tabular-nums">
                <span className="font-medium">
                  {formatRupiah(q.latest.grandTotal)}
                </span>
                <span className={hintClassName}>
                  {' '}
                  · {q.revisions} revision{q.revisions === 1 ? '' : 's'}
                </span>
              </p>
            ) : (
              <p className={hintClassName}>
                {rab.status === 'locked'
                  ? 'Ready to create R1'
                  : 'Needs a locked RAB'}
              </p>
            )}
            {q.latest ? (
              <p className={hintClassName}>
                Based on RAB rev{' '}
                {(q.draft ?? q.latestIssued ?? q.latest).rabRevision}
              </p>
            ) : null}
            {q.outdated ? (
              <p className="text-amber-800">
                RAB is now rev {q.currentRabRevision}
              </p>
            ) : null}
          </Stage>
        ) : null}
      </ol>
    </section>
  )
}

function Stage({
  index,
  title,
  icon,
  tone,
  badge,
  active,
  onClick,
  progress,
  children,
}: {
  index: number
  title: string
  icon: ReactNode
  tone: PipelineTone
  badge: string
  active: boolean
  onClick: () => void
  progress: { pct: number; tone: PipelineTone } | null
  children: ReactNode
}) {
  return (
    <li className="min-w-0 bg-white">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        aria-current={active ? 'step' : undefined}
        className={cn(
          'group relative flex h-full w-full cursor-pointer flex-col gap-2 px-4 py-3 text-left text-xs transition-colors outline-none hover:bg-(--surface) focus-visible:ring-2 focus-visible:ring-(--ink)/30',
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
          <Badge tone={tone}>{badge}</Badge>
        </span>
        <div className="space-y-0.5">{children}</div>
        {progress ? (
          <span className="mt-auto block h-1 w-full overflow-hidden rounded-full bg-(--line)">
            <span
              className={cn(
                'block h-full rounded-full',
                TONE_BAR[progress.tone],
              )}
              style={{ width: `${progress.pct}%` }}
            />
          </span>
        ) : null}
        <ChevronRight
          className="absolute right-2 bottom-2 size-3.5 text-(--muted) opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
    </li>
  )
}
