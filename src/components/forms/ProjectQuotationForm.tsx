import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCostingWhen } from '#/components/forms/costingStatus'
import TenderProjectPicker from '#/components/forms/TenderProjectPicker'
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
import { Combobox } from '#/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import {
  QUOTATION_STATUS_LABELS,
  formatRupiah,
  type Quotation,
  type QuotationDiscountType,
  type QuotationHeaderPatch,
  type QuotationLine,
  type QuotationLinePatch,
  type QuotationOverview,
  type QuotationStatus,
} from '#/lib/quotation'
import {
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  inputClassNameCompact,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  onProjectIdChange?: (projectId: string | undefined) => void
  /** Inside the project dashboard: no page title, picker or back link. */
  embedded?: boolean
  /** Called whenever revisions or the open revision change. */
  onChanged?: () => void
}

type TermOfPaymentOption = {
  id: string
  termOfPayment: string
  isActive: boolean
}

type ExportFormat = 'xlsx' | 'pdf'

type HeaderForm = {
  subject: string
  termOfPaymentId: string
  validUntil: string
  markupPercent: string
  discountType: QuotationDiscountType
  discountValue: string
  taxPercent: string
  notes: string
}

const NO_TOP = '__none__'

function headerFromQuotation(q: Quotation): HeaderForm {
  return {
    subject: q.subject,
    termOfPaymentId: q.termOfPaymentId ?? NO_TOP,
    validUntil: q.validUntil ?? '',
    markupPercent: q.markupPercent,
    discountType: q.discountType,
    discountValue: q.discountValue,
    taxPercent: q.taxPercent,
    notes: q.notes,
  }
}

function headerPatch(form: HeaderForm, q: Quotation): QuotationHeaderPatch {
  const base = headerFromQuotation(q)
  const patch: QuotationHeaderPatch = {}
  if (form.subject !== base.subject) patch.subject = form.subject
  if (form.termOfPaymentId !== base.termOfPaymentId) {
    patch.termOfPaymentId =
      form.termOfPaymentId === NO_TOP ? null : form.termOfPaymentId
  }
  if (form.validUntil !== base.validUntil) {
    patch.validUntil = form.validUntil || null
  }
  if (form.markupPercent !== base.markupPercent) {
    patch.markupPercent = form.markupPercent
  }
  if (form.discountType !== base.discountType) {
    patch.discountType = form.discountType
  }
  if (form.discountValue !== base.discountValue) {
    patch.discountValue = form.discountValue
  }
  if (form.taxPercent !== base.taxPercent) patch.taxPercent = form.taxPercent
  if (form.notes !== base.notes) patch.notes = form.notes
  return patch
}

function statusChipClass(status: QuotationStatus): string {
  if (status === 'issued') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  }
  if (status === 'draft') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
  return 'border-(--line) text-(--muted)'
}

function StatusChip({ status }: { status: QuotationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        statusChipClass(status),
      )}
    >
      {QUOTATION_STATUS_LABELS[status]}
    </span>
  )
}

