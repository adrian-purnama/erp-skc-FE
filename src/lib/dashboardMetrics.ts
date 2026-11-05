import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { apiFetch } from '#/lib/api'

/** Saved per user: dashboard → metric ids in order. A missing dashboard uses defaults. */
export type DashboardMetricsPrefs = Record<string, string[]>

/**
 * The metrics this user shows on one dashboard. Falls back to `defaults` until
 * the user customizes it; unknown ids (removed metrics) are dropped.
 */
export function useDashboardMetrics(
  dashboard: string,
  allIds: string[],
  defaults: string[],
) {
  const [selected, setSelected] = useState<string[]>(defaults)
  const [ready, setReady] = useState(false)
  const allKey = allIds.join(',')
  const defaultKey = defaults.join(',')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch<DashboardMetricsPrefs>('/auth/dashboard-metrics')
        if (cancelled) return
        const saved = res.success ? res.data[dashboard] : undefined
        const known = new Set(allKey.split(','))
        setSelected(saved ? saved.filter((id) => known.has(id)) : defaultKey.split(','))
      } catch {
        // Keep defaults when prefs cannot load.
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dashboard, allKey, defaultKey])

  const save = useCallback(
    async (next: string[]) => {
      const previous = selected
      setSelected(next)
      try {
        const res = await apiFetch<DashboardMetricsPrefs>(
          `/auth/dashboard-metrics/${dashboard}`,
          { method: 'PUT', body: JSON.stringify({ metrics: next }) },
        )
        if (!res.success) throw new Error(res.message)
      } catch (e) {
        setSelected(previous)
        toast.error(e instanceof Error && e.message ? e.message : 'Failed to save dashboard')
      }
    },
    [dashboard, selected],
  )

  return { selected, ready, save }
}
