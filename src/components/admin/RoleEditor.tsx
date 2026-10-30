import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { AlertTriangle, LoaderCircle, Search } from 'lucide-react'
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

type Filter = 'all' | 'selected'

/** Module (first key segment) → heading, in menu order; unknown modules go last. */
const MODULES: Array<[string, string]> = [
  ['project', 'Projects'],
  ['quotation', 'Quotations'],
  ['production', 'Production'],
  ['purchasing', 'Purchasing'],
  ['itemMaster', 'Item master'],
  ['uom', 'Units of measure'],
  ['customer', 'Customers'],
  ['vendor', 'Vendors'],
  ['termOfPayment', 'Terms of payment'],
  ['admin', 'Admin'],
]

function moduleOf(key: string): string {
  return key.split('.')[0] ?? key
}

function moduleTitle(module: string): string {
  return (
    MODULES.find(([m]) => m === module)?.[1] ??
    module
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase())
  )
}

function moduleRank(module: string): number {
  const i = MODULES.findIndex(([m]) => m === module)
  return i === -1 ? MODULES.length : i
}

type Props = {
  mode: 'create' | 'edit'
  roleKey?: string
  duplicateFrom?: string
}

export default function RoleEditor({ mode, roleKey, duplicateFrom }: Props) {
  const { can, user } = useAuth()
  const canManage = can('admin.role.manage')
  const navigate = useNavigate()
  const actorPerms = useMemo(() => new Set(user?.permissions ?? []), [user])

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
  const [permGroups, setPermGroups] = useState<
    Record<string, AdminPermission[]>
  >({})
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 250)
  const [filter, setFilter] = useState<Filter>('all')

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

  const isOn = (k: string) =>
    permissions.includes(k) || inherited.has(k) || impliedBy.has(k)

  /** Grantable permissions grouped by module; retired ones are left out. */
  const modules = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    const groups = new Map<string, AdminPermission[]>()
    for (const p of flatPerms) {
      if (p.status === 'deprecated') continue
      const module = moduleOf(p.key)
      if (
        q &&
        ![p.key, p.label, moduleTitle(module)].some((v) =>
          v.toLowerCase().includes(q),
        )
      ) {
        continue
      }
      groups.set(module, [...(groups.get(module) ?? []), p])
    }
    return [...groups].sort(
      ([a], [b]) => moduleRank(a) - moduleRank(b) || a.localeCompare(b),
    )
  }, [flatPerms, debouncedSearch])

  /** Retired permissions this role still holds: shown so they can be removed. */
  const retiredOnRole = flatPerms.filter(
    (p) => p.status === 'deprecated' && permissions.includes(p.key),
  )

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
  const locked = readOnly || systemLocked
  const allPerms =
    permissions.includes('*') || (isSystem && key === 'super_admin')
  const holds = (k: string) => actorPerms.has('*') || actorPerms.has(k)

  function toggle(k: string) {
    setPermissions((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    )
  }

  return (
    <div className="space-y-8 pb-24 text-[var(--ink)]">
      <div>
        <h1 className={pageTitleClassName}>
          {mode === 'create' ? 'New role' : name || 'Edit role'}
        </h1>
        {systemLocked ? (
          <p className={cn('mt-2 text-sm', hintClassName)}>
            System role: its permissions are fixed; name and description stay
            editable.
          </p>
        ) : null}
      </div>

      <section className={cn(cardClassName, 'grid gap-4 p-4 md:grid-cols-2')}>
        <div>
          <label
            htmlFor="role-name"
            className="mb-1.5 block text-sm font-medium"
          >
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
          <label
            htmlFor="role-key"
            className="mb-1.5 block text-sm font-medium"
          >
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
        <div className="md:col-span-2">
          <label
            htmlFor="role-desc"
            className="mb-1.5 block text-sm font-medium"
          >
            Description
          </label>
          <textarea
            id="role-desc"
            rows={2}
            className={inputClassName}
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {includeOptions.length > 0 ? (
          <div className="md:col-span-2">
            <p className="text-sm font-medium">Also gets everything from</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {includeOptions.map((role) => {
                const on = includes.includes(role.key)
                return (
                  <label
                    key={role.key}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm',
                      on
                        ? 'border-[var(--ink)] bg-[var(--surface)]'
                        : 'border-[var(--line)]',
                      locked && 'cursor-default opacity-60',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked}
                      onChange={() =>
                        setIncludes((prev) =>
                          prev.includes(role.key)
                            ? prev.filter((k) => k !== role.key)
                            : [...prev, role.key],
                        )
                      }
                    />
                    {role.name}
                  </label>
                )
              })}
            </div>
            {fieldErrors.includes ? (
              <p className="mt-1 text-xs text-red-700">
                {fieldErrors.includes}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Permissions</h2>
            <p className={cn('text-sm', hintClassName)}>
              {allPerms
                ? 'This role can do everything.'
                : `${permissions.length} picked · ${effectiveCount} in effect, counting included ones.`}
            </p>
          </div>
          {!allPerms ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  className={cn(inputClassName, 'w-64 pl-8')}
                  placeholder="Search permissions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search permissions"
                />
              </div>
              <div className="flex rounded-md border border-[var(--line)] p-0.5 text-xs">
                {(['all', 'selected'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={cn(
                      'rounded px-3 py-1',
                      filter === f
                        ? 'bg-[var(--ink)] text-[var(--surface)]'
                        : 'text-[var(--muted)]',
                    )}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'all' ? 'All' : 'Granted'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {retiredOnRole.length > 0 && !allPerms ? (
          <div className="flex flex-wrap items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                This role still holds retired permissions
              </p>
              <p className={hintClassName}>
                They no longer do anything:{' '}
                {retiredOnRole.map((p) => p.label).join(', ')}.
              </p>
            </div>
            {!locked ? (
              <button
                type="button"
                className={buttonOutlineClassName}
                onClick={() =>
                  setPermissions((prev) =>
                    prev.filter((k) => !retiredOnRole.some((p) => p.key === k)),
                  )
                }
              >
                Remove them
              </button>
            ) : null}
          </div>
        ) : null}

        {allPerms ? null : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {modules.map(([module, perms]) => {
              const shown =
                filter === 'selected' ? perms.filter((p) => isOn(p.key)) : perms
              if (shown.length === 0) return null
              const grantable = perms.filter(
                (p) =>
                  holds(p.key) &&
                  !inherited.has(p.key) &&
                  !impliedBy.has(p.key),
              )
              const onCount = perms.filter((p) => isOn(p.key)).length
              const allOn =
                grantable.length > 0 &&
                grantable.every((p) => permissions.includes(p.key))
              return (
                <div key={module} className={cardClassName}>
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-sm font-semibold">
                        {moduleTitle(module)}
                      </h3>
                      <span
                        className={cn('text-xs tabular-nums', hintClassName)}
                      >
                        {onCount} / {perms.length}
                      </span>
                    </div>
                    {!locked && grantable.length > 0 ? (
                      <button
                        type="button"
                        className={cn(
                          'text-xs underline-offset-4 hover:underline',
                          hintClassName,
                        )}
                        onClick={() =>
                          setPermissions((prev) =>
                            allOn
                              ? prev.filter(
                                  (k) => !grantable.some((p) => p.key === k),
                                )
                              : [
                                  ...new Set([
                                    ...prev,
                                    ...grantable.map((p) => p.key),
                                  ]),
                                ],
                          )
                        }
                      >
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-[var(--line)]">
                    {shown.map((p) => {
                      const via = impliedBy.get(p.key) ?? inherited.get(p.key)
                      const direct = permissions.includes(p.key)
                      const disabled =
                        locked || (!direct && Boolean(via)) || !holds(p.key)
                      return (
                        <li key={p.key}>
                          <label
                            title={
                              !holds(p.key)
                                ? `${p.key} · you can't grant a permission you don't have`
                                : p.key
                            }
                            className={cn(
                              'flex items-start gap-3 px-4 py-2 text-sm',
                              disabled
                                ? 'cursor-default'
                                : 'cursor-pointer hover:bg-[var(--surface)]',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={isOn(p.key)}
                              disabled={disabled}
                              onChange={() => toggle(p.key)}
                            />
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  !isOn(p.key) &&
                                    disabled &&
                                    'text-[var(--muted)]',
                                )}
                              >
                                {p.label}
                              </span>
                              {via && !direct ? (
                                <span
                                  className={cn('block text-xs', hintClassName)}
                                >
                                  Included with {via}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
        {fieldErrors.permissions ? (
          <p className="text-xs text-red-700">{fieldErrors.permissions}</p>
        ) : null}
        {flatPerms.length === 0 ? (
          <p className={hintClassName}>No permissions in registry.</p>
        ) : null}
      </section>

      {!readOnly ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm">
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
