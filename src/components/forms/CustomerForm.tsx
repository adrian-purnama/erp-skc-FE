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
  type CustomerDetail,
  type CustomerEmail,
  type CustomerListItem,
  type CustomerPhone,
  type EmailType,
  type PhoneType,
} from '#/lib/customer'
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
  | { mode: 'edit'; customerId: string }

function emptyEmail(): CustomerEmail {
  return { address: '', type: 'work', isPreferred: true }
}

function emptyPhone(): CustomerPhone {
  return { number: '', type: 'personal', isPreferred: true }
}

export default function CustomerForm(props: Props) {
  const { can } = useAuth()
  const canManage = can('customer.manage')

  if (props.mode === 'list') {
    return <CustomerList canManage={canManage} />
  }

  return (
    <CustomerEditor
      mode={props.mode}
      customerId={props.mode === 'edit' ? props.customerId : undefined}
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

function CustomerList({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<CustomerListItem[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pendingDisable, setPendingDisable] = useState<CustomerListItem | null>(
    null,
  )
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const response = await apiFetch<CustomerListItem[]>('/customer')
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Failed to load customers')
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
    async (customer: CustomerListItem, next: boolean) => {
      setToggling(true)
      try {
        const response = await apiFetch<CustomerDetail>(
          `/customer/${customer.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ isActive: next }),
          },
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to update customer')
          return
        }
        setResults((rows) =>
          rows.map((row) =>
            row.id === customer.id
              ? { ...row, isActive: response.data!.isActive }
              : row,
          ),
        )
        toast.success(next ? 'Customer enabled' : 'Customer disabled')
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

  const customerColumns = useMemo<ListTableColumn<CustomerListItem>[]>(
    () => [
      {
        header: 'Name',
        cellClassName: 'font-medium',
        cell: (customer) => customer.name,
      },
      {
        header: 'Address',
        cellClassName: hintClassName,
        cell: (customer) => customer.address || '—',
      },
      {
        header: 'NPWP',
        cellClassName: hintClassName,
        cell: (customer) => customer.npwp || '—',
      },
      {
        header: 'Status',
        cell: (customer) => <StatusPill active={customer.isActive} />,
      },
      {
        header: '',
        cellClassName: 'text-right',
        cell: (customer) => (
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
                    to: '/dashboard/customers/$customerId',
                    params: { customerId: customer.id },
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
                      if (customer.isActive) {
                        setPendingDisable(customer)
                        return
                      }
                      void setActive(customer, true)
                    }}
                  >
                    {customer.isActive ? (
                      <Ban className="size-4" aria-hidden />
                    ) : (
                      <CircleCheck className="size-4" aria-hidden />
                    )}
                    {customer.isActive ? 'Disable' : 'Enable'}
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
          Master Data / Customer Master Data
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">
              Customer Master Data
            </h1>
            <p className={`mt-2 ${hintClassName}`}>
              Browse customers. Open one to view details
              {canManage ? ', or create and edit' : ''}.
            </p>
          </div>
          {canManage ? (
            <Link
              to="/dashboard/customers/new"
              className={cn(
                buttonClassName,
                'inline-flex items-center gap-2 no-underline',
              )}
            >
              <Plus className="size-4" aria-hidden />
              New customer
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
              aria-label="Filter customers"
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
        loadingLabel="Loading customers…"
        empty={
          debounced.trim() || statusFilter !== 'all'
            ? 'No customers match the current filters.'
            : 'No customers yet.'
        }
        columns={customerColumns}
        rows={pageItems}
        rowKey={(customer) => customer.id}
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
        title="Disable customer?"
        description={
          pendingDisable
            ? `“${pendingDisable.name}” will be disabled and can be enabled again later.`
            : 'This customer will be disabled and can be enabled again later.'
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

function CustomerEditor({
  mode,
  customerId,
  canManage,
}: {
  mode: 'create' | 'edit'
  customerId?: string
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
  const [emails, setEmails] = useState<CustomerEmail[]>([emptyEmail()])
  const [phones, setPhones] = useState<CustomerPhone[]>([emptyPhone()])

  useEffect(() => {
    if (mode !== 'edit' || !customerId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const response = await apiFetch<CustomerDetail>(
          `/customer/${customerId}`,
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Customer not found')
          void navigate({ to: '/dashboard/customers' })
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
  }, [mode, customerId, navigate])

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
        const response = await apiFetch<CustomerDetail>('/customer', {
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
          toast.error(response.message || 'Failed to create customer')
          return
        }
        toast.success('Customer created')
        void navigate({
          to: '/dashboard/customers/$customerId',
          params: { customerId: response.data.id },
        })
        return
      }

      if (!customerId) return
      const response = await apiFetch<CustomerDetail>(
        `/customer/${customerId}`,
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
        toast.error(response.message || 'Failed to update customer')
        return
      }
      toast.success('Customer saved')
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

  async function setCustomerActive(next: boolean) {
    if (!canManage || !customerId) return
    setSaving(true)
    try {
      const response = await apiFetch<CustomerDetail>(
        `/customer/${customerId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to update customer')
        return
      }
      setIsActive(response.data.isActive)
      toast.success(next ? 'Customer enabled' : 'Customer disabled')
      setDisableConfirmOpen(false)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  function onToggleActiveClick() {
    if (!canManage || !customerId) return
    if (isActive) {
      setDisableConfirmOpen(true)
      return
    }
    void setCustomerActive(true)
  }

  if (loading) {
    return (
      <div className={`flex items-center gap-2 py-8 ${hintClassName}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading customer…
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
          {mode === 'create' ? 'New customer' : 'Customer'}
        </h1>
        <p className={`mt-2 ${hintClassName}`}>
          Name, address, NPWP, and contact emails / phones.
          {mode === 'edit'
            ? isActive
              ? ' This customer is enabled.'
              : ' This customer is disabled.'
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
          onClick={() => void navigate({ to: '/dashboard/customers' })}
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
        title="Disable customer?"
        description={
          name.trim()
            ? `“${name.trim()}” will be disabled and can be enabled again later.`
            : 'This customer will be disabled and can be enabled again later.'
        }
        busy={saving}
        onOpenChange={setDisableConfirmOpen}
        onConfirm={() => {
          void setCustomerActive(false)
        }}
      />
    </form>
  )
}
