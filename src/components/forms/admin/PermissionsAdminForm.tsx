import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ChevronDown, LoaderCircle, RefreshCw } from 'lucide-react'
import { ListChip } from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import type { AdminPermission, AdminRole } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  cardClassName,
  hintClassName,
  inputClassName,
  metaTextClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type ScanReport = {
  scan: {
    routes: Array<{
      method: string
      path: string
      category: string
      authType: string
      permissionKey?: string
    }>
  } | null
  violations: Array<{
    kind: string
    message: string
    method?: string
    path?: string
  }>
  authOnly: Array<{ method: string; path: string }>
  counts: {
    active: number
    unused: number
    deprecated: number
    unprotected: number
    authOnly: number
  }
}

type SyncResult = {
  summary: {
    active: number
    unused: number
    deprecated: number
    newCount: number
    pendingDeprecation: number
  }
  counts: ScanReport['counts']
  violations: ScanReport['violations']
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'unused', label: 'Unused' },
  { value: 'deprecated', label: 'Deprecated' },
] as const

function statusChip(status: AdminPermission['status']) {
  if (status === 'active') {
    return <ListChip tone="success">Active</ListChip>
  }
  if (status === 'deprecated') {
    return <ListChip tone="warning">Deprecated</ListChip>
  }
  return <ListChip tone="neutral">Unused</ListChip>
}

