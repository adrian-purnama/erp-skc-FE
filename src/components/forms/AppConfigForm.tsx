import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ImagePlus, LoaderCircle } from 'lucide-react'
import { apiFetch, apiUpload, toAbsoluteMediaUrl } from '#/lib/api'
import { useBranding } from '#/context/brandingContext'
import {
  buttonClassName,
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type AppConfigData = {
  appName: string
  openLogin: boolean
  openRegister: boolean
  appLogo: string | null
}

export default function AppConfigForm() {
  const { refreshBranding } = useBranding()
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [appName, setAppName] = useState('')
  const [openLogin, setOpenLogin] = useState(true)
  const [openRegister, setOpenRegister] = useState(true)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await apiFetch<AppConfigData>('/admin/app-config')
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to load app config')
          return
        }
        if (cancelled) return
        setAppName(response.data.appName)
        setOpenLogin(response.data.openLogin)
        setOpenRegister(response.data.openRegister)
        setLogoPreview(toAbsoluteMediaUrl(response.data.appLogo))
      } catch {
        toast.error('Unable to reach the server. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!logoFile) return
    const objectUrl = URL.createObjectURL(logoFile)
    setLogoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logoFile])

  function onLogoSelected(file: File | null) {
    if (!file) {
      setLogoFile(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller')
      return
    }
    setLogoFile(file)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!appName.trim()) {
      toast.error('App name is required')
      return
    }

    setSaving(true)

    try {
      const patchResponse = await apiFetch<AppConfigData>('/admin/app-config', {
        method: 'PATCH',
        body: JSON.stringify({
          appName: appName.trim(),
          openLogin,
          openRegister,
        }),
      })

      if (!patchResponse.success) {
        toast.error(patchResponse.message || 'Failed to update app config')
        return
      }

      if (logoFile) {
        const formData = new FormData()
        formData.append('file', logoFile)

        const logoResponse = await apiUpload<{ id: string; url: string }>(
          '/admin/app-logo',
          formData,
        )

        if (!logoResponse.success || !logoResponse.data) {
          toast.error(logoResponse.message || 'Config saved, but logo upload failed')
          await refreshBranding()
          return
        }

        setLogoPreview(toAbsoluteMediaUrl(logoResponse.data.url))
        setLogoFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }

      await refreshBranding()
      toast.success('App config saved')
    } catch {
      toast.error('Unable to reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-16 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading app config…
      </div>
    )
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <section className="space-y-4 border-b border-[var(--line)] pb-8">
        <div>
          <h2 className="text-base font-medium text-[var(--ink)]">Branding</h2>
          <p className={`mt-1 ${hintClassName}`}>
            Name and logo shown in the header and public pages.
          </p>
        </div>

        <div>
          <label htmlFor="app-name" className="mb-1.5 block text-sm text-[var(--ink)]">
            App name
          </label>
          <input
            id="app-name"
            type="text"
            value={appName}
            onChange={(event) => setAppName(event.target.value)}
            className={inputClassName}
            required
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm text-[var(--ink)]">App logo</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className={`flex size-24 shrink-0 items-center justify-center ${cardClassName}`}>
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="App logo preview"
                  className="max-h-20 max-w-20 object-contain"
                />
              ) : (
                <ImagePlus className="size-7 text-[var(--muted)]" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <label
                htmlFor={fileInputId}
                className={cn(
                  cardClassName,
                  'flex cursor-pointer flex-col items-center justify-center border-dashed px-4 py-6 text-center transition',
                  'hover:border-[var(--ink)] hover:bg-[var(--surface)]',
                )}
              >
                <ImagePlus className="mb-2 size-5 text-[var(--muted)]" aria-hidden />
                <span className="text-sm font-medium text-[var(--ink)]">
                  {logoFile ? logoFile.name : 'Choose an image'}
                </span>
                <span className={`mt-1 text-xs ${hintClassName}`}>
                  PNG, JPG, or WebP · max 5MB
                </span>
              </label>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  onLogoSelected(event.target.files?.[0] ?? null)
                }}
              />
              {logoFile ? (
                <button
                  type="button"
                  className="mt-2 text-sm text-[var(--muted)] underline transition hover:text-[var(--ink)]"
                  onClick={() => {
                    setLogoFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  Clear selected file
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-b border-[var(--line)] pb-8">
        <div>
          <h2 className="text-base font-medium text-[var(--ink)]">Access</h2>
          <p className={`mt-1 ${hintClassName}`}>
            Control whether visitors can sign in or create accounts.
          </p>
        </div>

        <ToggleRow
          id="open-login"
          label="Open login"
          description="Allow existing users to sign in."
          checked={openLogin}
          onChange={setOpenLogin}
        />
        <ToggleRow
          id="open-register"
          label="Open register"
          description="Allow new users to create an account."
          checked={openRegister}
          onChange={setOpenRegister}
        />
      </section>

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
    </form>
  )
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        cardClassName,
        'flex cursor-pointer items-start justify-between gap-4 px-4 py-3 transition hover:border-[var(--ink)]',
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
        <span className={`mt-0.5 block ${hintClassName}`}>{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          className={cn(
            'block h-6 w-11 rounded-full border border-[var(--line)] bg-[var(--surface)] transition',
            'peer-checked:border-[var(--ink)] peer-checked:bg-[var(--ink)]',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)]',
          )}
          aria-hidden
        />
        <span
          className={cn(
            'pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition',
            'peer-checked:translate-x-5',
          )}
          aria-hidden
        />
      </span>
    </label>
  )
}
