import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle, X } from 'lucide-react'
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
import { Checkbox } from '#/components/ui/checkbox'
import { ListSearchInput } from '#/components/forms/shared/ListTable'
import { apiFetch } from '#/lib/api'
import type { ProjectListItem } from '#/lib/project'
import {
  SHRINK_SECTION_LABELS,
  SHRINK_STEP_LABELS,
  type ShrinkDbStatus,
  type ShrinkOrphanReport,
  type ShrinkSection,
} from '#/lib/shrinkDb'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { cardClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const POLL_MS = 1500
const PROJECT_SEARCH_MIN = 2

type ExcludedProject = {
  id: string
  name: string
  projectNumber: string
}

export default function ShrinkDbForm() {
  const [status, setStatus] = useState<ShrinkDbStatus | null>(null)
  const [excludedById, setExcludedById] = useState<
    Record<string, ExcludedProject>
  >({})
  const [projectQuery, setProjectQuery] = useState('')
  const debouncedProjectQuery = useDebouncedValue(projectQuery, 250)
  const [projectHits, setProjectHits] = useState<ProjectListItem[]>([])
  const [searchingProjects, setSearchingProjects] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [confirmSection, setConfirmSection] = useState<ShrinkSection | null>(
    null,
  )
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [orphans, setOrphans] = useState<ShrinkOrphanReport | null>(null)
  const [busy, setBusy] = useState(false)

  const running = status?.status === 'running'
  const excludedList = useMemo(
    () => Object.values(excludedById),
    [excludedById],
  )
  const excludedIds = useMemo(
    () => excludedList.map((p) => p.id),
    [excludedList],
  )
  const searchQ = debouncedProjectQuery.trim()

  async function refreshStatus() {
    const res = await apiFetch<ShrinkDbStatus>('/admin/shrink-db/status')
    if (!res.success || !res.data) {
      throw new Error(res.message || 'Failed to load status')
    }
    setStatus(res.data)
    return res.data
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const st = await apiFetch<ShrinkDbStatus>('/admin/shrink-db/status')
        if (cancelled) return
        if (st.success && st.data) setStatus(st.data)
        else toast.error(st.message || 'Failed to load status')
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoadingStatus(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      void refreshStatus().catch(() => {
        /* keep polling */
      })
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => {
    if (searchQ.length < PROJECT_SEARCH_MIN) {
      setProjectHits([])
      setSearchingProjects(false)
      return
    }

    let cancelled = false
    setSearchingProjects(true)
    void (async () => {
      try {
        const params = new URLSearchParams({ q: searchQ })
        const res = await apiFetch<ProjectListItem[]>(
          `/project?${params.toString()}`,
        )
        if (cancelled) return
        if (!res.success || !res.data) {
          toast.error(res.message || 'Failed to search projects')
          setProjectHits([])
          return
        }
        setProjectHits(res.data)
      } catch {
        if (!cancelled) {
          toast.error('Unable to reach the server')
          setProjectHits([])
        }
      } finally {
        if (!cancelled) setSearchingProjects(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchQ])

  function setExcluded(project: ExcludedProject, checked: boolean) {
    setExcludedById((prev) => {
      if (!checked) {
        if (!(project.id in prev)) return prev
        const next = { ...prev }
        delete next[project.id]
        return next
      }
      return { ...prev, [project.id]: project }
    })
  }

  async function startShrink(section: ShrinkSection) {
    setBusy(true)
    try {
      const res = await apiFetch<{ jobId: string }>('/admin/shrink-db', {
        method: 'POST',
        body: JSON.stringify({
          section,
          excludedProjectIds:
            section === 'documents' ? excludedIds : [],
        }),
      })
      if (!res.success) {
        toast.error(res.message || 'Failed to start Shrink DB')
        return
      }
      toast.success(`${SHRINK_SECTION_LABELS[section]} started`)
      await refreshStatus()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
      setConfirmSection(null)
    }
  }

  async function runOrphanCheck() {
    setBusy(true)
    try {
      const res = await apiFetch<ShrinkOrphanReport>('/admin/shrink-db/orphans', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Orphan check failed')
        return
      }
      setOrphans(res.data)
      toast.success('Orphan check complete')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function purgeOrphans() {
    if (!orphans?.unmatchedBlobIds.length) return
    setBusy(true)
    try {
      const res = await apiFetch<{ deleted: number; skipped: number }>(
        '/admin/shrink-db/orphans/purge',
        {
          method: 'POST',
          body: JSON.stringify({ gridFsIds: orphans.unmatchedBlobIds }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Purge failed')
        return
      }
      toast.success(`Deleted ${res.data.deleted} orphan blob(s)`)
      setOrphans((prev) =>
        prev
          ? {
              ...prev,
              unmatchedBlobIds: [],
              shrinkBlobsPurged: prev.shrinkBlobsPurged,
            }
          : prev,
      )
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
      setPurgeOpen(false)
    }
  }

  if (loadingStatus) {
    return (
      <div className={`flex items-center gap-2 py-4 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading Shrink DB status…
      </div>
    )
  }

  const result = status?.result
  const sectionRunning =
    running && status?.section
      ? SHRINK_SECTION_LABELS[status.section]
      : null

  return (
    <div className="space-y-8">
      <section className={cn(cardClassName, 'space-y-3 px-4 py-4')}>
        <div>
          <h2 className="text-base font-medium">1. Audit log cleanup</h2>
          <p className={`mt-1 text-sm ${hintClassName}`}>
            Deletes older audit entries for each entity, keeping only the latest
            row so the current value can still be tracked.
          </p>
        </div>
        <Button
          type="button"
          disabled={running || busy}
          onClick={() => setConfirmSection('audit')}
        >
          {running && status?.section === 'audit'
            ? 'Running…'
            : 'Shrink audit logs'}
        </Button>
      </section>

      <section className={cn(cardClassName, 'space-y-3 px-4 py-4')}>
        <div>
          <h2 className="text-base font-medium">
            2. Project documents &amp; shop drawings
          </h2>
          <p className={`mt-1 text-sm ${hintClassName}`}>
            Soft-deletes every non-current version (marks{' '}
            <code className="text-xs">deletedReason: shrink_db</code>), then
            removes unreferenced GridFS blobs. Current versions are never
            touched. Excluded projects are skipped entirely.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Exclude projects</p>
          <p className={`text-sm ${hintClassName}`}>
            Optional. Search by name or project number, then select. Default:
            none.
          </p>
          <ListSearchInput
            value={projectQuery}
            onChange={setProjectQuery}
            placeholder="Search projects to exclude…"
            aria-label="Search projects to exclude"
            className="max-w-none"
          />
          {excludedList.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {excludedList.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={running || busy}
                    onClick={() => setExcluded(p, false)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded border border-[var(--line)] px-2 py-1 text-sm',
                      'hover:bg-[var(--surface-2)] disabled:opacity-50',
                    )}
                    aria-label={`Remove ${p.projectNumber} from exclude list`}
                  >
                    <span className="font-medium">{p.projectNumber}</span>
                    <span className={hintClassName}>{p.name}</span>
                    <X className="size-3.5 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className={cn(
              'max-h-56 space-y-2 overflow-y-auto rounded border border-[var(--line)] px-3 py-3',
            )}
          >
            {searchQ.length < PROJECT_SEARCH_MIN ? (
              <p className={hintClassName}>
                Type at least {PROJECT_SEARCH_MIN} characters to search.
              </p>
            ) : searchingProjects ? (
              <p
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm',
                  hintClassName,
                )}
              >
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                Searching…
              </p>
            ) : projectHits.length === 0 ? (
              <p className={hintClassName}>No projects match “{searchQ}”.</p>
            ) : (
              projectHits.map((p) => {
                const checked = p.id in excludedById
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={running || busy}
                      onCheckedChange={(v) =>
                        setExcluded(
                          {
                            id: p.id,
                            name: p.name,
                            projectNumber: p.projectNumber,
                          },
                          v === true,
                        )
                      }
                      aria-label={`Exclude ${p.name}`}
                    />
                    <span>
                      <span className="font-medium">{p.name}</span>
                      <span className={`ml-2 ${hintClassName}`}>
                        {p.projectNumber}
                      </span>
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>

        <Button
          type="button"
          disabled={running || busy}
          onClick={() => setConfirmSection('documents')}
        >
          {running && status?.section === 'documents'
            ? 'Running…'
            : 'Shrink documents'}
        </Button>
      </section>

      <section className={cn(cardClassName, 'space-y-3 px-4 py-4')}>
        <h2 className="text-base font-medium">Status</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className={hintClassName}>State</dt>
            <dd className="font-medium">{status?.status ?? 'idle'}</dd>
          </div>
          <div>
            <dt className={hintClassName}>Section</dt>
            <dd>
              {status?.section
                ? SHRINK_SECTION_LABELS[status.section]
                : sectionRunning ?? '—'}
            </dd>
          </div>
          <div>
            <dt className={hintClassName}>Step</dt>
            <dd>
              {status
                ? (SHRINK_STEP_LABELS[status.step] ?? status.step)
                : '—'}
            </dd>
          </div>
          <div>
            <dt className={hintClassName}>Progress</dt>
            <dd>
              {status
                ? `${status.processed} / ${status.total} (${status.percent}%)`
                : '—'}
            </dd>
          </div>
        </dl>
        <div className="h-2 overflow-hidden rounded bg-[var(--line)]">
          <div
            className="h-full bg-[var(--ink)] transition-[width]"
            style={{ width: `${status?.percent ?? 0}%` }}
          />
        </div>
        {status?.errorMessage ? (
          <p className="text-sm text-red-700">{status.errorMessage}</p>
        ) : null}
        {result ? (
          <ul className={`space-y-1 text-sm ${hintClassName}`}>
            <li>Audit rows deleted: {result.auditDeleted}</li>
            <li>
              Document versions soft-deleted:{' '}
              {result.documentVersionsSoftDeleted}
            </li>
            <li>
              Shop drawing versions soft-deleted:{' '}
              {result.shopDrawingVersionsSoftDeleted}
            </li>
            <li>Blobs purged: {result.blobsPurged}</li>
            {result.errors.length > 0 ? (
              <li className="text-red-700">
                Errors: {result.errors.join('; ')}
              </li>
            ) : null}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3">
        <Button
          type="button"
          variant="outline"
          disabled={running || busy}
          onClick={() => void runOrphanCheck()}
        >
          Check orphans
        </Button>
      </section>

      {orphans ? (
        <section className={cn(cardClassName, 'space-y-3 px-4 py-4')}>
          <h2 className="text-base font-medium">Orphan check</h2>
          <ul className={`space-y-1 text-sm ${hintClassName}`}>
            <li>
              Shrink soft-delete blobs finished this pass:{' '}
              {orphans.shrinkBlobsPurged}
            </li>
            <li>
              Unmatched GridFS blobs (report only):{' '}
              {orphans.unmatchedBlobIds.length}
            </li>
            <li>
              Scopes with no current version (never auto-deleted):{' '}
              {orphans.scopesMissingCurrent.length}
            </li>
          </ul>
          {orphans.scopesMissingCurrent.length > 0 ? (
            <ul className="max-h-32 overflow-y-auto font-mono text-xs">
              {orphans.scopesMissingCurrent.slice(0, 50).map((s) => (
                <li key={`${s.kind}-${s.projectId}-${s.scope}`}>
                  {s.kind} {s.projectId} / {s.scope}
                </li>
              ))}
            </ul>
          ) : null}
          {orphans.unmatchedBlobIds.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              disabled={running || busy}
              onClick={() => setPurgeOpen(true)}
            >
              Delete {orphans.unmatchedBlobIds.length} unmatched blob(s)
            </Button>
          ) : null}
        </section>
      ) : null}

      <AlertDialog
        open={confirmSection != null}
        onOpenChange={(open) => {
          if (!open) setConfirmSection(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmSection
                ? `Run ${SHRINK_SECTION_LABELS[confirmSection]}?`
                : 'Confirm'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                {confirmSection === 'audit' ? (
                  <p>
                    Permanently deletes older audit rows, keeping only the
                    latest entry per entity.
                  </p>
                ) : (
                  <>
                    <p>
                      Soft-deletes non-current document and shop drawing
                      versions (except excluded projects), then purges
                      unreferenced blobs.
                    </p>
                    <p>
                      Excluded projects:{' '}
                      <strong>{excludedList.length}</strong>
                      {excludedList.length > 0
                        ? ` (${excludedList
                            .map((p) => p.projectNumber)
                            .join(', ')})`
                        : ' (none)'}
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !confirmSection}
              onClick={(e) => {
                e.preventDefault()
                if (confirmSection) void startShrink(confirmSection)
              }}
            >
              Confirm run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete unmatched GridFS blobs?</AlertDialogTitle>
            <AlertDialogDescription>
              {orphans?.unmatchedBlobIds.length ?? 0} file(s) in storage have no
              matching DB record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void purgeOrphans()
              }}
            >
              Delete blobs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
