import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import type { AdminPermission, AdminRole } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/permissions')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: AdminPermissionsPage,
})

type Tab = 'browser' | 'scan'

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
  violations: Array<{ kind: string; message: string; method?: string; path?: string }>
  authOnly: Array<{ method: string; path: string }>
  counts: {
    active: number
    unused: number
    deprecated: number
    unprotected: number
    authOnly: number
  }
}

function AdminPermissionsPage() {
  const [tab, setTab] = useState<Tab>('browser')
  const [groups, setGroups] = useState<Record<string, AdminPermission[]>>({})
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [report, setReport] = useState<ScanReport | null>(null)
  const [loading, setLoading] = useState(true)
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
    <div className="w-full text-[var(--ink)]">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight">Permissions</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Read-only reference of curated permissions and the last route scan.
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b border-[var(--line)]">
        <button
          type="button"
          className={cn(
            'border-b-2 px-3 py-2 text-sm',
            tab === 'browser'
              ? 'border-[var(--ink)] font-medium'
              : 'border-transparent text-[var(--muted)]',
          )}
          onClick={() => setTab('browser')}
        >
          Browser
        </button>
        <button
          type="button"
          className={cn(
            'border-b-2 px-3 py-2 text-sm',
            tab === 'scan'
              ? 'border-[var(--ink)] font-medium'
              : 'border-transparent text-[var(--muted)]',
          )}
          onClick={() => setTab('scan')}
        >
          Scan report
        </button>
      </div>

      {loading ? (
        <div className={`flex items-center gap-2 ${hintClassName}`}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : error ? (
        <div className={`${cardClassName} space-y-3 p-6`}>
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            className={buttonOutlineClassName}
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : tab === 'browser' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              className={cn(inputClassName, 'sm:max-w-sm')}
              placeholder="Search key, label, category, path…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search permissions"
            />
            <Select
              value={status || 'all'}
              onValueChange={(value) =>
                setStatus(value === 'all' ? '' : value)
              }
            >
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Status filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="unused">unused</SelectItem>
                <SelectItem value="deprecated">deprecated</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={category || 'all'}
              onValueChange={(value) =>
                setCategory(value === 'all' ? '' : value)
              }
            >
              <SelectTrigger
                className="w-full sm:w-[180px]"
                aria-label="Category filter"
              >
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    className={cn('size-4 transition', open ? '' : '-rotate-90')}
                    aria-hidden
                  />
                  {cat}
                  <span className={hintClassName}>{perms.length}</span>
                </button>
                {open ? (
                  <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                    {perms.map((p) => (
                      <li key={p.key} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{p.label}</span>
                          <span className={`font-mono text-xs ${hintClassName}`}>
                            {p.key}
                          </span>
                          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                            {p.status}
                          </span>
                        </div>
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
                          {p.routes.length} routes
                        </button>
                        {routeOpen[p.key] ? (
                          <ul className="mt-1 font-mono text-xs text-[var(--muted)]">
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
                            <span className={`text-xs ${hintClassName}`}>—</span>
                          ) : (
                            rolesUsing(p.key).map((r) => (
                              <Link
                                key={r.key}
                                to="/admin/roles/$key"
                                params={{ key: r.key }}
                                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs no-underline hover:border-[var(--ink)]"
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
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['active', report?.counts.active ?? 0],
                ['unused', report?.counts.unused ?? 0],
                ['deprecated', report?.counts.deprecated ?? 0],
              ] as const
            ).map(([label, count]) => (
              <div key={label} className={`${cardClassName} p-4`}>
                <p className={`text-xs uppercase ${hintClassName}`}>{label}</p>
                <p className="mt-1 text-2xl font-medium">{count}</p>
              </div>
            ))}
          </div>

          <section>
            <h2 className="mb-2 text-base font-medium">Unprotected routes</h2>
            {(report?.scan?.routes.filter((r) => r.authType === 'none') ?? [])
              .length === 0 ? (
              <p className={hintClassName}>None (expected).</p>
            ) : (
              <ul className="font-mono text-sm">
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
            <h2 className="mb-2 text-base font-medium">Auth-only routes</h2>
            {(report?.authOnly ?? []).length === 0 ? (
              <p className={hintClassName}>None.</p>
            ) : (
              <ul className="font-mono text-sm">
                {report?.authOnly.map((r) => (
                  <li key={`${r.method}${r.path}`}>
                    {r.method} {r.path}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-medium">All routes</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                className={cn(inputClassName, 'sm:max-w-sm')}
                value={scanQ}
                onChange={(e) => setScanQ(e.target.value)}
                placeholder="Search routes…"
                aria-label="Search scan routes"
              />
              <Select
                value={scanAuth || 'all'}
                onValueChange={(value) =>
                  setScanAuth(value === 'all' ? '' : value)
                }
              >
                <SelectTrigger
                  className="w-full sm:w-[160px]"
                  aria-label="Auth type filter"
                >
                  <SelectValue placeholder="All auth types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All auth types</SelectItem>
                  <SelectItem value="permission">permission</SelectItem>
                  <SelectItem value="auth">auth</SelectItem>
                  <SelectItem value="public">public</SelectItem>
                  <SelectItem value="none">none</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={scanCat || 'all'}
                onValueChange={(value) =>
                  setScanCat(value === 'all' ? '' : value)
                }
              >
                <SelectTrigger
                  className="w-full sm:w-[180px]"
                  aria-label="Category filter"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {[
                    ...new Set(
                      (report?.scan?.routes ?? []).map((r) => r.category),
                    ),
                  ].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[var(--muted)]">
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
                      className="border-b border-[var(--line)]"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.method}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.path}</td>
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
        </div>
      )}
    </div>
  )
}