export default function PermissionsAdminForm() {
  const { can } = useAuth()
  const canManage = can('admin.role.manage')
  const [tab, setTab] = useState('browser')
  const [groups, setGroups] = useState<Record<string, AdminPermission[]>>({})
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [report, setReport] = useState<ScanReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const debouncedQ = useDebouncedValue(q, 250)
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [routeOpen, setRouteOpen] = useState<Record<string, boolean>>({})
  const [scanQ, setScanQ] = useState('')
  const debouncedScanQ = useDebouncedValue(scanQ, 250)
  const [scanAuth, setScanAuth] = useState('')
  const [scanCat, setScanCat] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedQ.trim()) params.set('q', debouncedQ.trim())
      if (status) params.set('status', status)
      const [permsRes, rolesRes, reportRes] = await Promise.all([
        apiFetch<Record<string, AdminPermission[]>>(
          `/admin/permissions?${params.toString()}`,
        ),
        apiFetch<AdminRole[]>('/admin/roles'),
        apiFetch<ScanReport>('/admin/permissions/scan-report'),
      ])
      if (!permsRes.success) {
        setError(permsRes.message || 'Failed to load permissions')
        return
      }
      setGroups(permsRes.data ?? {})
      if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data)
      if (reportRes.success && reportRes.data) setReport(reportRes.data)
    } catch {
      setError('Unable to reach the server')
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status])

  async function syncPermissions() {
    setSyncing(true)
    try {
      const response = await apiFetch<SyncResult>('/admin/permissions/sync', {
        method: 'POST',
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Sync failed')
        return
      }
      const { summary } = response.data
      toast.success(
        `Synced: ${summary.newCount} new, ${summary.deprecated} deprecated, ${summary.pendingDeprecation} pending`,
      )
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSyncing(false)
    }
  }

  const categories = useMemo(() => Object.keys(groups).sort(), [groups])

  const filteredGroups = useMemo(() => {
    const out: Record<string, AdminPermission[]> = {}
    for (const [cat, perms] of Object.entries(groups)) {
      if (category && cat !== category) continue
      out[cat] = perms
    }
    return out
  }, [groups, category])

  function rolesUsing(key: string): AdminRole[] {
    return roles.filter((r) => r.effectivePermissions.includes(key))
  }

  const scanRoutes = useMemo(() => {
    const routes = report?.scan?.routes ?? []
    const qv = debouncedScanQ.trim().toLowerCase()
    return routes.filter((r) => {
      if (scanAuth && r.authType !== scanAuth) return false
      if (scanCat && r.category !== scanCat) return false
      if (!qv) return true
      return (
        r.path.toLowerCase().includes(qv) ||
        r.method.toLowerCase().includes(qv) ||
        r.category.toLowerCase().includes(qv) ||
        (r.permissionKey ?? '').toLowerCase().includes(qv)
      )
    })
  }, [report, debouncedScanQ, scanAuth, scanCat])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className={hintClassName}>
          Active permissions are used by routes. Unused ones are registered but
          never tied to a route. Deprecated ones were missing for two syncs and
          cannot be granted on roles until routes return.
        </p>
        {canManage ? (
          <Button
            type="button"
            disabled={syncing || loading}
            onClick={() => void syncPermissions()}
          >
            {syncing ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {syncing ? 'Syncing…' : 'Sync permissions'}
          </Button>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line">
          <TabsTrigger value="browser">Browser</TabsTrigger>
          <TabsTrigger value="scan">Scan report</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className={`flex items-center gap-2 pt-4 ${hintClassName}`}>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : error ? (
          <div className={`${cardClassName} mt-4 space-y-3 p-6`}>
            <p className="text-sm text-red-700">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <TabsContent value="browser" className="space-y-4 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="search"
                  className={cn(inputClassName, 'sm:max-w-sm')}
                  placeholder="Search label, category, or path…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search permissions"
                />
                <Combobox
                  value={status || 'all'}
                  onValueChange={(value) =>
                    setStatus(value === 'all' ? '' : value)
                  }
                  options={[...STATUS_OPTIONS]}
                  placeholder="All statuses"
                  className="w-full sm:w-[160px]"
                  aria-label="Status filter"
                />
                <Combobox
                  value={category || 'all'}
                  onValueChange={(value) =>
                    setCategory(value === 'all' ? '' : value)
                  }
                  options={[
                    { value: 'all', label: 'All categories' },
                    ...categories.map((c) => ({ value: c, label: c })),
                  ]}
                  placeholder="All categories"
                  className="w-full sm:w-[180px]"
                  aria-label="Category filter"
                />
              </div>

              {Object.entries(filteredGroups).map(([cat, perms]) => {
                const open = expanded[cat] ?? true
                return (
                  <div key={cat} className={cardClassName}>
                    <button
                      type="button"
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
                      onClick={() =>
                        setExpanded((s) => ({ ...s, [cat]: !open }))
                      }
                    >
                      <ChevronDown
                        className={cn(
                          'size-4 transition',
                          open ? '' : '-rotate-90',
                        )}
                        aria-hidden
                      />
                      {cat}
                      <span className={hintClassName}>{perms.length}</span>
                    </button>
                    {open ? (
                      <ul className="divide-y divide-(--line) border-t border-(--line)">
                        {perms.map((p) => (
                          <li key={p.key} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{p.label}</span>
                              {statusChip(p.status)}
                              {p.manual ? (
                                <ListChip tone="info">Manual</ListChip>
                              ) : null}
                            </div>
                            <p
                              className={`mt-0.5 font-mono text-xs ${hintClassName}`}
                            >
                              {p.key}
                            </p>
                            <button
                              type="button"
                              className={`mt-1 text-xs ${hintClassName}`}
                              aria-expanded={Boolean(routeOpen[p.key])}
                              onClick={() =>
                                setRouteOpen((s) => ({
                                  ...s,
                                  [p.key]: !s[p.key],
                                }))
                              }
                            >
                              {p.routes.length}{' '}
                              {p.routes.length === 1 ? 'route' : 'routes'}
                            </button>
                            {routeOpen[p.key] ? (
                              <ul className="mt-1 font-mono text-xs text-(--muted)">
                                {p.routes.map((r) => (
                                  <li key={`${r.method}${r.path}`}>
                                    {r.method} {r.path}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1">
                              <span className={`text-xs ${hintClassName}`}>
                                Used by roles:
                              </span>
                              {rolesUsing(p.key).length === 0 ? (
                                <span className={`text-xs ${hintClassName}`}>
                                  —
                                </span>
                              ) : (
                                rolesUsing(p.key).map((r) => (
                                  <Link
                                    key={r.key}
                                    to="/admin/roles/$key"
                                    params={{ key: r.key }}
                                    className="rounded-md border border-(--line) px-2 py-0.5 text-xs no-underline hover:border-(--ink)"
                                  >
                                    {r.name}
                                  </Link>
                                ))
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </TabsContent>

            <TabsContent value="scan" className="space-y-6 pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ['Active', report?.counts.active ?? 0],
                    ['Unused', report?.counts.unused ?? 0],
                    ['Deprecated', report?.counts.deprecated ?? 0],
                  ] as const
                ).map(([label, count]) => (
                  <div key={label} className={`${cardClassName} p-4`}>
                    <p className={metaTextClassName}>{label}</p>
                    <p className="mt-1 text-2xl font-medium">{count}</p>
                  </div>
                ))}
              </div>

              <section>
                <h2 className={sectionTitleClassName}>Unprotected routes</h2>
                {(report?.scan?.routes.filter((r) => r.authType === 'none') ??
                  []
                ).length === 0 ? (
                  <p className={`mt-2 ${hintClassName}`}>None (expected).</p>
                ) : (
                  <ul className="mt-2 font-mono text-sm">
                    {report?.scan?.routes
                      .filter((r) => r.authType === 'none')
                      .map((r) => (
                        <li key={`${r.method}${r.path}`}>
                          {r.method} {r.path}
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className={sectionTitleClassName}>Auth-only routes</h2>
                {(report?.authOnly ?? []).length === 0 ? (
                  <p className={`mt-2 ${hintClassName}`}>None.</p>
                ) : (
                  <ul className="mt-2 font-mono text-sm">
                    {report?.authOnly.map((r) => (
                      <li key={`${r.method}${r.path}`}>
                        {r.method} {r.path}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(report?.violations ?? []).length > 0 ? (
                <section>
                  <h2 className={sectionTitleClassName}>Warnings</h2>
                  <ul className="mt-2 space-y-1 text-sm text-amber-800">
                    {report?.violations.map((v, i) => (
                      <li key={`${v.message}-${i}`}>{v.message}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="space-y-3">
                <h2 className={sectionTitleClassName}>All routes</h2>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    type="search"
                    className={cn(inputClassName, 'sm:max-w-sm')}
                    value={scanQ}
                    onChange={(e) => setScanQ(e.target.value)}
                    placeholder="Search routes…"
                    aria-label="Search scan routes"
                  />
                  <Combobox
                    value={scanAuth || 'all'}
                    onValueChange={(value) =>
                      setScanAuth(value === 'all' ? '' : value)
                    }
                    options={[
                      { value: 'all', label: 'All auth types' },
                      { value: 'permission', label: 'Permission' },
                      { value: 'auth', label: 'Auth only' },
                      { value: 'public', label: 'Public' },
                      { value: 'none', label: 'Unprotected' },
                    ]}
                    placeholder="All auth types"
                    className="w-full sm:w-[160px]"
                    aria-label="Auth type filter"
                  />
                  <Combobox
                    value={scanCat || 'all'}
                    onValueChange={(value) =>
                      setScanCat(value === 'all' ? '' : value)
                    }
                    options={[
                      { value: 'all', label: 'All categories' },
                      ...[
                        ...new Set(
                          (report?.scan?.routes ?? []).map((r) => r.category),
                        ),
                      ].map((c) => ({ value: c, label: c })),
                    ]}
                    placeholder="All categories"
                    className="w-full sm:w-[180px]"
                    aria-label="Category filter"
                  />
                </div>
                <div className="overflow-x-auto rounded-lg border border-(--line)">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-(--line) bg-(--surface) text-(--muted)">
                        <th className="px-3 py-2 font-medium">Method</th>
                        <th className="px-3 py-2 font-medium">Path</th>
                        <th className="px-3 py-2 font-medium">Category</th>
                        <th className="px-3 py-2 font-medium">Auth</th>
                        <th className="px-3 py-2 font-medium">Permission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanRoutes.map((r) => (
                        <tr
                          key={`${r.method}${r.path}${r.permissionKey ?? ''}`}
                          className="border-b border-(--line)"
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.method}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.path}
                          </td>
                          <td className="px-3 py-2">{r.category}</td>
                          <td className="px-3 py-2">{r.authType}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.permissionKey ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
