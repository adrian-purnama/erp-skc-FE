import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import toast from 'react-hot-toast'
import {
  Ban,
  Building2,
  Check,
  CircleCheck,
  FileDigit,
  ListFilter,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react'
import ConfirmDisableDialog from '#/components/forms/shared/ConfirmDisableDialog'
import ListTable, {
  ListChip,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
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
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props =
  | { mode: 'list' }
  | {
      mode: 'create'
      onCreated?: () => void
      onCancel?: () => void
    }
  | {
      mode: 'edit'
      vendorId: string
      onSaved?: () => void
      onCancel?: () => void
    }

type VendorDrawer =
  null | { mode: 'create' } | { mode: 'edit'; vendorId: string }

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
      onCreated={props.mode === 'create' ? props.onCreated : undefined}
      onSaved={props.mode === 'edit' ? props.onSaved : undefined}
      onCancel={props.onCancel}
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
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<VendorListItem[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [drawer, setDrawer] = useState<VendorDrawer>(null)
  const [pendingDisable, setPendingDisable] = useState<VendorListItem | null>(
    null,
  )
  const [toggling, setToggling] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch<VendorListItem[]>('/vendor')
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to load Vendors')
        return
      }
      setResults(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const setActive = useCallback(
    async (vendor: VendorListItem, next: boolean) => {
      setToggling(true)
      try {
        const response = await apiFetch<VendorDetail>(`/vendor/${vendor.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        })
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

  const {
    pageItems,
    totalPages,
    page: safePage,
  } = useMemo(
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
        icon: Building2,
        widthClassName: 'min-w-[14rem]',
        cellClassName: 'font-medium',
        cell: (vendor) => vendor.name,
        copyValue: (vendor) => vendor.name,
      },
      {
        header: 'Address',
        icon: MapPin,
        widthClassName: 'min-w-[12rem]',
        cell: (vendor) => vendor.address || '—',
        copyValue: (vendor) => vendor.address,
      },
      {
        header: 'NPWP',
        icon: FileDigit,
        widthClassName: 'w-36',
        cellClassName: 'whitespace-nowrap tabular-nums',
        cell: (vendor) => vendor.npwp || '—',
        copyValue: (vendor) => vendor.npwp,
      },
      {
        header: 'Status',
        icon: ToggleRight,
        widthClassName: 'w-28',
        cell: (vendor) =>
          vendor.isActive ? (
            <ListChip tone="success" icon={Check}>
              Enabled
            </ListChip>
          ) : (
            <ListChip tone="danger" icon={X}>
              Disabled
            </ListChip>
          ),
      },
      {
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-56 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (vendor) => (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawer({ mode: 'edit', vendorId: vendor.id })}
            >
              <Pencil />
              Edit
            </Button>
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={toggling}
                className={
                  vendor.isActive
                    ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700'
                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                }
                onClick={() => {
                  if (vendor.isActive) {
                    setPendingDisable(vendor)
                    return
                  }
                  void setActive(vendor, true)
                }}
              >
                {vendor.isActive ? <Ban /> : <CircleCheck />}
                {vendor.isActive ? 'Disable' : 'Enable'}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [canManage, setActive, toggling],
  )

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={pageTitleClassName}>Vendor Master Data</h1>
            <p className={`mt-2 ${hintClassName}`}>
              Browse Vendors. Open one to view details
              {canManage ? ', or create and edit' : ''}.
            </p>
          </div>
        </div>
      </div>

      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {filtered.length} {filtered.length === 1 ? 'Vendor' : 'Vendors'}
            </span>
          )
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search…',
          'aria-label': 'Search Vendors',
        }}
        toolbarActions={[
          {
            key: 'filter',
            label: 'Filter',
            icon: ListFilter,
            active: statusFilter !== 'all',
            popover: (
              <>
                <p className="text-xs font-medium text-(--muted)">Status</p>
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
                  className="w-full"
                />
              </>
            ),
          },
        ]}
        addAction={
          canManage
            ? {
                label: 'Add',
                onClick: () => setDrawer({ mode: 'create' }),
              }
            : undefined
        }
        isRowMuted={(vendor) => !vendor.isActive}
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

      <Sheet
        open={drawer !== null}
        onOpenChange={(open) => {
          if (!open) setDrawer(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>
              {drawer?.mode === 'edit' ? 'Edit vendor' : 'New vendor'}
            </SheetTitle>
            <SheetDescription>
              {drawer?.mode === 'edit'
                ? 'Update this vendor without leaving the list.'
                : 'Add a vendor without leaving this list.'}
            </SheetDescription>
          </SheetHeader>
          {drawer?.mode === 'create' ? (
            <div className="px-4 pb-4">
              <VendorForm
                mode="create"
                onCreated={() => {
                  setDrawer(null)
                  void reload()
                }}
                onCancel={() => setDrawer(null)}
              />
            </div>
          ) : null}
          {drawer?.mode === 'edit' ? (
            <div className="px-4 pb-4">
              <VendorForm
                mode="edit"
                vendorId={drawer.vendorId}
                onSaved={() => {
                  setDrawer(null)
                  void reload()
                }}
                onCancel={() => setDrawer(null)}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function VendorEditor({
  mode,
  vendorId,
  canManage,
  onCreated,
  onSaved,
  onCancel,
}: {
  mode: 'create' | 'edit'
  vendorId?: string
  canManage: boolean
  onCreated?: () => void
  onSaved?: () => void
  onCancel?: () => void
}) {
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
        const response = await apiFetch<VendorDetail>(`/vendor/${vendorId}`)
        if (!response.success || !response.data) {
          toast.error(response.message || 'Vendor not found')
          onCancel?.()
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
  }, [mode, vendorId, onCancel])

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
        onCreated?.()
        return
      }

      if (!vendorId) return
      const response = await apiFetch<VendorDetail>(`/vendor/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          address: address.trim(),
          npwp: npwp.trim(),
          emails: emailPayload,
          phones: phonePayload,
        }),
      })
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update Vendor')
        return
      }
      toast.success('Vendor saved')
      onSaved?.()
      return
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
      const response = await apiFetch<VendorDetail>(`/vendor/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: next }),
      })
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

      <div className="space-y-6">
        <section className="min-w-0 space-y-2">
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
                <Combobox
                  value={row.type}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value == null) return
                    const type = value as EmailType
                    setEmails((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, type } : r)),
                    )
                  }}
                  options={EMAIL_TYPES.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  placeholder="Type"
                  className="w-24 shrink-0"
                  aria-label="Email type"
                />
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

        <section className="min-w-0 space-y-2">
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
                <Combobox
                  value={row.type}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value == null) return
                    const type = value as PhoneType
                    setPhones((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, type } : r)),
                    )
                  }}
                  options={PHONE_TYPES.map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  placeholder="Type"
                  className="w-28 shrink-0"
                  aria-label="Phone type"
                />
                <input
                  type="tel"
                  value={row.number}
                  disabled={readOnly}
                  onChange={(e) => {
                    const number = e.target.value
                    setPhones((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, number } : r)),
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
          onClick={() => onCancel?.()}
        >
          Cancel
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
