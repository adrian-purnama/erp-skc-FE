import type { FormEvent, RefObject } from 'react'
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
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export type AppConfigData = {
  appName: string
  openLogin: boolean
  openRegister: boolean
  appLogo: string | null
  companyName: string
  npwp: string
  address: string
  phone: string
  email: string
  website: string
  companyProfile: string | null
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function pickImageFile(
  file: File | null,
  setFile: (file: File | null) => void,
): void {
  if (!file) {
    setFile(null)
    return
  }
  if (!file.type.startsWith('image/')) {
    toast.error('Only image files are allowed')
    return
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error('Image must be 5MB or smaller')
    return
  }
  setFile(file)
}

function ImagePicker({
  label,
  preview,
  previewAlt,
  file,
  inputId,
  inputRef,
  onSelected,
  onClear,
}: {
  label: string
  preview: string | null
  previewAlt: string
  file: File | null
  inputId: string
  inputRef: RefObject<HTMLInputElement | null>
  onSelected: (file: File | null) => void
  onClear: () => void
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm text-[var(--ink)]">{label}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`flex size-24 shrink-0 items-center justify-center ${cardClassName}`}>
          {preview ? (
            <img
              src={preview}
              alt={previewAlt}
              className="max-h-20 max-w-20 object-contain"
            />
          ) : (
            <ImagePlus className="size-7 text-[var(--muted)]" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <label
            htmlFor={inputId}
            className={cn(
              cardClassName,
              'flex cursor-pointer flex-col items-center justify-center border-dashed px-4 py-6 text-center transition',
              'hover:border-[var(--ink)] hover:bg-[var(--surface)]',
            )}
          >
            <ImagePlus className="mb-2 size-5 text-[var(--muted)]" aria-hidden />
            <span className="text-sm font-medium text-[var(--ink)]">
              {file ? file.name : 'Choose an image'}
            </span>
            <span className={`mt-1 text-xs ${hintClassName}`}>
              PNG, JPG, or WebP · max 5MB
            </span>
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              onSelected(event.target.files?.[0] ?? null)
            }}
          />
          {file ? (
            <button
              type="button"
              className="mt-2 text-sm text-[var(--muted)] underline transition hover:text-[var(--ink)]"
              onClick={onClear}
            >
              Clear selected file
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function AppConfigForm() {
  const { refreshBranding } = useBranding()
  const logoInputId = useId()
  const profileInputId = useId()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const profileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [appName, setAppName] = useState('')
  const [openLogin, setOpenLogin] = useState(true)
  const [openRegister, setOpenRegister] = useState(true)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [npwp, setNpwp] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [profilePreview, setProfilePreview] = useState<string | null>(null)
  const [profileFile, setProfileFile] = useState<File | null>(null)
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(null)
  const [savedProfileUrl, setSavedProfileUrl] = useState<string | null>(null)

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
        const data = response.data
        setAppName(data.appName)
        setOpenLogin(data.openLogin)
        setOpenRegister(data.openRegister)
        const logoUrl = toAbsoluteMediaUrl(data.appLogo)
        setSavedLogoUrl(logoUrl)
        setLogoPreview(logoUrl)
        setCompanyName(data.companyName ?? '')
        setNpwp(data.npwp ?? '')
        setAddress(data.address ?? '')
        setPhone(data.phone ?? '')
        setEmail(data.email ?? '')
        setWebsite(data.website ?? '')
        const profileUrl = toAbsoluteMediaUrl(data.companyProfile)
        setSavedProfileUrl(profileUrl)
        setProfilePreview(profileUrl)
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
    if (!logoFile) {
      setLogoPreview(savedLogoUrl)
      return
    }
    const objectUrl = URL.createObjectURL(logoFile)
    setLogoPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logoFile, savedLogoUrl])

  useEffect(() => {
    if (!profileFile) {
      setProfilePreview(savedProfileUrl)
      return
    }
    const objectUrl = URL.createObjectURL(profileFile)
    setProfilePreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [profileFile, savedProfileUrl])

  async function uploadImage(
    path: string,
    file: File,
  ): Promise<{ id: string; url: string } | null> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiUpload<{ id: string; url: string }>(path, formData)
    if (!response.success || !response.data) {
      toast.error(response.message || 'Image upload failed')
      return null
    }
    return response.data
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
          companyName: companyName.trim(),
          npwp: npwp.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          website: website.trim(),
        }),
      })

      if (!patchResponse.success) {
        toast.error(patchResponse.message || 'Failed to update app config')
        return
      }

      if (logoFile) {
        const uploaded = await uploadImage('/admin/app-logo', logoFile)
        if (!uploaded) {
          await refreshBranding()
          return
        }
        const url = toAbsoluteMediaUrl(uploaded.url)
        setSavedLogoUrl(url)
        setLogoPreview(url)
        setLogoFile(null)
        if (logoInputRef.current) logoInputRef.current.value = ''
      }

      if (profileFile) {
        const uploaded = await uploadImage(
          '/admin/app-company-profile',
          profileFile,
        )
        if (!uploaded) {
          await refreshBranding()
          return
        }
        const url = toAbsoluteMediaUrl(uploaded.url)
        setSavedProfileUrl(url)
        setProfilePreview(url)
        setProfileFile(null)
        if (profileInputRef.current) profileInputRef.current.value = ''
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
          <h2 className={sectionTitleClassName}>Branding</h2>
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

        <ImagePicker
          label="App logo"
          preview={logoPreview}
          previewAlt="App logo preview"
          file={logoFile}
          inputId={logoInputId}
          inputRef={logoInputRef}
          onSelected={(file) => pickImageFile(file, setLogoFile)}
          onClear={() => {
            setLogoFile(null)
            if (logoInputRef.current) logoInputRef.current.value = ''
          }}
        />
      </section>

      <section className="space-y-4 border-b border-[var(--line)] pb-8">
        <div>
          <h2 className={sectionTitleClassName}>
            Company information
          </h2>
          <p className={`mt-1 ${hintClassName}`}>
            Optional details for documents and correspondence.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="company-name"
              className="mb-1.5 block text-sm text-[var(--ink)]"
            >
              Official company name
            </label>
            <input
              id="company-name"
              type="text"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="npwp" className="mb-1.5 block text-sm text-[var(--ink)]">
              NPWP
            </label>
            <input
              id="npwp"
              type="text"
              value={npwp}
              onChange={(event) => setNpwp(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm text-[var(--ink)]">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="address"
              className="mb-1.5 block text-sm text-[var(--ink)]"
            >
              Address
            </label>
            <textarea
              id="address"
              rows={3}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-[var(--ink)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label
              htmlFor="website"
              className="mb-1.5 block text-sm text-[var(--ink)]"
            >
              Website
            </label>
            <input
              id="website"
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              className={inputClassName}
              placeholder="https://"
            />
          </div>
        </div>

        <ImagePicker
          label="Official company profile"
          preview={profilePreview}
          previewAlt="Company profile preview"
          file={profileFile}
          inputId={profileInputId}
          inputRef={profileInputRef}
          onSelected={(file) => pickImageFile(file, setProfileFile)}
          onClear={() => {
            setProfileFile(null)
            if (profileInputRef.current) profileInputRef.current.value = ''
          }}
        />
      </section>

      <section className="space-y-4 border-b border-[var(--line)] pb-8">
        <div>
          <h2 className={sectionTitleClassName}>Access</h2>
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