export default function ProjectQuotationForm({
  projectId,
  onProjectIdChange,
  embedded = false,
  onChanged,
}: Props) {
  const { can } = useAuth()
  const canManage = can('quotation.manage')

  const [overview, setOverview] = useState<QuotationOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [quotationLoading, setQuotationLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [terms, setTerms] = useState<TermOfPaymentOption[]>([])

  const loadOverview = useCallback(
    async (pid: string, preferId?: string | null) => {
      setLoading(true)
      setOverviewError(null)
      try {
        const response = await apiFetch<QuotationOverview>(
          `/quotation/project/${pid}`,
        )
        if (!response.success || !response.data) {
          setOverview(null)
          setOverviewError(response.message || 'Failed to load quotations')
          return
        }
        setOverview(response.data)
        const revisions = response.data.revisions
        const keep =
          preferId && revisions.some((r) => r.id === preferId)
            ? preferId
            : (revisions[0]?.id ?? null)
        setSelectedId(keep)
      } catch {
        setOverview(null)
        setOverviewError('Unable to reach the server')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    setOverview(null)
    setQuotation(null)
    setSelectedId(null)
    if (projectId) void loadOverview(projectId)
  }, [projectId, loadOverview])

  useEffect(() => {
    if (!selectedId) {
      setQuotation(null)
      return
    }
    let cancelled = false
    setQuotationLoading(true)
    void (async () => {
      try {
        const response = await apiFetch<Quotation>(`/quotation/${selectedId}`)
        if (cancelled) return
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to load quotation')
          setQuotation(null)
          return
        }
        setQuotation(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setQuotationLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  useEffect(() => {
    if (!can('termOfPayment.view')) return
    void (async () => {
      try {
        const response =
          await apiFetch<TermOfPaymentOption[]>('/term-of-payment')
        if (response.success && response.data) setTerms(response.data)
      } catch {
        /* optional list; picker just stays empty */
      }
    })()
  }, [can])

  /** Replace the open quotation and refresh its row in the revision list. */
  const applyQuotation = useCallback((next: Quotation) => {
    setQuotation(next)
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            revisions: prev.revisions.map((r) =>
              r.id === next.id
                ? {
                    ...r,
                    status: next.status,
                    grandTotal: next.grandTotal,
                    rabRevision: next.rabRevision,
                    issuedAt: next.issuedAt,
                    issuedBy: next.issuedBy,
                  }
                : r,
            ),
          }
        : prev,
    )
  }, [])

  const mutate = useCallback(
    async (
      path: string,
      init: RequestInit,
      success: string,
    ): Promise<Quotation | null> => {
      setBusy(true)
      try {
        const response = await apiFetch<Quotation>(path, init)
        if (!response.success || !response.data) {
          toast.error(response.message || 'Request failed')
          return null
        }
        applyQuotation(response.data)
        toast.success(success)
        return response.data
      } catch {
        toast.error('Unable to reach the server')
        return null
      } finally {
        setBusy(false)
      }
    },
    [applyQuotation],
  )

  async function createRevision() {
    if (!projectId) return
    setBusy(true)
    try {
      const response = await apiFetch<Quotation>(
        `/quotation/project/${projectId}`,
        { method: 'POST' },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to create revision')
        return
      }
      toast.success(`Draft ${response.data.quotationNumber} created`)
      await loadOverview(projectId, response.data.id)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function issue() {
    if (!quotation || !projectId) return
    const next = await mutate(
      `/quotation/${quotation.id}/issue`,
      { method: 'POST' },
      'Quotation issued',
    )
    setIssueOpen(false)
    if (next) await loadOverview(projectId, next.id)
  }

  async function discard() {
    if (!quotation || !projectId) return
    setBusy(true)
    try {
      const response = await apiFetch<null>(`/quotation/${quotation.id}`, {
        method: 'DELETE',
      })
      if (!response.success) {
        toast.error(response.message || 'Failed to discard draft')
        return
      }
      toast.success('Draft discarded')
      setDiscardOpen(false)
      await loadOverview(projectId)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  const [exportBusy, setExportBusy] = useState(false)

  async function exportFile(format: ExportFormat) {
    if (!quotation) return
    setExportBusy(true)
    try {
      await apiDownload(
        `/quotation/${quotation.id}/export?format=${format}`,
        `Quotation_R${quotation.revision}.${format}`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  useEffect(() => {
    if (overview) onChangedRef.current?.()
  }, [overview])

  const isDraft = quotation?.status === 'draft'
  const editable = canManage && isDraft
  const hasDraft =
    overview?.revisions.some((r) => r.status === 'draft') ?? false

  return (
    <div className="space-y-5">
      {embedded ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className={pageTitleClassName}>Quotation</h1>
            </div>
            {projectId ? (
              <Link
                to="/dashboard/projects/$projectId"
                params={{ projectId }}
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back to project
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={cn('text-sm', hintClassName)}>Project</span>
            <div className="min-w-[16rem] max-w-md flex-1">
              <TenderProjectPicker
                projectId={projectId ?? ''}
                onProjectIdChange={(next) =>
                  onProjectIdChange?.(next || undefined)
                }
                ariaLabel="Quotation project"
              />
            </div>
          </div>
        </>
      )}

      {!projectId ? (
        <p className={hintClassName}>
          Choose a project to view its quotations.
        </p>
      ) : loading && !overview ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : overviewError ? (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-red-600">{overviewError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadOverview(projectId)}
          >
            Retry
          </Button>
        </div>
      ) : overview ? (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Revisions</h2>
              {canManage && !hasDraft ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={busy || Boolean(overview.createBlockedReason)}
                  title={overview.createBlockedReason ?? undefined}
                  onClick={() => void createRevision()}
                >
                  <FilePlus2 className="size-3.5" aria-hidden />
                  {overview.revisions.length === 0 ? 'Create' : 'New revision'}
                </Button>
              ) : null}
            </div>
            <p className={cn('text-xs', hintClassName)}>
              RAB{' '}
              {overview.rabStatus === 'locked'
                ? `locked · rev ${overview.currentRabRevision}`
                : overview.rabStatus === 'draft'
                  ? 'draft'
                  : 'not started'}
              {overview.rabChangeDraftOpen ? ' · change open' : ''}
            </p>
            {overview.createBlockedReason && !hasDraft ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {overview.createBlockedReason}
              </p>
            ) : null}
            {overview.revisions.length === 0 ? (
              <p className={cn('text-sm', hintClassName)}>No quotation yet.</p>
            ) : (
              <ul className="space-y-1">
                {overview.revisions.map((rev) => (
                  <li key={rev.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(rev.id)}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        rev.id === selectedId
                          ? 'border-(--ink)/30 bg-(--surface)'
                          : 'border-transparent hover:border-(--line)',
                      )}
                      aria-current={rev.id === selectedId}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">R{rev.revision}</span>
                        <StatusChip status={rev.status} />
                      </span>
                      <span className={cn('block text-xs', hintClassName)}>
                        {formatRupiah(rev.grandTotal)}
                        {rev.issuedAt
                          ? ` · ${formatCostingWhen(rev.issuedAt)}`
                          : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="min-w-0">
            {quotationLoading && !quotation ? (
              <p
                className={cn('flex items-center gap-2 text-sm', hintClassName)}
              >
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Loading revision…
              </p>
            ) : quotation ? (
              <QuotationDetail
                key={quotation.id}
                quotation={quotation}
                editable={editable}
                busy={busy}
                exportBusy={exportBusy}
                terms={terms}
                onSaveHeader={(patch) =>
                  mutate(
                    `/quotation/${quotation.id}`,
                    { method: 'PATCH', body: JSON.stringify(patch) },
                    'Quotation saved',
                  )
                }
                onPatchLine={(line, patch) =>
                  mutate(
                    `/quotation/${quotation.id}/lines/${encodeURIComponent(line.key)}`,
                    { method: 'PATCH', body: JSON.stringify(patch) },
                    'Line updated',
                  )
                }
                onResync={() =>
                  void mutate(
                    `/quotation/${quotation.id}/resync`,
                    { method: 'POST' },
                    'Resynced from RAB',
                  )
                }
                onIssue={() => setIssueOpen(true)}
                onDiscard={() => setDiscardOpen(true)}
                onExport={(format) => void exportFile(format)}
              />
            ) : (
              <p className={cn('text-sm', hintClassName)}>
                {overview.revisions.length === 0
                  ? 'Lock the RAB, then create the first quotation revision.'
                  : 'Select a revision.'}
              </p>
            )}
          </section>
        </div>
      ) : null}

      <AlertDialog open={issueOpen} onOpenChange={setIssueOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Issue {quotation?.quotationNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The revision becomes read-only. Company, customer and contact
              details are captured as they are now. Any earlier issued revision
              is marked superseded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void issue()
              }}
            >
              Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard draft {quotation?.quotationNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The draft and its edits are deleted. Issued revisions are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                void discard()
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type DetailProps = {
  quotation: Quotation
  editable: boolean
  busy: boolean
  exportBusy: boolean
  terms: TermOfPaymentOption[]
  onSaveHeader: (patch: QuotationHeaderPatch) => Promise<Quotation | null>
  onPatchLine: (
    line: QuotationLine,
    patch: QuotationLinePatch,
  ) => Promise<Quotation | null>
  onResync: () => void
  onIssue: () => void
  onDiscard: () => void
  onExport: (format: ExportFormat) => void
}

function QuotationDetail({
  quotation: q,
  editable,
  busy,
  exportBusy,
  terms,
  onSaveHeader,
  onPatchLine,
  onResync,
  onIssue,
  onDiscard,
  onExport,
}: DetailProps) {
  const [form, setForm] = useState<HeaderForm>(() => headerFromQuotation(q))

  useEffect(() => {
    setForm(headerFromQuotation(q))
  }, [q])

  const patch = useMemo(() => headerPatch(form, q), [form, q])
  const dirty = Object.keys(patch).length > 0
  const issueBlocked = dirty
    ? 'Save your changes before issuing.'
    : q.rabOutdated
      ? 'Resync from RAB before issuing.'
      : !q.validUntil
        ? 'Set “Valid until” and save before issuing — the client link expires on that date.'
        : null

  const termOptions = useMemo(() => {
    const opts = terms
      .filter((t) => t.isActive || t.id === q.termOfPaymentId)
      .map((t) => ({ value: t.id, label: t.termOfPayment }))
    if (q.termOfPaymentId && !opts.some((o) => o.value === q.termOfPaymentId)) {
      opts.push({ value: q.termOfPaymentId, label: q.termOfPaymentText })
    }
    return [{ value: NO_TOP, label: '— None —' }, ...opts]
  }, [terms, q.termOfPaymentId, q.termOfPaymentText])

  const set = <K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const contactLine = Object.entries(q.contact.contact)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{q.quotationNumber}</h2>
            <StatusChip status={q.status} />
          </div>
          <p className={cn('text-xs', hintClassName)}>
            From RAB rev {q.rabRevision}
            {q.createdBy ? ` · created by ${q.createdBy.name}` : ''}
            {q.issuedAt && q.issuedBy
              ? ` · issued ${formatCostingWhen(q.issuedAt)} by ${q.issuedBy.name}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={exportBusy}
              >
                {exportBusy ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-3.5" aria-hidden />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('xlsx')}>
                Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {editable ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={onResync}
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Resync from RAB
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-red-600 hover:text-red-700"
                disabled={busy}
                onClick={onDiscard}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                disabled={busy || issueBlocked !== null}
                title={issueBlocked ?? undefined}
                onClick={onIssue}
              >
                <Send className="size-3.5" aria-hidden />
                Issue
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {editable && issueBlocked && !q.rabOutdated ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          {issueBlocked}
        </p>
      ) : null}

      {q.rabOutdated ? (
        <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          The RAB has a newer committed revision. Resync before issuing.
        </p>
      ) : null}

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-0.5">
          <p className={cn('text-xs', hintClassName)}>To</p>
          <p className="font-medium">{q.customer.name}</p>
          {q.customer.address ? (
            <p className="whitespace-pre-line">{q.customer.address}</p>
          ) : null}
          <p>
            Attn: {q.contact.gender === 'female' ? 'Ibu' : 'Bapak'}{' '}
            {q.contact.name}
          </p>
          {contactLine ? (
            <p className={cn('text-xs', hintClassName)}>{contactLine}</p>
          ) : null}
        </div>
        <div className="space-y-0.5">
          <p className={cn('text-xs', hintClassName)}>From</p>
          {q.company.name ? (
            <>
              <p className="font-medium">{q.company.name}</p>
              {q.company.address ? (
                <p className="whitespace-pre-line">{q.company.address}</p>
              ) : null}
              {q.company.npwp ? <p>NPWP {q.company.npwp}</p> : null}
              <p className={cn('text-xs', hintClassName)}>
                {q.company.hasLogo
                  ? q.status === 'draft'
                    ? 'Company profile logo will be printed'
                    : 'Company profile logo captured at issue'
                  : 'No company profile logo — upload one in Admin › Config'}
              </p>
            </>
          ) : (
            <p className="text-amber-700 dark:text-amber-300">
              Company name not set in Admin › Config.
            </p>
          )}
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (dirty) void onSaveHeader(patch)
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Subject</span>
            <input
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              className={cn(inputClassName, 'w-full')}
              disabled={!editable}
              placeholder="e.g. Penawaran harga signage"
            />
          </label>
          <div className="block space-y-1.5">
            <span className="text-sm font-medium">Term of payment</span>
            <Combobox
              value={form.termOfPaymentId}
              onValueChange={(v) => set('termOfPaymentId', v || NO_TOP)}
              options={termOptions}
              disabled={!editable}
              aria-label="Term of payment"
            />
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Valid until</span>
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
              className={cn(inputClassName, 'w-full')}
              disabled={!editable}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Markup %</span>
            <input
              inputMode="decimal"
              value={form.markupPercent}
              onChange={(e) => set('markupPercent', e.target.value)}
              className={cn(inputClassName, 'w-full')}
              disabled={!editable}
            />
            <span className={cn('block text-xs', hintClassName)}>
              Used on lines without a manual price.
            </span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">PPN %</span>
            <input
              inputMode="decimal"
              value={form.taxPercent}
              onChange={(e) => set('taxPercent', e.target.value)}
              className={cn(inputClassName, 'w-full')}
              disabled={!editable}
            />
          </label>
          <div className="block space-y-1.5">
            <span className="text-sm font-medium">Discount</span>
            <div className="flex gap-2">
              <Combobox
                value={form.discountType}
                onValueChange={(v) =>
                  set('discountType', v as QuotationDiscountType)
                }
                options={[
                  { value: 'percent', label: 'Percent' },
                  { value: 'amount', label: 'Amount' },
                ]}
                className="w-28"
                disabled={!editable}
                aria-label="Discount type"
              />
              <input
                inputMode="decimal"
                value={form.discountValue}
                onChange={(e) => set('discountValue', e.target.value)}
                className={cn(inputClassName, 'min-w-0 flex-1')}
                disabled={!editable}
                aria-label="Discount value"
              />
            </div>
          </div>
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              className={cn(inputClassName, 'min-h-24 w-full resize-y')}
              disabled={!editable}
              placeholder="Scope, exclusions, delivery terms…"
            />
          </label>
        </div>
        {editable ? (
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || !dirty}>
              Save
            </Button>
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setForm(headerFromQuotation(q))}
              >
                Reset
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Lines</h3>
        <div className="overflow-x-auto rounded-md border border-(--line)">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-(--surface) text-left text-xs">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">No</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="w-16 px-3 py-2 text-right font-medium">Qty</th>
                <th className="w-24 px-3 py-2 font-medium">Unit</th>
                <th className="w-32 px-3 py-2 text-right font-medium">
                  Cost / unit
                </th>
                <th className="w-40 px-3 py-2 text-right font-medium">
                  Price / unit
                </th>
                <th className="w-36 px-3 py-2 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((line, idx) => (
                <QuotationLineRow
                  key={line.key}
                  index={idx + 1}
                  line={line}
                  editable={editable}
                  busy={busy}
                  onPatch={(p) => onPatchLine(line, p)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className={cn('text-xs', hintClassName)}>
          Cost per unit is internal and is not printed on the export.
        </p>
      </div>

      <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt>Subtotal</dt>
        <dd className="text-right tabular-nums">
          {formatRupiah(q.totals.subtotal)}
        </dd>
        {Number(q.totals.discountAmount) > 0 ? (
          <>
            <dt>
              Discount
              {q.discountType === 'percent' ? ` ${q.discountValue}%` : ''}
            </dt>
            <dd className="text-right tabular-nums">
              −{formatRupiah(q.totals.discountAmount)}
            </dd>
            <dt>DPP</dt>
            <dd className="text-right tabular-nums">
              {formatRupiah(q.totals.taxBase)}
            </dd>
          </>
        ) : null}
        <dt>PPN {q.taxPercent}%</dt>
        <dd className="text-right tabular-nums">
          {formatRupiah(q.totals.taxAmount)}
        </dd>
        <dt className="border-t border-(--line) pt-1 font-medium">Total</dt>
        <dd className="border-t border-(--line) pt-1 text-right font-medium tabular-nums">
          {formatRupiah(q.totals.grandTotal)}
        </dd>
        <dt className={cn('pt-2 text-xs', hintClassName)}>RAB cost</dt>
        <dd
          className={cn('pt-2 text-right text-xs tabular-nums', hintClassName)}
        >
          {formatRupiah(q.totals.costTotal)}
        </dd>
        <dt className={cn('text-xs', hintClassName)}>Margin (before PPN)</dt>
        <dd
          className={cn(
            'text-right text-xs tabular-nums',
            Number(q.totals.margin) < 0 ? 'text-red-600' : hintClassName,
          )}
        >
          {formatRupiah(q.totals.margin)}
        </dd>
      </dl>
    </div>
  )
}

function QuotationLineRow({
  index,
  line,
  editable,
  busy,
  onPatch,
}: {
  index: number
  line: QuotationLine
  editable: boolean
  busy: boolean
  onPatch: (patch: QuotationLinePatch) => Promise<Quotation | null>
}) {
  const [description, setDescription] = useState(line.description)
  const [uom, setUom] = useState(line.uom)
  const [price, setPrice] = useState(line.unitPrice)

  useEffect(() => {
    setDescription(line.description)
    setUom(line.uom)
    setPrice(line.unitPrice)
  }, [line])

  const commit = (patch: QuotationLinePatch) => {
    void onPatch(patch).then((next) => {
      if (next) return
      setDescription(line.description)
      setUom(line.uom)
      setPrice(line.unitPrice)
    })
  }

  return (
    <tr className="border-t border-(--line) align-top">
      <td className="px-3 py-2 tabular-nums">{index}</td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              const v = description.trim()
              if (v && v !== line.description) commit({ description: v })
              else setDescription(line.description)
            }}
            className={cn(inputClassNameCompact, 'w-full')}
            disabled={busy}
            aria-label={`Line ${index} description`}
          />
        ) : (
          line.description
        )}
        {line.kind === 'labour' ? (
          <span className={cn('block text-xs', hintClassName)}>
            Sum of RAB labour lines
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            value={uom}
            onChange={(e) => setUom(e.target.value)}
            onBlur={() => {
              const v = uom.trim()
              if (v && v !== line.uom) commit({ uom: v })
              else setUom(line.uom)
            }}
            className={cn(inputClassNameCompact, 'w-full')}
            disabled={busy}
            aria-label={`Line ${index} unit`}
          />
        ) : (
          line.uom
        )}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', hintClassName)}>
        {formatRupiah(line.costUnitPrice)}
      </td>
      <td className="px-3 py-2 text-right">
        {editable ? (
          <div className="flex items-center justify-end gap-1">
            <input
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              onBlur={() => {
                if (price === line.unitPrice) return
                commit({ unitPrice: price === '' ? null : price })
              }}
              className={cn(
                inputClassNameCompact,
                'w-28 text-right tabular-nums',
              )}
              disabled={busy}
              aria-label={`Line ${index} unit price`}
            />
            {line.priceOverridden ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={busy}
                title="Reset to cost × markup"
                aria-label={`Reset line ${index} price`}
                onClick={() => commit({ unitPrice: null })}
              >
                <RotateCcw aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : (
          <span className="tabular-nums">{formatRupiah(line.unitPrice)}</span>
        )}
        {line.priceOverridden ? (
          <span className={cn('block text-xs', hintClassName)}>manual</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatRupiah(line.lineTotal)}
      </td>
    </tr>
  )
}
