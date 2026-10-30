import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Factory, LoaderCircle, X } from 'lucide-react'
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
import { apiFetch } from '#/lib/api'
import type { ProductionReadiness } from '#/lib/production'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  /** Called after the project is released (reload project → Production phase). */
  onReleased: () => void
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Check
      className="mx-auto size-4 text-emerald-600"
      aria-label={`${label}: done`}
    />
  ) : (
    <X
      className="mx-auto size-4 text-red-600"
      aria-label={`${label}: missing`}
    />
  )
}

/**
 * Checks readiness first. Not ready: lists every item with what is configured
 * and what is not yet. Ready: confirms the release.
 */
export default function ProjectProductionReleaseButton({
  projectId,
  onReleased,
}: Props) {
  const [checking, setChecking] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [readiness, setReadiness] = useState<ProductionReadiness | null>(null)

  async function check() {
    setChecking(true)
    try {
      const response = await apiFetch<ProductionReadiness>(
        `/production/projects/${projectId}/readiness`,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to check readiness')
        return
      }
      setReadiness(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setChecking(false)
    }
  }

  async function release() {
    setReleasing(true)
    try {
      const response = await apiFetch<ProductionReadiness>(
        `/production/projects/${projectId}/release`,
        { method: 'POST' },
      )
      if (!response.success) {
        // 409 carries fresh readiness: show what changed since the check.
        if (response.data) setReadiness(response.data)
        toast.error(response.message || 'Failed to release')
        return
      }
      toast.success('Project released to production')
      setReadiness(null)
      onReleased()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setReleasing(false)
    }
  }

  const ready = readiness?.ready === true
  // Items still missing something first.
  const items = readiness
    ? [...readiness.items].sort((a, b) => Number(a.ready) - Number(b.ready))
    : []

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5"
        disabled={checking}
        onClick={() => void check()}
      >
        {checking ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Factory className="size-3.5" aria-hidden />
        )}
        Release to production
      </Button>

      <AlertDialog
        open={readiness !== null}
        onOpenChange={(next) => {
          if (!next && !releasing) setReadiness(null)
        }}
      >
        <AlertDialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 data-[size=default]:sm:max-w-2xl">
          <AlertDialogHeader className="border-b border-(--line) px-6 pt-6 pb-4 text-left place-items-start">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <AlertDialogTitle>
                {ready ? 'Release to production?' : 'Not ready for production'}
              </AlertDialogTitle>
              {readiness ? (
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
                    ready
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {readiness.readyCount} / {readiness.totalCount} items ready
                </span>
              ) : null}
            </div>
            <AlertDialogDescription>
              {ready
                ? 'The RAB and quotation stay locked and production can create SPK for every item.'
                : 'Finish the items marked missing, then try again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {readiness ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <ul className="space-y-2">
                {readiness.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2.5 text-sm">
                    {c.ok ? (
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                        aria-hidden
                      />
                    ) : (
                      <X
                        className="mt-0.5 size-4 shrink-0 text-red-600"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{c.label}</p>
                      <p className={cn('text-xs break-words', hintClassName)}>
                        {c.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {items.length > 0 ? (
                <div className="rounded-md border border-(--line)">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col />
                      <col className="w-14 sm:w-20" />
                      <col className="w-12 sm:w-16" />
                      <col className="w-14 sm:w-20" />
                      <col className="w-20 sm:w-24" />
                    </colgroup>
                    <thead className="sticky top-0 bg-(--surface) text-[11px] text-(--muted)">
                      <tr className="border-b border-(--line)">
                        <th className="px-3 py-2 text-left font-medium">
                          Item
                        </th>
                        <th className="px-1 py-2 text-center font-medium leading-tight">
                          SD
                        </th>
                        <th className="px-1 py-2 text-center font-medium">
                          BOQ
                        </th>
                        <th className="px-1 py-2 text-center font-medium leading-tight">
                          File Produksi
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr
                          key={i.itemId}
                          className={cn(
                            'border-b border-(--line) last:border-0',
                            !i.ready && 'bg-red-500/5',
                          )}
                        >
                          <td className="px-3 py-2">
                            <p className="font-medium break-words">{i.label}</p>
                            {i.makeQty ? (
                              <p
                                className={cn(
                                  'text-xs tabular-nums',
                                  hintClassName,
                                )}
                              >
                                Qty {i.makeQty}
                                {i.makeType === 'outsource'
                                  ? ' · Outsource'
                                  : i.makeType === 'subcon'
                                    ? ' · Subcon'
                                    : ''}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-1 py-2 text-center">
                            <Mark ok={i.shopDrawing} label="Shop drawing" />
                          </td>
                          <td className="px-1 py-2 text-center">
                            <Mark ok={i.boq} label="BOQ" />
                          </td>
                          <td className="px-1 py-2 text-center">
                            {i.productionFileRequired || i.productionFile ? (
                              <Mark ok={i.productionFile} label="File Produksi" />
                            ) : (
                              <span
                                className={cn('text-xs', hintClassName)}
                                title="Outsource: the vendor brings its own production files"
                              >
                                n/a
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs">
                            {i.ready ? (
                              <span className="text-emerald-700 dark:text-emerald-300">
                                Configured
                              </span>
                            ) : (
                              <span className="text-red-700 dark:text-red-300">
                                Not yet
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter className="border-t border-(--line) px-6 py-4">
            <AlertDialogCancel disabled={releasing}>
              {ready ? 'Cancel' : 'Close'}
            </AlertDialogCancel>
            {ready ? (
              <AlertDialogAction
                disabled={releasing}
                onClick={(e) => {
                  e.preventDefault()
                  void release()
                }}
              >
                {releasing ? 'Releasing…' : 'Release'}
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
