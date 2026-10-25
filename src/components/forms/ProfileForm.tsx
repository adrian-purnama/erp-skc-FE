import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { LoaderCircle, Mail, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import {
  cardClassName,
  hintClassName,
  metaTextClassName,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type ProfileData = {
  email: string
  fullName: string
}

function initialsFrom(fullName: string, email: string): string {
  const name = fullName.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  const local = email.split('@')[0] ?? '?'
  return local.slice(0, 2).toUpperCase()
}

export default function ProfileForm() {
  const { user, refreshAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [savedFullName, setSavedFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const dirty = fullName.trim() !== savedFullName.trim()
  const initials = useMemo(
    () => initialsFrom(fullName || savedFullName, email),
    [fullName, savedFullName, email],
  )
  const displayName =
    (fullName.trim() || savedFullName.trim() || email.split('@')[0]) ?? 'Account'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const res = await apiFetch<ProfileData>('/auth/profile')
      if (cancelled) return
      if (res.success && res.data) {
        const name = res.data.fullName ?? ''
        setEmail(res.data.email)
        setFullName(name)
        setSavedFullName(name)
      } else {
        toast.error(res.message || 'Failed to load profile')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dirty) return
    setSaving(true)
    const nextName = fullName.trim()
    const res = await apiFetch<ProfileData>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: nextName }),
    })
    setSaving(false)
    if (!res.success || !res.data) {
      toast.error(res.message || 'Failed to update profile')
      return
    }
    const name = res.data.fullName ?? ''
    setEmail(res.data.email)
    setFullName(name)
    setSavedFullName(name)
    await refreshAuth()
    toast.success('Profile saved')
  }

  if (loading) {
    return (
      <p className={`flex items-center gap-2 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading profile…
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-full border border-(--line) bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-lg font-semibold tracking-wide text-(--ink)"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 space-y-1">
          <h1 className={pageTitleClassName}>{displayName}</h1>
          <p className={`flex min-w-0 items-center gap-1.5 ${hintClassName}`}>
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{email}</span>
          </p>
          {user?.roles?.length ? (
            <p className={metaTextClassName}>
              {user.roles.join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className={cn(cardClassName, 'space-y-5 p-5 sm:p-6')}
      >
        <div>
          <h2 className={sectionTitleClassName}>Account details</h2>
          <p className={`mt-1 ${hintClassName}`}>
            Update how your name appears in the app. Email stays your sign-in.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <UserRound className="size-3.5 text-(--muted)" aria-hidden />
            Full name
          </span>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            autoComplete="name"
            maxLength={120}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Mail className="size-3.5 text-(--muted)" aria-hidden />
            Email
          </span>
          <Input
            value={email}
            readOnly
            disabled
            className="bg-[color-mix(in_srgb,var(--muted)_6%,white)] opacity-90"
          />
          <span className={hintClassName}>
            Used to sign in. Contact an admin if you need this changed.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-(--line) pt-4">
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {dirty ? (
            <button
              type="button"
              className={`text-sm font-medium text-(--muted) underline-offset-2 hover:text-(--ink) hover:underline`}
              onClick={() => setFullName(savedFullName)}
              disabled={saving}
            >
              Discard
            </button>
          ) : (
            <span className={hintClassName}>No unsaved changes</span>
          )}
        </div>
      </form>
    </div>
  )
}
