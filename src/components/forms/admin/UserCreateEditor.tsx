import { type FormEvent, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import PasswordInput from '#/components/forms/PasswordInput'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { useAuth } from '#/context/authContext'
import type { AdminRole, AdminUser } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import {
  hintClassName,
  inputClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  /** Pre-selected roles, e.g. copied from an existing user. */
  initialRoles?: string[]
  onCreated?: (user: AdminUser) => void
}

/** Admin-created users skip the register OTP; they can log in right away. */
export default function UserCreateEditor({ initialRoles, onCreated }: Props) {
  const { can, user: actor } = useAuth()
  const canManageRoles = can('admin.role.manage')

  const [rolesCatalog, setRolesCatalog] = useState<AdminRole[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    initialRoles ?? [],
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSelectedRoles(initialRoles ?? [])
  }, [initialRoles])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rolesRes = await apiFetch<AdminRole[]>('/admin/roles')
        if (!cancelled && rolesRes.success && rolesRes.data) {
          setRolesCatalog(rolesRes.data)
        }
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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

  function toggleRole(key: string) {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim()) {
      toast.error('Email is required')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setSaving(true)
    try {
      const response = await apiFetch<AdminUser>('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          password,
          roles: canManageRoles ? selectedRoles : [],
        }),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to create user')
        return
      }
      toast.success('User created')
      onCreated?.(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="space-y-10" onSubmit={(event) => void handleSubmit(event)}>
      <section className="space-y-4">
        <div>
          <h2 className={sectionTitleClassName}>Account</h2>
          <p className={`mt-1 ${hintClassName}`}>
            The email is treated as verified — no OTP is needed, the user can
            log in with this password right away.
          </p>
        </div>

        <div>
          <label
            htmlFor="new-user-email"
            className="mb-1.5 block text-sm text-(--ink)"
          >
            Email
          </label>
          <input
            id="new-user-email"
            type="email"
            className={`w-full ${inputClassName}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label
            htmlFor="new-user-full-name"
            className="mb-1.5 block text-sm text-(--ink)"
          >
            Full name
          </label>
          <input
            id="new-user-full-name"
            className={`w-full ${inputClassName}`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>

        <div>
          <label
            htmlFor="new-user-password"
            className="mb-1.5 block text-sm text-(--ink)"
          >
            Password
          </label>
          <PasswordInput
            id="new-user-password"
            value={password}
            onChange={setPassword}
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
          />
        </div>
      </section>

      {canManageRoles ? (
        <section className="space-y-4">
          <div>
            <h2 className={sectionTitleClassName}>Roles</h2>
            <p className={`mt-1 ${hintClassName}`}>
              Roles you cannot grant are disabled.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rolesCatalog.map((role) => {
              const checked = selectedRoles.includes(role.key)
              const disabled = !roleAssignable(role)
              return (
                <label
                  key={role.key}
                  title={
                    disabled
                      ? "You can't grant a role with permissions you don't have"
                      : undefined
                  }
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border border-(--line) px-3 py-1.5 text-sm',
                    checked ? 'bg-(--surface)' : 'bg-white',
                    disabled ? 'opacity-50' : 'cursor-pointer',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={() => {
                      if (!disabled) toggleRole(role.key)
                    }}
                  />
                  {role.name}
                </label>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden />
              Creating…
            </>
          ) : (
            'Create user'
          )}
        </Button>
      </div>
    </form>
  )
}
