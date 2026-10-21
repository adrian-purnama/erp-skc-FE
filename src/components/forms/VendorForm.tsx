import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Ban,
  CircleCheck,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  ListSearchInput,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import StatusPill from '#/components/forms/shared/StatusPill'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import {
  EMAIL_TYPES,
  PHONE_TYPES,
  type VendorDetail,
  type VendorEmail,
  type VendorListItem,
  type VendorPhone,
  type EmailType,
  type PhoneType,
} from '#/lib/vendor'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  inputClassNameCompact,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; vendorId: string }

function emptyEmail(): VendorEmail {
  return { address: '', type: 'work', isPreferred: true }
}

function emptyPhone(): VendorPhone {
  return { number: '', type: 'personal', isPreferred: true }
}

export default function VendorForm(props: Props) {
  const { can } = useAuth()
  const canManage = can('vendor.manage')

  if (props.mode === 'list') {
    return <VendorList canManage={canManage} />
  }

  return (
    <VendorEditor
      mode={props.mode}
      vendorId={props.mode === 'edit' ? props.vendorId : undefined}
      canManage={canManage}
    />
  )
}

type StatusFilter = 'all' | 'enabled' | 'disabled'

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
] as const

function VendorList({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<VendorListItem[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pendingDisable, setPendingDisable] = useState<VendorListItem | null>(
    null,
  )
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const response = await apiFetch<VendorListItem[]>('/vendor')
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Failed to load Vendors')
          }
          return
        }
        if (!cancelled) setResults(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const setActive = useCallback(
    async (vendor: VendorListItem, next: boolean) => {
      setToggling(true)
      try {
        const response = await apiFetch<VendorDetail>(
          `/vendor/${vendor.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ isActive: next }),
          },
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to update Vendor')
          return
        }
        setResults((rows) =>
          rows.map((row) =>
            row.id === vendor.id
              ? { ...row, isActive: response.data!.isActive }
              : row,
          ),
        )
        toast.success(next ? 'Vendor enabled' : 'Vendor disabled')
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        setToggling(false)
        setPendingDisable(null)
      }
    },
    [],
  )

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return results.filter((row) => {
      if (statusFilter === 'enabled' && !row.isActive) return false
      if (statusFilter === 'disabled' && row.isActive) return false
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        (row.address ?? '').toLowerCase().includes(q) ||
        (row.npwp ?? '').toLowerCase().includes(q)
      )
    })
  }, [results, debounced, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [debounced, statusFilter])

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginate(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  const vendorColumns = useMemo<ListTableColumn<VendorListItem>[]>(
    () => [
      {
        header: 'Name',
        cellClassName: 'font-medium',
        cell: (vendor) => vendor.name,
      },
      {
        header: 'Address',
        cellClassName: hintClassName,
        cell: (vendor) => vendor.address || '—',
      },
      {
        header: 'NPWP',
        cellClassName: hintClassName,
        cell: (vendor) => vendor.npwp || '—',
      },
      {
        header: 'Status',
        cell: (vendor) => <StatusPill active={vendor.isActive} />,
      },
      {
        header: '',
        cellClassName: 'text-right',
        cell: (vendor) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="size-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  void navigate({
                    to: '/dashboard/vendors/$vendorId',
                    params: { vendorId: vendor.id },
                  })
                }
              >
                <Pencil className="size-4" aria-hidden />
                Edit
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (vendor.isActive) {
                        setPendingDisable(vendor)
                        return
                      }
                      void setActive(vendor, true)
                    }}
                  >
                    {vendor.isActive ? (
                      <Ban className="size-4" aria-hidden />
                    ) : (
                      <CircleCheck className="size-4" aria-hidden />
                    )}
                    {vendor.isActive ? 'Disable' : 'Enable'}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canManage, navigate, setActive],
  )

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-sm text-[var(--muted)]">
          Master Data / Vendor Master Data
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">
              Vendor Master Data
            </h1>
            <p className={`mt-2 ${hintClassName}`}>
              Browse Vendors. Open one to view details
              {canManage ? ', or create and edit' : ''}.
            </p>
          </div>
          {canManage ? (
            <Link
              to="/dashboard/vendors/new"
              className={cn(
                buttonClassName,
                'inline-flex items-center gap-2 no-underline',
              )}
            >
              <Plus className="size-4" aria-hidden />
              New Vendor
            </Link>
          ) : null}
        </div>
      </div>

      <ListTable
        filters={
          <>
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter names…"
              aria-label="Filter Vendors"
            />
            <Combobox
              value={statusFilter}
              onValueChange={(value) => {
                if (
                  value === 'all' ||
                  value === 'enabled' ||
                  value === 'disabled'
                ) {
                  setStatusFilter(value)
                }
              }}
              options={[...STATUS_FILTER_OPTIONS]}
              placeholder="All statuses"
              searchPlaceholder="Search status…"
              emptyText="No status found."
              aria-label="Status filter"
            />
          </>
        }
        loading={loading}
        loadingLabel="Loading Vendors…"
        empty={
          debounced.trim() || statusFilter !== 'all'
            ? 'No Vendors match the current filters.'
            : 'No Vendors yet.'
        }
        columns={vendorColumns}
        rows={pageItems}
        rowKey={(vendor) => vendor.id}
        pagination={{
          page: safePage,
          totalPages,
          totalItems: filtered.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      <ConfirmDisableDialog
        open={pendingDisable !== null}
        title="Disable Vendor?"
        description={
          pendingDisable
            ? `“${pendingDisable.name}” will be disabled and can be enabled again later.`
            : 'This Vendor will be disabled and can be enabled again later.'
        }
        busy={toggling}
        onOpenChange={(open) => {
          if (!open) setPendingDisable(null)
        }}
        onConfirm={() => {
          if (pendingDisable) void setActive(pendingDisable, false)
        }}
      />
    </div>
  )
}

function VendorEditor({
  mode,
  vendorId,
  canManage,
}: {
  mode: 'create' | 'edit'
  vendorId?: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [npwp, setNpwp] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false)
  const [emails, setEmails] = useState<VendorEmail[]>([emptyEmail()])
  const [phones, setPhones] = useState<VendorPhone[]>([emptyPhone()])

  useEffect(() => {
    if (mode !== 'edit' || !vendorId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const response = await apiFetch<VendorDetail>(
          `/vendor/${vendorId}`,
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Vendor not found')
          void navigate({ to: '/dashboard/vendors' })
          return
        }
        if (cancelled) return
        const data = response.data
        setName(data.name)
        setAddress(data.address)
        setNpwp(data.npwp ?? '')
        setIsActive(data.isActive)
        setEmails(
          data.emails.length > 0
            ? data.emails.map((e) => ({
                id: e.id,
                address: e.address,
                type: e.type,
                isPreferred: e.isPreferred,
              }))
            : [emptyEmail()],
        )
        setPhones(
          data.phones.length > 0
            ? data.phones.map((p) => ({
                id: p.id,
                number: p.number,
                type: p.type,
                isPreferred: p.isPreferred,
              }))
            : [emptyPhone()],
        )
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, vendorId, navigate])

  function setPreferredEmail(index: number) {
    setEmails((rows) =>
      rows.map((row, i) => ({ ...row, isPreferred: i === index })),
    )
  }

  function setPreferredPhone(index: number) {
    setPhones((rows) =>
      rows.map((row, i) => ({ ...row, isPreferred: i === index })),
    )
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Name is required')
      return
    }

    const emailPayload = emails
      .map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        address: row.address.trim(),
        type: row.type,
        isPreferred: row.isPreferred,
      }))
      .filter((row) => row.address.length > 0)

    const phonePayload = phones
      .map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        number: row.number.trim(),
        type: row.type,
        isPreferred: row.isPreferred,
      }))
      .filter((row) => row.number.length > 0)

    setSaving(true)
    try {
      if (mode === 'create') {
        const response = await apiFetch<VendorDetail>('/vendor', {
          method: 'POST',
          body: JSON.stringify({
            name: trimmedName,
            address: address.trim(),
            npwp: npwp.trim(),
            emails: emailPayload,
            phones: phonePayload,
          }),
        })
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to create Vendor')
          return
        }
        toast.success('Vendor created')
        void navigate({
          to: '/dashboard/vendors/$vendorId',
          params: { vendorId: response.data.id },
        })
        return
      }

      if (!vendorId) return
      const response = await apiFetch<VendorDetail>(
        `/vendor/${vendorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: trimmedName,
            address: address.trim(),
            npwp: npwp.trim(),
            emails: emailPayload,
            phones: phonePayload,
          }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update Vendor')
        return
      }
      toast.success('Vendor saved')
      setEmails(
        response.data.emails.map((e) => ({
          id: e.id,
          address: e.address,
          type: e.type,
          isPreferred: e.isPreferred,
        })),
      )
      setPhones(
        response.data.phones.map((p) => ({
          id: p.id,
          number: p.number,
          type: p.type,
          isPreferred: p.isPreferred,
        })),
      )
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function setVendorActive(next: boolean) {
    if (!canManage || !vendorId) return
    setSaving(true)
    try {
      const response = await apiFetch<VendorDetail>(
        `/vendor/${vendorId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update Vendor')
        return
      }
      setIsActive(response.data.isActive)
      toast.success(next ? 'Vendor enabled' : 'Vendor disabled')
      setDisableConfirmOpen(false)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  function onToggleActiveClick() {
    if (!canManage || !vendorId) return
    if (isActive) {
      setDisableConfirmOpen(true)
      return
    }
    void setVendorActive(true)
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-8 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading Vendor…
      </div>
    )
  }

  const readOnly = !canManage

  const contactInputClassName = cn(
    inputClassNameCompact,
    'h-8 min-w-0 flex-1 px-2 py-1 text-sm',
  )

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">
          {mode === 'create' ? 'New Vendor' : 'Vendor'}
        </h1>
        <p className={`mt-2 ${hintClassName}`}>
          Name, address, NPWP, and contact emails / phones.
          {mode === 'edit'
            ? isActive
              ? ' This Vendor is enabled.'
              : ' This Vendor is disabled.'
            : ''}
        </p>
      </div>

      <section className="max-w-2xl space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClassName}
            required
            disabled={readOnly}
            autoComplete="organization"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Address</span>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={cn(inputClassName, 'min-h-24 resize-y')}
            disabled={readOnly}
            autoComplete="street-address"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">NPWP</span>
          <input
            value={npwp}
            onChange={(e) => setNpwp(e.target.value)}
            className={inputClassName}
            disabled={readOnly}
            autoComplete="off"
          />
        </label>
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-0">
        <section className="min-w-0 space-y-2 md:pr-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Emails</h2>
            {!readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  setEmails((rows) => [
                    ...rows,
                    {
                      address: '',
                      type: 'work',
                      isPreferred: rows.length === 0,
                    },
                  ])
                }
              >
                <Plus />
                Add
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1.5">
            {emails.map((row, index) => (
              <li
                key={row.id ?? `email-${index}`}
                className="flex flex-row items-center gap-1"
              >
                <Select
                  value={row.type}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value == null) return
                    const type = value as EmailType
                    setEmails((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, type } : r)),
                    )
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-24 shrink-0"
                    aria-label="Email type"
                  >
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="email"
                  value={row.address}
                  disabled={readOnly}
                  onChange={(e) => {
                    const addressValue = e.target.value
                    setEmails((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, address: addressValue } : r,
                      ),
                    )
                  }}
                  placeholder="email@example.com"
                  className={contactInputClassName}
                />
                <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--muted)]">
                  <Checkbox
                    checked={row.isPreferred}
                    disabled={readOnly}
                    onCheckedChange={(checked) => {
                      if (checked === true) setPreferredEmail(index)
                      else setPreferredEmail(0)
                    }}
                    aria-label="Preferred email"
                  />
                  <span className="hidden lg:inline">Pref</span>
                </label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-[var(--muted)] hover:text-red-700"
                    aria-label="Remove email"
                    onClick={() =>
                      setEmails((rows) => {
                        const next = rows.filter((_, i) => i !== index)
                        if (next.length === 0) return [emptyEmail()]
                        if (!next.some((r) => r.isPreferred)) {
                          next[0] = { ...next[0], isPreferred: true }
                        }
                        return next
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <div
          className="h-px bg-[var(--line)] md:mx-0 md:h-auto md:w-px md:self-stretch"
          aria-hidden
        />

        <section className="min-w-0 space-y-2 md:pl-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Phones</h2>
            {!readOnly ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() =>
                  setPhones((rows) => [
                    ...rows,
                    {
                      number: '',
                      type: 'personal',
                      isPreferred: rows.length === 0,
                    },
                  ])
                }
              >
                <Plus />
                Add
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1.5">
            {phones.map((row, index) => (
              <li
                key={row.id ?? `phone-${index}`}
                className="flex flex-row items-center gap-1"
              >
                <Select
                  value={row.type}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value == null) return
                    const type = value as PhoneType
                    setPhones((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, type } : r)),
                    )
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-28 shrink-0"
                    aria-label="Phone type"
                  >
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PHONE_TYPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="tel"
                  value={row.number}
                  disabled={readOnly}
                  onChange={(e) => {
                    const number = e.target.value
                    setPhones((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, number } : r,
                      ),
                    )
                  }}
                  placeholder="Phone number"
                  className={contactInputClassName}
                />
                <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--muted)]">
                  <Checkbox
                    checked={row.isPreferred}
                    disabled={readOnly}
                    onCheckedChange={(checked) => {
                      if (checked === true) setPreferredPhone(index)
                      else setPreferredPhone(0)
                    }}
                    aria-label="Preferred phone"
                  />
                  <span className="hidden lg:inline">Pref</span>
                </label>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-[var(--muted)] hover:text-red-700"
                    aria-label="Remove phone"
                    onClick={() =>
                      setPhones((rows) => {
                        const next = rows.filter((_, i) => i !== index)
                        if (next.length === 0) return [emptyPhone()]
                        if (!next.some((r) => r.isPreferred)) {
                          next[0] = { ...next[0], isPreferred: true }
                        }
                        return next
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canManage ? (
          <button
            type="submit"
            disabled={saving}
            className={cn(buttonClassName, 'inline-flex items-center gap-2')}
          >
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : null}
            {mode === 'create' ? 'Create' : 'Save'}
          </button>
        ) : null}
        <button
          type="button"
          className={buttonOutlineClassName}
          onClick={() => void navigate({ to: '/dashboard/vendors' })}
        >
          Back
        </button>
        {mode === 'edit' && canManage ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onToggleActiveClick}
          >
            {isActive ? 'Disable' : 'Enable'}
          </Button>
        ) : null}
      </div>

      <ConfirmDisableDialog
        open={disableConfirmOpen}
        title="Disable Vendor?"
        description={
          name.trim()
            ? `“${name.trim()}” will be disabled and can be enabled again later.`
            : 'This Vendor will be disabled and can be enabled again later.'
        }
        busy={saving}
        onOpenChange={setDisableConfirmOpen}
        onConfirm={() => {
          void setVendorActive(false)
        }}
      />
    </form>
  )
}
