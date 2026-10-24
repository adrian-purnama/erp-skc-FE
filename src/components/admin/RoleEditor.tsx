import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ChevronDown, LoaderCircle } from 'lucide-react'
import { useAuth } from '#/context/authContext'
import type { AdminPermission, AdminRole } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  inputClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

type FilterChip = 'all' | 'selected' | 'unselected' | 'deprecated'

type Props = {
  mode: 'create' | 'edit'
  roleKey?: string
  duplicateFrom?: string
}

export default function RoleEditor({ mode, roleKey, duplicateFrom }: Props) {
  const { can, user } = useAuth()
  const canManage = can('admin.role.manage')
  const navigate = useNavigate()
  const actorPerms = useMemo(
    () => new Set(user?.permissions ?? []),
    [user],
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<string[]>([])
  const [includes, setIncludes] = useState<string[]>([])
  const [isSystem, setIsSystem] = useState(false)
  const [initial, setInitial] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [allRoles, setAllRoles] = useState<AdminRole[]>([])
  const [permGroups, setPermGroups] = useState<Record<string, AdminPermission[]>>(
    {},
  )
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [chip, setChip] = useState<FilterChip>('all')
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>(
    {},
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const [rolesRes, permsRes] = await Promise.all([
          apiFetch<AdminRole[]>('/admin/roles'),
          apiFetch<Record<string, AdminPermission[]>>('/admin/permissions'),
        ])
        if (!rolesRes.success || !permsRes.success) {
          toast.error('Failed to load role editor data')
          return
        }
        if (cancelled) return
        setAllRoles(rolesRes.data ?? [])
        setPermGroups(permsRes.data ?? {})

        const sourceKey = mode === 'edit' ? roleKey : duplicateFrom
        if (sourceKey) {
          const source =
            rolesRes.data?.find((r) => r.key === sourceKey) ??
            (await apiFetch<AdminRole>(`/admin/roles/${sourceKey}`)).data
          if (!source) {
            toast.error('Role not found')
            return
          }
          if (mode === 'edit') {
            setName(source.name)
            setKey(source.key)
            setDescription(source.description)
            setPermissions(source.permissions)
            setIncludes(source.includes)
            setIsSystem(source.isSystem)
            setInitial(
              JSON.stringify({
                name: source.name,
                key: source.key,
                description: source.description,
                permissions: source.permissions,
                includes: source.includes,
              }),
            )
          } else {
            setName(`${source.name} copy`)
            setKey(slugify(`${source.name} copy`))
            setDescription(source.description)
            setPermissions(
              source.permissions.includes('*') ? [] : [...source.permissions],
            )
            setIncludes([...source.includes])
            setIsSystem(false)
            setInitial('')
          }
        } else {
          setInitial(
            JSON.stringify({
              name: '',
              key: '',
              description: '',
              permissions: [],
              includes: [],
            }),
          )
        }
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, roleKey, duplicateFrom])

  useEffect(() => {
    if (mode === 'create' && !keyTouched) {
      setKey(slugify(name))
    }
  }, [name, keyTouched, mode])

  const current = JSON.stringify({
    name,
    key,
    description,
    permissions,
    includes,
  })
  const dirty = initial !== '' && current !== initial

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const includeOptions = allRoles.filter(
    (r) =>
      r.key !== key &&
      r.includes.length === 0 &&
      !(mode === 'edit' && r.key === roleKey),
  )

  const inherited = useMemo(() => {
    const map = new Map<string, string>()
    for (const inc of includes) {
      const role = allRoles.find((r) => r.key === inc)
      if (!role) continue
      for (const p of role.effectivePermissions) {
        if (!map.has(p)) map.set(p, role.name)
      }
    }
    return map
  }, [includes, allRoles])

  const impliedBy = useMemo(() => {
    const map = new Map<string, string>()
    const flat = Object.values(permGroups).flat()
    for (const selected of permissions) {
      const def = flat.find((p) => p.key === selected)
      for (const child of def?.implies ?? []) {
        map.set(child, def?.label ?? selected)
      }
    }
    return map
  }, [permissions, permGroups])

  const effectiveCount = useMemo(() => {
    if (permissions.includes('*')) return 1
    const set = new Set(permissions)
    for (const [k] of inherited) set.add(k)
    for (const [k] of impliedBy) set.add(k)
    return set.size
  }, [permissions, inherited, impliedBy])

  const flatPerms = useMemo(
    () => Object.values(permGroups).flat(),
    [permGroups],
  )

  function matchesSearch(p: AdminPermission): boolean {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return true
    if (p.key.toLowerCase().includes(q)) return true
    if (p.label.toLowerCase().includes(q)) return true
    if (p.category.toLowerCase().includes(q)) return true
    return p.routes.some((r) => r.path.toLowerCase().includes(q))
  }

  function matchesChip(p: AdminPermission): boolean {
    const selected =
      permissions.includes(p.key) ||
      inherited.has(p.key) ||
      impliedBy.has(p.key)
    if (chip === 'all') return true
    if (chip === 'selected') return selected
    if (chip === 'unselected') return !selected
    return p.status === 'deprecated'
  }

  async function save() {
    if (!canManage) return
    setSaving(true)
    setFieldErrors({})
    try {
      const body = {
        name,
        description,
        permissions,
        includes,
        ...(mode === 'create' ? { key } : {}),
      }
      const response =
        mode === 'create'
          ? await apiFetch<AdminRole>('/admin/roles', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiFetch<AdminRole>(`/admin/roles/${roleKey}`, {
              method: 'PATCH',
              body: JSON.stringify({
                name,
                description,
                permissions,
                includes,
              }),
            })

      if (!response.success || !response.data) {
        const fields =
          response.data &&
          typeof response.data === 'object' &&
          'fields' in response.data
            ? (response.data as { fields: Record<string, string> }).fields
            : undefined
        if (fields) setFieldErrors(fields)
        toast.error(response.message || 'Save failed')
        return
      }

      toast.success(mode === 'create' ? 'Role created' : 'Role saved')
      setName(response.data.name)
      setKey(response.data.key)
      setDescription(response.data.description)
      setPermissions(response.data.permissions)
      setIncludes(response.data.includes)
      setIsSystem(response.data.isSystem)
      setInitial(
        JSON.stringify({
          name: response.data.name,
          key: response.data.key,
          description: response.data.description,
          permissions: response.data.permissions,
          includes: response.data.includes,
        }),
      )
      if (mode === 'create') {
        void navigate({
          to: '/admin/roles/$key',
          params: { key: response.data.key },
        })
      }
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading…
      </div>
    )
  }

  const readOnly = !canManage
  const systemLocked = isSystem

  return (
    <div className="pb-24 text-[var(--ink)]">
      <h1 className={cn('mb-6', pageTitleClassName)}>
        {mode === 'create' ? 'New role' : name || 'Edit role'}
      </h1>

      {systemLocked ? (
        <div className={`${cardClassName} mb-6 border-[var(--accent)] bg-[var(--surface)] p-4 text-sm`}>
          System roles lock permissions; name and description stay editable.
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor="role-name" className="mb-1.5 block text-sm">
              Name
            </label>
            <input
              id="role-name"
              className={inputClassName}
              value={name}
              disabled={readOnly}
              onChange={(e) => setName(e.target.value)}
            />
            {fieldErrors.name ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.name}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="role-key" className="mb-1.5 block text-sm">
              Key
            </label>
            <input
              id="role-key"
              className={cn(inputClassName, 'font-mono')}
              value={key}
              disabled={readOnly || mode === 'edit'}
              onChange={(e) => {
                setKeyTouched(true)
                setKey(e.target.value)
              }}
            />
            {fieldErrors.key ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.key}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="role-desc" className="mb-1.5 block text-sm">
              Description
            </label>
            <textarea
              id="role-desc"
              className={cn(inputClassName, 'min-h-24')}
              value={description}
              disabled={readOnly}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm">Includes roles</p>
            <p className={`mb-2 text-xs ${hintClassName}`}>
              Only roles that do not include other roles.
            </p>
            <div className="space-y-2">
              {includeOptions.map((role) => (
                <label
                  key={role.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={includes.includes(role.key)}
                    disabled={readOnly || systemLocked}
                    onChange={() =>
                      setIncludes((prev) =>
                        prev.includes(role.key)
                          ? prev.filter((k) => k !== role.key)
                          : [...prev, role.key],
                      )
                    }
                  />
                  {role.name}
                  <span className={`font-mono text-xs ${hintClassName}`}>
                    {role.key}
                  </span>
                </label>
              ))}
            </div>
            {fieldErrors.includes ? (
              <p className="mt-1 text-xs text-red-700">{fieldErrors.includes}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          {permissions.includes('*') || (isSystem && key === 'super_admin') ? (
            <div className={`${cardClassName} p-4 text-sm`}>
              All permissions (*)
            </div>
          ) : (
            <>
              <p className={`text-sm ${hintClassName}`}>
                {permissions.length} permissions granted ({effectiveCount}{' '}
                effective)
              </p>
              <input
                type="search"
                className={inputClassName}
                placeholder="Search permissions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search permissions"
              />
              <div className="flex flex-wrap gap-2">
                {(
                  ['all', 'selected', 'unselected', 'deprecated'] as FilterChip[]
                ).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs capitalize',
                      chip === c
                        ? 'border-[var(--ink)] bg-[var(--surface)]'
                        : 'border-[var(--line)]',
                    )}
                    onClick={() => setChip(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {Object.entries(permGroups).map(([category, perms]) => {
                  const visible = perms.filter(
                    (p) => matchesSearch(p) && matchesChip(p),
                  )
                  if (visible.length === 0) return null
                  const selectable = visible.filter(
                    (p) =>
                      p.status !== 'deprecated' || permissions.includes(p.key),
                  )
                  const selectedCount = selectable.filter((p) =>
                    permissions.includes(p.key),
                  ).length
                  const allSelected =
                    selectable.length > 0 &&
                    selectedCount === selectable.length
                  const someSelected =
                    selectedCount > 0 && selectedCount < selectable.length
                  const open = expandedCats[category] ?? true

                  return (
                    <div key={category} className={cardClassName}>
                      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={open}
                          className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
                          onClick={() =>
                            setExpandedCats((s) => ({
                              ...s,
                              [category]: !open,
                            }))
                          }
                        >
                          <ChevronDown
                            className={cn(
                              'size-4 transition',
                              open ? '' : '-rotate-90',
                            )}
                            aria-hidden
                          />
                          {category}
                          <span className={hintClassName}>
                            {selectedCount} / {selectable.length} selected
                          </span>
                        </button>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected
                          }}
                          aria-checked={
                            someSelected ? 'mixed' : allSelected
                          }
                          disabled={readOnly || systemLocked}
                          onChange={() => {
                            if (allSelected) {
                              setPermissions((prev) =>
                                prev.filter(
                                  (k) => !selectable.some((p) => p.key === k),
                                ),
                              )
                            } else {
                              setPermissions((prev) => [
                                ...new Set([
                                  ...prev,
                                  ...selectable
                                    .filter((p) => actorPerms.has('*') || actorPerms.has(p.key))
                                    .filter((p) => p.status !== 'deprecated')
                                    .map((p) => p.key),
                                ]),
                              ])
                            }
                          }}
                        />
                      </div>
                      {open ? (
                        <ul className="divide-y divide-[var(--line)]">
                          {visible.map((p) => {
                            const isImplied = impliedBy.has(p.key)
                            const isInherited = inherited.has(p.key)
                            const holds =
                              actorPerms.has('*') || actorPerms.has(p.key)
                            const deprecatedOnRole =
                              p.status === 'deprecated' &&
                              permissions.includes(p.key)
                            const checked =
                              permissions.includes(p.key) ||
                              isImplied ||
                              isInherited
                            const disabled =
                              readOnly ||
                              systemLocked ||
                              isImplied ||
                              isInherited ||
                              !holds ||
                              (p.status === 'deprecated' && !deprecatedOnRole)

                            return (
                              <li
                                key={p.key}
                                className={cn(
                                  'px-3 py-2',
                                  deprecatedOnRole ? 'bg-amber-50' : '',
                                )}
                              >
                                <label className="flex items-start gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={checked}
                                    disabled={disabled}
                                    title={
                                      !holds
                                        ? "You can't grant a permission you don't have"
                                        : undefined
                                    }
                                    onChange={() =>
                                      setPermissions((prev) =>
                                        prev.includes(p.key)
                                          ? prev.filter((k) => k !== p.key)
                                          : [...prev, p.key],
                                      )
                                    }
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-medium">
                                      {p.label}
                                    </span>
                                    <span
                                      className={`block font-mono text-xs ${hintClassName}`}
                                    >
                                      {p.key}
                                    </span>
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      {p.status !== 'active' || p.manual ? (
                                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                                          {p.manual ? 'manual' : p.status}
                                        </span>
                                      ) : null}
                                      {isImplied ? (
                                        <span className={`text-xs ${hintClassName}`}>
                                          Included via {impliedBy.get(p.key)}
                                        </span>
                                      ) : null}
                                      {isInherited ? (
                                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                                          from {inherited.get(p.key)}
                                        </span>
                                      ) : null}
                                    </span>
                                    {deprecatedOnRole ? (
                                      <button
                                        type="button"
                                        className="mt-1 text-xs text-red-700 underline"
                                        onClick={() =>
                                          setPermissions((prev) =>
                                            prev.filter((k) => k !== p.key),
                                          )
                                        }
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className={`mt-1 block text-xs ${hintClassName}`}
                                      aria-expanded={Boolean(
                                        expandedRoutes[p.key],
                                      )}
                                      onClick={() =>
                                        setExpandedRoutes((s) => ({
                                          ...s,
                                          [p.key]: !s[p.key],
                                        }))
                                      }
                                    >
                                      Used by {p.routes.length} routes
                                    </button>
                                    {expandedRoutes[p.key] ? (
                                      <ul className="mt-1 font-mono text-xs text-[var(--muted)]">
                                        {p.routes.map((r) => (
                                          <li key={`${r.method}${r.path}`}>
                                            {r.method} {r.path}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              {fieldErrors.permissions ? (
                <p className="text-xs text-red-700">{fieldErrors.permissions}</p>
              ) : null}
              {flatPerms.length === 0 ? (
                <p className={hintClassName}>No permissions in registry.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-white/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
            <span className={`text-sm ${hintClassName}`}>
              {dirty ? 'Unsaved changes' : 'No changes'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={buttonOutlineClassName}
                onClick={() => void navigate({ to: '/admin/roles' })}
              >
                Cancel
              </button>
              <button
                type="button"
                className={buttonClassName}
                disabled={saving || !dirty || !name.trim() || !key.trim()}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
