import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, LoaderCircle, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
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
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type {
  ProjectRab,
  ProjectRabElaboration,
  ProjectRabLine,
} from '#/lib/project'
import { buttonOutlineClassName, hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  onProjectIdChange: (projectId: string | undefined) => void
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Digits only (integer rupiah). */
function rupiahDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

function formatRupiahDigits(digits: string): string {
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('id-ID').format(n)
}

/** Display saved amount as Rp-formatted (or —). */
function formatRupiahAmount(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount.trim() === '') {
    return '—'
  }
  const digits = rupiahDigits(amount.split('.')[0] ?? amount)
  if (!digits) return '—'
  return `Rp ${formatRupiahDigits(digits)}`
}

function plainFromSaved(amount: string | null | undefined): string {
  if (!amount) return ''
  return rupiahDigits(amount.split('.')[0] ?? amount)
}

function flatLines(rab: ProjectRab | null): ProjectRabLine[] {
  if (!rab) return []
  return rab.groups.flatMap((g) => g.lines)
}

export default function ProjectRabForm({
  projectId,
  onProjectIdChange,
}: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')

  const [tab, setTab] = useState('estimate')
  const [rab, setRab] = useState<ProjectRab | null>(null)
  const [elaboration, setElaboration] =
    useState<ProjectRabElaboration | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})

  const loadAll = useCallback(async (pid: string) => {
    setLoading(true)
    try {
      const [rabRes, elabRes] = await Promise.all([
        apiFetch<ProjectRab | null>(`/project/${pid}/rab`),
        apiFetch<ProjectRabElaboration>(`/project/${pid}/rab/elaboration`),
      ])
      if (!rabRes.success) {
        toast.error(rabRes.message || 'Failed to load RAB')
        setRab(null)
      } else {
        setRab(rabRes.data ?? null)
      }
      if (!elabRes.success) {
        setElaboration(null)
      } else {
        setElaboration(elabRes.data ?? null)
      }
    } catch {
      toast.error('Unable to reach the server')
      setRab(null)
      setElaboration(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRab(null)
    setElaboration(null)
    setPriceDrafts({})
    if (!projectId) return
    void loadAll(projectId)
  }, [projectId, loadAll])

  const lines = useMemo(() => flatLines(rab), [rab])

  async function lockRab() {
    if (!projectId) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(`/project/${projectId}/rab/lock`, {
        method: 'POST',
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to lock RAB')
        return
      }
      setRab(res.data)
      setPriceDrafts({})
      setLockOpen(false)
      toast.success('RAB locked')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function fillTarif(lineKey: string) {
    if (!projectId) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}/fill-tarif`,
        { method: 'POST' },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to fill tarif')
        return
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success('Tarif applied')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function saveUnitPrice(lineKey: string) {
    if (!projectId) return
    if (priceDrafts[lineKey] === undefined) return
    const digits = rupiahDigits(priceDrafts[lineKey] ?? '')
    const unitPrice = digits === '' ? null : digits
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ unitPrice }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to update price')
        return
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success(unitPrice === null ? 'Price cleared' : 'Unit price saved')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  const isLocked = rab?.status === 'locked'
  const hasLines = lines.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className={cn('text-sm', hintClassName)}>Internal</p>
          <h1 className="text-2xl font-medium tracking-tight">RAB</h1>
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
            onProjectIdChange={(next) => onProjectIdChange(next || undefined)}
            ariaLabel="RAB project"
          />
        </div>
      </div>

      {!projectId ? (
        <p className={hintClassName}>Choose a project to view its RAB.</p>
      ) : loading ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {isLocked ? (
                <span className="inline-flex items-center gap-1 font-medium text-(--muted)">
                  <Lock className="size-3" aria-hidden />
                  Locked
                  {rab?.lockedBy ? ` · ${rab.lockedBy.name}` : ''}
                  {rab?.lockedAt ? ` · ${formatWhen(rab.lockedAt)}` : ''}
                </span>
              ) : (
                <span className={hintClassName}>
                  Draft · qty from BOQ · lock when final
                </span>
              )}
            </div>
            {canManage && hasLines && !isLocked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={() => setLockOpen(true)}
              >
                <Lock className="size-3.5" aria-hidden />
                Lock RAB
              </Button>
            ) : null}
          </div>

          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <TabsList variant="line">
              <TabsTrigger value="estimate">Estimate</TabsTrigger>
              <TabsTrigger value="elaboration">Elaboration</TabsTrigger>
            </TabsList>

            <TabsContent value="estimate" className="mt-4 space-y-3">
              {!hasLines ? (
                <p className={cn('text-sm', hintClassName)}>
                  No materials yet. Fill Shop Drawing BOQ first.
                </p>
              ) : (
                <ul className="space-y-0">
                  {lines.map((line) => {
                    const savedDigits = plainFromSaved(line.unitPrice)
                    const draftDigits =
                      priceDrafts[line.key] !== undefined
                        ? rupiahDigits(priceDrafts[line.key]!)
                        : savedDigits
                    const draftDisplay = formatRupiahDigits(draftDigits)
                    const dirty =
                      priceDrafts[line.key] !== undefined &&
                      draftDigits !== savedDigits
                    const editable = canManage && line.priceEditable
                    const hasPrice = draftDigits !== ''
                    const showTarif =
                      editable && line.hasTarif && !hasPrice
                    return (
                      <li
                        key={line.key}
                        className="border-b border-(--line) py-2.5 last:border-b-0"
                      >
                        <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_10.5rem_minmax(11rem,auto)] sm:gap-x-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {line.materialName}
                            </p>
                            <p
                              className={cn(
                                'truncate font-mono text-[11px]',
                                hintClassName,
                              )}
                            >
                              {line.materialCode}
                              {line.origin === 'append' &&
                              line.addedBy &&
                              line.addedAt
                                ? ` · added ${line.addedBy.name} ${formatWhen(line.addedAt)}`
                                : ''}
                            </p>
                          </div>

                          <p className="text-sm tabular-nums text-(--muted) sm:text-right">
                            {line.totalQty} {line.uomSymbol}
                          </p>

                          <div className="flex items-center gap-1.5">
                            {editable ? (
                              <>
                                <span
                                  className={cn('text-xs', hintClassName)}
                                >
                                  Rp
                                </span>
                                <Input
                                  value={draftDisplay}
                                  onChange={(e) =>
                                    setPriceDrafts((prev) => ({
                                      ...prev,
                                      [line.key]: rupiahDigits(
                                        e.target.value,
                                      ),
                                    }))
                                  }
                                  disabled={busy}
                                  inputMode="numeric"
                                  placeholder="0"
                                  className="h-8 min-w-0 flex-1 tabular-nums"
                                  aria-label={`Unit price ${line.materialName}`}
                                />
                                {dirty ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 shrink-0 px-2"
                                    disabled={busy}
                                    onClick={() =>
                                      void saveUnitPrice(line.key)
                                    }
                                  >
                                    Save
                                  </Button>
                                ) : null}
                                {showTarif ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 shrink-0 px-2 text-xs"
                                    disabled={busy}
                                    onClick={() => void fillTarif(line.key)}
                                  >
                                    Tarif
                                  </Button>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-sm tabular-nums">
                                {formatRupiahAmount(line.unitPrice)}
                              </span>
                            )}
                          </div>

                          <p className="text-sm tabular-nums text-(--muted) sm:text-right">
                            {line.totalQty} ×{' '}
                            {hasPrice
                              ? formatRupiahDigits(draftDigits)
                              : '—'}
                            {line.lineTotal ? (
                              <span className="ml-2 font-medium text-(--ink)">
                                {formatRupiahAmount(line.lineTotal)}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}

              {hasLines ? (
                <div className="flex justify-end gap-2 border-t border-(--line) pt-3 text-sm">
                  <span className="text-(--muted)">Grand total</span>
                  <span className="font-medium tabular-nums">
                    {formatRupiahAmount(rab?.grandTotal)}
                  </span>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="elaboration" className="mt-4 space-y-6">
              {!elaboration || elaboration.documents.length === 0 ? (
                <p className={cn('text-sm', hintClassName)}>
                  No BOQ documents to elaborate.
                </p>
              ) : (
                elaboration.documents.map((doc) => (
                  <section
                    key={`${doc.shopDrawingItemName}-${doc.fileVersion}-${doc.originalFilename}`}
                    className="space-y-4"
                  >
                    <header className="space-y-0.5 border-b border-(--line) pb-2">
                      <p className="text-sm font-medium">
                        {doc.shopDrawingItemName}
                      </p>
                      <p className={cn('text-xs', hintClassName)}>
                        v{doc.fileVersion} · {doc.originalFilename} · make{' '}
                        {doc.makeQty}
                      </p>
                    </header>

                    {doc.blocks.length === 0 ? (
                      <p className={cn('text-sm', hintClassName)}>
                        Empty BOQ.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {doc.blocks.map((block, bi) => (
                          <div key={`${block.title}-${bi}`} className="space-y-1.5">
                            <p className="text-[11px] font-medium tracking-wide text-(--muted)">
                              {block.title}
                            </p>
                            <ul className="space-y-1">
                              {block.lines.map((line, li) => (
                                <li
                                  key={`${line.materialCode}-${line.uomSymbol}-${li}`}
                                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm"
                                >
                                  <span className="min-w-0">
                                    {line.materialName}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-(--muted)">
                                    {line.qtyPerUnit} {line.uomSymbol} ×{' '}
                                    {line.makeQty} ={' '}
                                    <span className="font-medium text-(--ink)">
                                      {line.totalQty} {line.uomSymbol}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <AlertDialog open={lockOpen} onOpenChange={setLockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock RAB permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Quantities and prices on current lines will be frozen. You cannot
              unlock. New materials added later in BOQ will appear as separate
              lines.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void lockRab()
              }}
            >
              {busy ? 'Locking…' : 'Lock RAB'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
