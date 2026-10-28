import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FilePlus2,
  LoaderCircle,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Send,
  Trash2,
  Trophy,
  Plus,
  Undo2,
  X,
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
import { RupiahInput } from '#/components/ui/rupiah-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import { jakartaDateKey } from '#/lib/jakartaDate'
import {
  QUOTATION_STATUS_LABELS,
  formatRupiah,
  quotationPrintRows,
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

/** Quick-add notes; each becomes one printed line. */
const NOTE_TEMPLATES = ['Penawaran harga tidak termasuk PPh (1.75%)']

/** Notes are stored one per line; blank items are dropped on save. */
function notesToList(notes: string): string[] {
  return notes === '' ? [] : notes.split(/\r?\n/)
}

function cleanNotes(notes: string): string {
  return notesToList(notes)
    .map((n) => n.trim())
    .filter(Boolean)
    .join('\n')
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
  const notes = cleanNotes(form.notes)
  if (notes !== cleanNotes(base.notes)) patch.notes = notes
  return patch
}

function statusChipClass(status: QuotationStatus): string {
  if (status === 'won') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
  }
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
  const { can, user, refreshAuth } = useAuth()
  const canManage = can('quotation.manage')

  const [overview, setOverview] = useState<QuotationOverview | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [quotationLoading, setQuotationLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [fullNameOpen, setFullNameOpen] = useState(false)
  const [fullNameDraft, setFullNameDraft] = useState('')
  const [fullNameSaving, setFullNameSaving] = useState(false)
  /** Which confirm dialog to open once the full name is saved. */
  const [afterFullName, setAfterFullName] = useState<'issue' | 'reissue'>(
    'issue',
  )
  const [reissueOpen, setReissueOpen] = useState(false)
  const [reissueValidUntil, setReissueValidUntil] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const [wonOpen, setWonOpen] = useState(false)
  const [undoWonOpen, setUndoWonOpen] = useState(false)
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

  function askFullName(next: 'issue' | 'reissue') {
    setAfterFullName(next)
    setFullNameDraft(user?.fullName ?? '')
    setFullNameOpen(true)
  }

  function openConfirm(kind: 'issue' | 'reissue') {
    if (kind === 'issue') {
      setIssueOpen(true)
      return
    }
    // Keep the old date if still valid, else a fresh 30 days.
    const today = jakartaDateKey(new Date())
    const current = quotation?.validUntil ?? ''
    setReissueValidUntil(
      current >= today
        ? current
        : jakartaDateKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    )
    setReissueOpen(true)
  }

  /** Issuing prints the issuer's full name under "Hormat kami". */
  function requestIssue(kind: 'issue' | 'reissue') {
    if (!user?.fullName.trim()) {
      askFullName(kind)
      return
    }
    openConfirm(kind)
  }

  async function saveFullName() {
    const fullName = fullNameDraft.trim()
    if (!fullName) return
    setFullNameSaving(true)
    try {
      const res = await apiFetch<{ fullName: string }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName }),
      })
      if (!res.success) {
        toast.error(res.message || 'Failed to save full name')
        return
      }
      await refreshAuth()
      setFullNameOpen(false)
      openConfirm(afterFullName)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setFullNameSaving(false)
    }
  }

  async function issue(kind: 'issue' | 'reissue') {
    if (!quotation || !projectId) return
    const close = kind === 'issue' ? setIssueOpen : setReissueOpen
    setBusy(true)
    try {
      const response = await apiFetch<Quotation | { code: string } | null>(
        `/quotation/${quotation.id}/${kind}`,
        kind === 'issue'
          ? { method: 'POST' }
          : {
              method: 'POST',
              body: JSON.stringify({ validUntil: reissueValidUntil }),
            },
      )
      const data = response.data
      if (!response.success || !data || !('id' in data)) {
        if (data && 'code' in data && data.code === 'FULL_NAME_REQUIRED') {
          close(false)
          askFullName(kind)
          return
        }
        toast.error(response.message || `Failed to ${kind} quotation`)
        return
      }
      applyQuotation(data)
      toast.success(
        kind === 'issue' ? 'Quotation issued' : 'Quotation re-issued',
      )
      close(false)
      await loadOverview(projectId, data.id)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function setWon(won: boolean) {
    if (!quotation || !projectId) return
    setBusy(true)
    try {
      const response = await apiFetch<Quotation>(
        `/quotation/${quotation.id}/won`,
        { method: won ? 'POST' : 'DELETE' },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update quotation')
        return
      }
      applyQuotation(response.data)
      toast.success(won ? 'Quotation marked as won' : 'Quotation set back to issued')
      setWonOpen(false)
      setUndoWonOpen(false)
      await loadOverview(projectId, response.data.id)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
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
  const hasWon = overview?.revisions.some((r) => r.status === 'won') ?? false

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
                onIssue={() => requestIssue('issue')}
                onReissue={
                  canManage && !hasWon
                    ? () => requestIssue('reissue')
                    : undefined
                }
                onMarkWon={
                  canManage && !hasWon ? () => setWonOpen(true) : undefined
                }
                onUndoWon={canManage ? () => setUndoWonOpen(true) : undefined}
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
                void issue('issue')
              }}
            >
              Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={fullNameOpen}
        onOpenChange={(next) => {
          if (!fullNameSaving) setFullNameOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Full name required</AlertDialogTitle>
            <AlertDialogDescription>
              Full name is required to issue. It is printed under “Hormat kami”
              on the quotation. This can be changed later in your profile on the
              top right.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Full name</span>
            <input
              type="text"
              value={fullNameDraft}
              autoFocus
              maxLength={120}
              disabled={fullNameSaving}
              className={cn(inputClassName, 'w-full')}
              onChange={(e) => setFullNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void saveFullName()
                }
              }}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={fullNameSaving}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={fullNameSaving || !fullNameDraft.trim()}
              onClick={(e) => {
                e.preventDefault()
                void saveFullName()
              }}
            >
              {fullNameSaving ? 'Saving…' : 'Save & continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={reissueOpen}
        onOpenChange={(next) => {
          if (!busy) setReissueOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Re-issue {quotation?.quotationNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This revision becomes the issued one again and the current issued
              revision is marked superseded. Its lines, prices and client link
              (QR) stay the same; the issue date and signer are updated to today
              and you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {quotation &&
          overview &&
          quotation.rabRevision !== overview.currentRabRevision ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Priced from RAB rev {quotation.rabRevision}; the RAB is now at rev{' '}
              {overview.currentRabRevision}.
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Valid until</span>
            <input
              type="date"
              value={reissueValidUntil}
              min={jakartaDateKey(new Date())}
              onChange={(e) => setReissueValidUntil(e.target.value)}
              className={cn(inputClassName, 'w-full')}
              disabled={busy}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !reissueValidUntil}
              onClick={(e) => {
                e.preventDefault()
                void issue('reissue')
              }}
            >
              Re-issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={wonOpen}
        onOpenChange={(next) => {
          if (!busy) setWonOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark {quotation?.quotationNumber} as won?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The client accepted this revision. Quotations for this project
              are locked and the project status becomes Win.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void setWon(true)
              }}
            >
              Mark as won
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={undoWonOpen}
        onOpenChange={(next) => {
          if (!busy) setUndoWonOpen(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Undo won on {quotation?.quotationNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The revision goes back to issued and quotations unlock. Not
              possible once the project is released to production.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void setWon(false)
              }}
            >
              Undo won
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
  /** Set when the user may bring a superseded revision back. */
  onReissue?: () => void
  /** Set when the user may mark the issued revision as won. */
  onMarkWon?: () => void
  /** Set when the user may undo a won revision. */
  onUndoWon?: () => void
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
  onReissue,
  onMarkWon,
  onUndoWon,
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
          {q.status === 'issued' && onMarkWon ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              disabled={busy}
              onClick={onMarkWon}
            >
              <Trophy className="size-3.5" aria-hidden />
              Mark as won
            </Button>
          ) : null}
          {q.status === 'won' && onUndoWon ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={busy}
              onClick={onUndoWon}
            >
              <Undo2 className="size-3.5" aria-hidden />
              Undo won
            </Button>
          ) : null}
          {q.status === 'superseded' && onReissue ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              disabled={busy}
              onClick={onReissue}
            >
              <Repeat2 className="size-3.5" aria-hidden />
              Re-issue
            </Button>
          ) : null}
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
          <NotesListField
            notes={form.notes}
            editable={editable}
            onChange={(next) => set('notes', next)}
          />
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
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-(--surface) text-left text-xs">
              <tr>
                <th className="w-10 px-3 py-2 font-medium">No</th>
                <th className="w-20 px-3 py-2 font-medium">Kode</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="w-36 px-3 py-2 font-medium">Ukuran</th>
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
              {quotationPrintRows(q.lines, q.sections).map((row) =>
                row.type === 'line' ? (
                  <QuotationLineRow
                    key={row.line.key}
                    index={row.no}
                    line={row.line}
                    editable={editable}
                    busy={busy}
                    onPatch={(p) => onPatchLine(row.line, p)}
                  />
                ) : row.type === 'section' ? (
                  <tr
                    key={`section:${row.title}`}
                    className="border-t border-(--line) bg-(--surface)"
                  >
                    <th
                      colSpan={9}
                      scope="colgroup"
                      className="px-3 py-1.5 text-center text-xs font-semibold tracking-wide"
                    >
                      {row.title}
                    </th>
                  </tr>
                ) : (
                  <tr
                    key={`subtotal:${row.label}`}
                    className="border-t border-(--line) bg-(--surface) text-xs font-semibold"
                  >
                    <td colSpan={8} className="px-3 py-1.5 text-right">
                      {row.label}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatRupiah(row.amount)}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-6 md:flex-row md:items-start md:justify-between">
        <MarginInsight quotation={q} />
        <dl className="grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 self-end text-sm md:self-start">
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
        </dl>
      </div>
    </div>
  )
}

/** Below this margin (% of selling price) the deal is flagged as thin. */
const THIN_MARGIN_PERCENT = 10

function marginTone(percent: number) {
  if (percent < 0) {
    return { text: 'text-red-600 dark:text-red-400', bar: 'bg-red-500' }
  }
  if (percent < THIN_MARGIN_PERCENT) {
    return { text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500' }
  }
  return {
    text: 'text-emerald-700 dark:text-emerald-400',
    bar: 'bg-emerald-500',
  }
}

function formatPercent(n: number): string {
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
}

/** Cost vs selling price (before PPN): one bar, cost grey + margin coloured. */
function MarginBar({
  cost,
  sell,
  className,
}: {
  cost: number
  sell: number
  className?: string
}) {
  const margin = sell - cost
  const whole = Math.max(cost, sell, 1)
  const tone = marginTone(sell > 0 ? (margin / sell) * 100 : -100)
  // Profit: cost + margin = sell. Loss: sell + loss = cost (loss shown red).
  const base = (Math.min(cost, sell) / whole) * 100
  const rest = (Math.abs(margin) / whole) * 100
  return (
    <div
      className={cn(
        'flex h-2.5 w-full overflow-hidden rounded-full bg-(--line)',
        className,
      )}
      aria-hidden
    >
      <div className="h-full bg-(--muted)/50" style={{ width: `${base}%` }} />
      <div className={cn('h-full', tone.bar)} style={{ width: `${rest}%` }} />
    </div>
  )
}

/** Internal only: how much of the price is RAB cost vs margin (never printed). */
function MarginInsight({ quotation: q }: { quotation: Quotation }) {
  const cost = Number(q.totals.costTotal)
  const sell = Number(q.totals.taxBase)
  const margin = Number(q.totals.margin)
  const marginPercent = sell > 0 ? (margin / sell) * 100 : 0
  const markupPercent = cost > 0 ? (margin / cost) * 100 : 0
  const tone = marginTone(marginPercent)

  const sections = q.sections.map((section) => {
    let sCost = 0
    let sSell = 0
    for (const idx of section.lineIndexes) {
      const line = q.lines[idx]!
      sCost += Number(line.qty) * Number(line.costUnitPrice)
      sSell += Number(line.lineTotal)
    }
    return {
      title: section.title,
      cost: sCost,
      sell: sSell,
      percent: sSell > 0 ? ((sSell - sCost) / sSell) * 100 : 0,
    }
  })

  return (
    <section
      className="w-full max-w-md space-y-3 rounded-md border border-(--line) p-4 text-sm"
      aria-label="Margin insight"
    >
      <div>
        <p className={cn('text-xs', hintClassName)}>
          {margin < 0 ? 'Loss' : 'Margin'} (before PPN) · internal
        </p>
        <p className={cn('text-2xl font-semibold tabular-nums', tone.text)}>
          {formatPercent(marginPercent)}
        </p>
      </div>

      <MarginBar cost={cost} sell={sell} />

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className={hintClassName}>RAB cost</dt>
          <dd className="tabular-nums">{formatRupiah(q.totals.costTotal)}</dd>
        </div>
        <div>
          <dt className={hintClassName}>{margin < 0 ? 'Loss' : 'Margin'}</dt>
          <dd className={cn('tabular-nums', tone.text)}>
            {formatRupiah(q.totals.margin)}
          </dd>
        </div>
        <div>
          <dt className={hintClassName}>Markup on cost</dt>
          <dd className="tabular-nums">{formatPercent(markupPercent)}</dd>
        </div>
      </dl>

      {sections.length > 1 ? (
        <div className="space-y-2 border-t border-(--line) pt-3">
          <p className={cn('text-xs', hintClassName)}>
            Per category (before discount)
          </p>
          {sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{s.title}</span>
                <span
                  className={cn('tabular-nums', marginTone(s.percent).text)}
                >
                  {formatPercent(s.percent)}
                </span>
              </div>
              <MarginBar cost={s.cost} sell={s.sell} className="h-1.5" />
            </div>
          ))}
        </div>
      ) : null}
    </section>
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
      <td className="px-3 py-2 font-medium whitespace-nowrap">
        {line.code || <span className={hintClassName}>—</span>}
      </td>
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
          <span className="font-medium">{line.description}</span>
        )}
        {line.descriptions.length > 0 ? (
          <ul className={cn('mt-1 space-y-0.5 text-xs', hintClassName)}>
            {line.descriptions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap tabular-nums">
        {line.dimension || <span className={hintClassName}>—</span>}
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
            <RupiahInput
              value={price}
              onValueChange={setPrice}
              onBlur={() => {
                if (price === line.unitPrice) return
                commit({ unitPrice: price === '' ? null : price })
              }}
              wrapperClassName="w-40"
              className="h-8 text-right"
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

function NotesListField({
  notes,
  editable,
  onChange,
}: {
  notes: string
  editable: boolean
  onChange: (notes: string) => void
}) {
  const items = notesToList(notes)
  const update = (next: string[]) => onChange(next.join('\n'))
  const present = new Set(items.map((n) => n.trim()))

  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="text-sm font-medium">Notes</span>
      {items.length === 0 && !editable ? (
        <p className={cn('text-sm', hintClassName)}>No notes.</p>
      ) : null}
      <ol className="space-y-1.5">
        {items.map((note, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-sm tabular-nums text-(--muted)">
              {i + 1}.
            </span>
            {editable ? (
              <>
                <input
                  value={note}
                  autoFocus={note === '' && i === items.length - 1}
                  onChange={(e) =>
                    update(items.map((n, j) => (j === i ? e.target.value : n)))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      update([...items, ''])
                    }
                  }}
                  placeholder="Scope, exclusions, delivery terms…"
                  className={cn(inputClassName, 'min-w-0 flex-1')}
                  aria-label={`Note ${i + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove note ${i + 1}`}
                  onClick={() => update(items.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              </>
            ) : (
              <span className="text-sm">{note}</span>
            )}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => update([...items, ''])}
          >
            <Plus className="size-3.5" aria-hidden />
            Add note
          </Button>
          {NOTE_TEMPLATES.filter((t) => !present.has(t)).map((t) => (
            <Button
              key={t}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-(--muted)"
              title="Quick add"
              onClick={() =>
                update([...items.filter((n) => n.trim() !== ''), t])
              }
            >
              <Plus className="size-3" aria-hidden />
              {t}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
