import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import PasswordInput from '#/components/forms/PasswordInput'
import { useAuth } from '#/context/authContext'
import type { AdminRole, AdminUser, AdminUserDetail } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import {
  buttonClassName,
  cardClassName,
  hintClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/users/$userId')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.user.view'),
  component: AdminUserDetailPage,
})

function AdminUserDetailPage() {
  const { userId } = Route.useParams()
  const { can, refreshAuth, user: actor } = useAuth()
  const canManageRoles = can('admin.role.manage')
  const canManageUser = can('admin.user.manage')

  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [rolesCatalog, setRolesCatalog] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [isBlocked, setIsBlocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)
  const [permsOpen, setPermsOpen] = useState(false)

  const activeSuperAdminCount =
    rolesCatalog.find((r) => r.key === 'super_admin')?.activeSuperAdminCount ?? 0

  const isLastActiveSuperAdmin =
    Boolean(detail) &&
    !detail!.isBlocked &&
    (detail!.roles ?? []).includes('super_admin') &&
    activeSuperAdminCount === 1

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const [userRes, rolesRes] = await Promise.all([
          apiFetch<AdminUserDetail>(`/admin/users/${userId}`),
          apiFetch<AdminRole[]>('/admin/roles'),
        ])
        if (!userRes.success || !userRes.data) {
          if (!cancelled) toast.error(userRes.message || 'Failed to load user')
          return
        }
        if (!cancelled) {
          setDetail(userRes.data)
          setSelectedRoles(userRes.data.roles ?? [])
          setIsBlocked(userRes.data.isBlocked)
          if (rolesRes.success && rolesRes.data) setRolesCatalog(rolesRes.data)
        }
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  const actorPerms = useMemo(
    () => new Set(actor?.permissions ?? []),
    [actor],
  )

  function roleAssignable(role: AdminRole): boolean {
    if (actorPerms.has('*')) return true
    return role.effectivePermissions.every(
      (p) => p !== '*' && actorPerms.has(p),
    )
  }

  const effectivePreview = useMemo(() => {
    const set = new Set<string>()
    for (const key of selectedRoles) {
      const role = rolesCatalog.find((r) => r.key === key)
      for (const p of role?.effectivePermissions ?? []) set.add(p)
    }
    if (set.has('*')) return { '*': ['*'] } as Record<string, string[]>
    const grouped: Record<string, string[]> = {}
    for (const key of [...set].sort()) {
      const category = key.split('.').slice(0, 2).join('.') || 'other'
      if (!grouped[category]) grouped[category] = []
      grouped[category]!.push(key)
    }
    return grouped
  }, [selectedRoles, rolesCatalog])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!detail || !canManageUser) return
    if (password && password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    const body: { password?: string; isBlocked?: boolean } = {}
    if (password) body.password = password
    if (isBlocked !== detail.isBlocked) body.isBlocked = isBlocked
    if (!body.password && body.isBlocked === undefined) {
      toast.error('Change a flag or enter a new password')
      return
    }

    setSaving(true)
    try {
      const response = await apiFetch<AdminUser>(`/admin/users/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update user')
        return
      }
      setPassword('')
      toast.success('User updated')
      const refreshed = await apiFetch<AdminUserDetail>(`/admin/users/${userId}`)
      if (refreshed.success && refreshed.data) {
        setDetail(refreshed.data)
        setIsBlocked(refreshed.data.isBlocked)
        setSelectedRoles(refreshed.data.roles ?? [])
      }
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function saveRoles() {
    if (!detail || !canManageRoles) return
    setSavingRoles(true)
    try {
      const response = await apiFetch<{ roles: string[] }>(
        `/admin/users/${detail.id}/roles`,
        {
          method: 'PATCH',
          body: JSON.stringify({ roles: selectedRoles }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update roles')
        return
      }
      toast.success('Roles updated')
      setDetail({ ...detail, roles: response.data.roles })
      if (actor?.email === detail.email) {
        await refreshAuth()
      }
      const rolesRes = await apiFetch<AdminRole[]>('/admin/roles')
      if (rolesRes.success && rolesRes.data) setRolesCatalog(rolesRes.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSavingRoles(false)
    }
  }

  function toggleRole(key: string) {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl text-[var(--ink)]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">
          {detail?.email ?? 'User'}
        </h1>
        {detail ? (
          <p className={`mt-2 ${hintClassName}`}>
            Created {new Date(detail.accountCreatedAt).toLocaleDateString()}
            {detail.isBlocked ? ' · Blocked' : ''}
          </p>
        ) : null}
      </div>

      {loading ? (
        <div className={`flex items-center gap-2 ${hintClassName}`}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Loading user…
        </div>
      ) : !detail ? (
        <p className={hintClassName}>This user could not be loaded.</p>
      ) : (
        <div className="space-y-10">
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-medium">Roles</h2>
              <p className={`mt-1 ${hintClassName}`}>
                Assign roles. Roles you cannot grant are disabled.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {rolesCatalog.map((role) => {
                const checked = selectedRoles.includes(role.key)
                const assignable = roleAssignable(role)
                const removingLastSuper =
                  isLastActiveSuperAdmin &&
                  role.key === 'super_admin' &&
                  checked
                const disabled =
                  !canManageRoles || !assignable || removingLastSuper
                const title = !assignable
                  ? "You can't grant a role with permissions you don't have"
                  : removingLastSuper
                    ? 'Cannot remove the last unblocked super_admin'
                    : undefined
                return (
                  <label
                    key={role.key}
                    title={title}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-sm',
                      checked ? 'bg-[var(--surface)]' : 'bg-white',
                      disabled ? 'opacity-50' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleRole(role.key)}
                    />
                    {role.name}
                    <span className={hintClassName}>{role.key}</span>
                  </label>
                )
              })}
            </div>
            {canManageRoles ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={
                    savingRoles ||
                    JSON.stringify(selectedRoles.slice().sort()) ===
                      JSON.stringify((detail.roles ?? []).slice().sort())
                  }
                  className={buttonClassName}
                  onClick={() => void saveRoles()}
                >
                  {savingRoles ? 'Saving roles…' : 'Save roles'}
                </button>
              </div>
            ) : null}

            <div className={cardClassName}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                aria-expanded={permsOpen}
                onClick={() => setPermsOpen((v) => !v)}
              >
                Effective permissions preview
                <ChevronDown
                  className={cn(
                    'size-4 transition',
                    permsOpen ? 'rotate-180' : '',
                  )}
                  aria-hidden
                />
              </button>
              {permsOpen ? (
                <div className="space-y-3 border-t border-[var(--line)] px-4 py-3">
                  {Object.keys(effectivePreview).length === 0 ? (
                    <p className={hintClassName}>No permissions</p>
                  ) : (
                    Object.entries(effectivePreview).map(([cat, keys]) => (
                      <div key={cat}>
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                          {cat}
                        </p>
                        <ul className="mt-1 space-y-0.5 font-mono text-xs">
                          {keys.map((k) => (
                            <li key={k}>{k}</li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </section>

          <form
            className="space-y-6"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div>
              <h2 className="text-base font-medium text-[var(--ink)]">Account</h2>
              <p className={`mt-1 ${hintClassName}`}>
                Update blocked flag or set a new password.
              </p>
            </div>

            <label
              className={`flex items-center gap-2 ${hintClassName}`}
              title={
                isLastActiveSuperAdmin
                  ? 'Cannot block the last unblocked super_admin'
                  : undefined
              }
            >
              <input
                type="checkbox"
                checked={isBlocked}
                disabled={!canManageUser || isLastActiveSuperAdmin}
                onChange={(event) => setIsBlocked(event.target.checked)}
              />
              Blocked
            </label>

            <div>
              <label
                htmlFor="user-password"
                className="mb-1.5 block text-sm text-[var(--ink)]"
              >
                New password
              </label>
              <PasswordInput
                id="user-password"
                value={password}
                onChange={setPassword}
                placeholder="Leave blank to keep current password"
                autoComplete="new-password"
              />
              <p className={`mt-1.5 text-xs ${hintClassName}`}>
                Minimum 8 characters. Only fill in to reset the password.
              </p>
            </div>

            {canManageUser ? (
              <div className="flex justify-end">
                <button type="submit" disabled={saving} className={buttonClassName}>
                  {saving ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      Saving…
                    </>
                  ) : (
                    'Save changes'
                  )}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      )}
    </div>
  )
}
