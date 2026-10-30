import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Building2,
  CalendarClock,
  CircleDot,
  Factory,
  FolderKanban,
  Handshake,
  Hash,
  LoaderCircle,
  Milestone,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import ListTable, {
  ListChip,
  ListProgress,
  ListSearchInput,
  type ListChipTone,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import ProjectListOverview from '#/components/forms/ProjectListOverview'
import { formatJakartaDate } from '#/lib/projectCalendar'
import { formatRupiah } from '#/lib/quotation'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type { CustomerListItem } from '#/lib/customer'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import ProjectStatusChip from '#/components/forms/ProjectStatusChip'
import {
  PROJECT_CLOSE_REASON_LABELS,
  PROJECT_CLOSE_REASONS,
  PROJECT_GENDERS,
  PROJECT_LOSE_REASON_LABELS,
  PROJECT_LOSE_REASONS,
  PROJECT_STATUS_LABELS,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUSES,
  formatRupiahCompact,
  isProjectActive,
  isProjectOverBudget,
  isProjectOverdue,
  phaseForStatus,
  type ProjectCloseReason,
  type ProjectDetail,
  type ProjectGender,
  type ProjectListRow,
  type ProjectLoseReason,
  type ProjectPhase,
  type ProjectStatus,
} from '#/lib/project'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  hintClassName,
  inputClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props =
  { mode: 'list' } | { mode: 'create' } | { mode: 'edit'; projectId: string }

type ContactRow = { key: string; value: string }

function emptyContactRow(): ContactRow {
  return { key: '', value: '' }
}

function contactRecordToRows(
  contact: Record<string, string> | undefined,
): ContactRow[] {
  const entries = Object.entries(contact ?? {})
  if (entries.length === 0) return [emptyContactRow()]
  return entries.map(([key, value]) => ({ key, value }))
}

function rowsToContactRecord(rows: ContactRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!key) continue
    out[key] = row.value.trim()
  }
  return out
}

export default function ProjectForm(props: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')

  if (props.mode === 'list') {
    return <ProjectList canManage={canManage} />
  }

  return (
    <ProjectEditor
      mode={props.mode}
      projectId={props.mode === 'edit' ? props.projectId : undefined}
      canManage={canManage}
    />
  )
}

const PHASE_TONES: Record<ProjectPhase, ListChipTone> = {
  tender: 'info',
  internal: 'warning',
  production: 'neutral',
  aftersales: 'success',
}

function phaseOf(project: ProjectListRow): ProjectPhase {
  return phaseForStatus(project.status, project.productionReleasedAt)
}

type StatusFilter = 'active' | 'all' | ProjectStatus

function ProjectList({ canManage }: { canManage: boolean }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<ProjectListRow[]>([])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const response = await apiFetch<ProjectListRow[]>('/project')
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Failed to load projects')
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

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    return results.filter((row) => {
      if (statusFilter === 'active' && !isProjectActive(row.status)) {
        return false
      }
      if (
        statusFilter !== 'active' &&
        statusFilter !== 'all' &&
        row.status !== statusFilter
      ) {
        return false
      }
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.projectNumber.toLowerCase().includes(q) ||
        (row.customerName ?? '').toLowerCase().includes(q)
      )
    })
  }, [results, debounced, statusFilter])

  const statusFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active (open + win)' },
      ...PROJECT_STATUSES.map((value) => ({
        value,
        label: PROJECT_STATUS_LABELS[value],
      })),
    ],
    [],
  )

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

  const columns = useMemo<ListTableColumn<ProjectListRow>[]>(
    () => [
      {
        header: 'Number',
        icon: Hash,
        cellClassName: 'font-medium tabular-nums whitespace-nowrap',
        cell: (project) => project.projectNumber,
        copyValue: (project) => project.projectNumber,
      },
      {
        header: 'Name',
        icon: FolderKanban,
        widthClassName: 'min-w-48',
        cell: (project) => (
          <div className="min-w-0">
            <div className="font-medium">{project.name}</div>
            <div className={cn('text-xs', hintClassName)}>
              {project.summary.shopDrawingCount} shop drawing item
              {project.summary.shopDrawingCount === 1 ? '' : 's'}
            </div>
          </div>
        ),
      },
      {
        header: 'Customer',
        icon: Building2,
        cellClassName: hintClassName,
        cell: (project) => project.customerName || '—',
      },
      {
        header: 'Phase',
        icon: Milestone,
        cell: (project) => (
          <ListChip dot tone={PHASE_TONES[phaseOf(project)]}>
            {PROJECT_PHASE_LABELS[phaseOf(project)]}
          </ListChip>
        ),
      },
      {
        header: 'Contract',
        icon: Handshake,
        align: 'right',
        cellClassName: 'whitespace-nowrap',
        cell: (project) =>
          project.summary.contractValue ? (
            <div>
              <div>{formatRupiah(project.summary.contractValue)}</div>
              <div className={cn('text-xs', hintClassName)}>
                {project.summary.contractStatus === 'won'
                  ? 'Won'
                  : 'Quoted'}
                {project.summary.plannedMargin !== null
                  ? ` · margin ${formatRupiahCompact(project.summary.plannedMargin)}`
                  : ''}
              </div>
            </div>
          ) : (
            <span className={hintClassName}>—</span>
          ),
      },
      {
        header: 'Budget used',
        icon: Wallet,
        widthClassName: 'min-w-40',
        cell: (project) => {
          const rab = Number(project.summary.rabTotal ?? '')
          if (!Number.isFinite(rab) || rab <= 0) {
            return <span className={hintClassName}>No RAB yet</span>
          }
          const actual = Number(project.summary.actualCost)
          const over = isProjectOverBudget(project)
          return (
            <div className="space-y-0.5">
              <ListProgress
                percent={(actual / rab) * 100}
                tone={over ? 'danger' : 'neutral'}
              />
              <div className={cn('text-xs tabular-nums', hintClassName)}>
                {formatRupiahCompact(actual)} /{' '}
                {formatRupiahCompact(rab)}
                {project.summary.rabStatus === 'draft' ? ' · draft' : ''}
              </div>
            </div>
          )
        },
      },
      {
        header: 'Production',
        icon: Factory,
        widthClassName: 'min-w-36',
        cell: (project) =>
          project.productionReleasedAt ? (
            <ListProgress
              percent={project.summary.productionPercent}
              tone={
                project.summary.productionPercent >= 100 ? 'success' : 'neutral'
              }
            />
          ) : (
            <span className={hintClassName}>Not released</span>
          ),
      },
      {
        header: 'Deadline',
        icon: CalendarClock,
        cellClassName: 'whitespace-nowrap',
        cell: (project) => {
          if (!project.summary.deadline) {
            return <span className={hintClassName}>—</span>
          }
          const overdue = isProjectOverdue(project)
          return (
            <div title={project.summary.deadlineTitle ?? undefined}>
              <div
                className={cn(
                  'tabular-nums',
                  overdue && 'font-medium text-red-700 dark:text-red-400',
                )}
              >
                {formatJakartaDate(project.summary.deadline)}
              </div>
              <div className={cn('max-w-40 truncate text-xs', hintClassName)}>
                {overdue ? 'Overdue · ' : ''}
                {project.summary.deadlineTitle}
              </div>
            </div>
          )
        },
      },
      {
        header: 'Status',
        icon: CircleDot,
        cell: (project) => (
          <ProjectStatusChip status={project.status ?? 'open'} />
        ),
      },
    ],
    [],
  )

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className={pageTitleClassName}>Project Dashboard</h1>
            <p className={`mt-2 ${hintClassName}`}>
              Select a project to open its dashboard
              {canManage ? ', or create a new one' : ''}.
            </p>
          </div>
          {canManage ? (
            <Link
              to="/dashboard/projects/new"
              className={cn(
                buttonClassName,
                'inline-flex items-center gap-2 no-underline',
              )}
            >
              <Plus className="size-4" aria-hidden />
              New project
            </Link>
          ) : null}
        </div>
      </div>

      <ProjectListOverview rows={results} loading={loading} />

      <ListTable
        filters={
          <>
            <ListSearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter name, number or customer…"
              aria-label="Filter projects"
            />
            <Combobox
              value={statusFilter}
              onValueChange={(value) => {
                if (value) setStatusFilter(value as StatusFilter)
              }}
              options={statusFilterOptions}
              placeholder="Status"
              searchPlaceholder="Search status…"
              emptyText="No status found."
              aria-label="Filter by status"
              className="w-48 shrink-0"
            />
          </>
        }
        loading={loading}
        loadingLabel="Loading projects…"
        empty={
          debounced.trim() || statusFilter !== 'all'
            ? 'No projects match the current filter.'
            : 'No projects yet.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(project) => project.id}
        minWidthClassName="min-w-[1100px]"
        isRowMuted={(project) =>
          project.status === 'lose' || project.status === 'close'
        }
        onRowClick={(project) =>
          void navigate({
            to: '/dashboard/projects/$projectId',
            params: { projectId: project.id },
          })
        }
        pagination={{
          page: safePage,
          totalPages,
          totalItems: filtered.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}

function ProjectEditor({
  mode,
  projectId,
  canManage,
}: {
  mode: 'create' | 'edit'
  projectId?: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [assignedCustomerName, setAssignedCustomerName] = useState('')
  const [contactName, setContactName] = useState('')
  const [gender, setGender] = useState<ProjectGender>('male')
  const [contactRows, setContactRows] = useState<ContactRow[]>([
    emptyContactRow(),
  ])
  const [status, setStatus] = useState<ProjectStatus>('open')
  const [loseReason, setLoseReason] = useState<ProjectLoseReason | ''>('')
  const [closeReason, setCloseReason] = useState<ProjectCloseReason | ''>('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await apiFetch<CustomerListItem[]>('/customer/active')
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Failed to load customers')
          }
          return
        }
        if (!cancelled) setCustomers(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (mode !== 'edit' || !projectId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const response = await apiFetch<ProjectDetail>(`/project/${projectId}`)
        if (!response.success || !response.data) {
          toast.error(response.message || 'Project not found')
          void navigate({ to: '/dashboard/projects' })
          return
        }
        if (cancelled) return
        const data = response.data
        setName(data.name)
        setDescription(data.description ?? '')
        setProjectNumber(data.projectNumber)
        setCustomerId(data.customerId)
        setAssignedCustomerName(data.customerName ?? '')
        setContactName(data.customerContact.name)
        setGender(data.customerContact.gender)
        setContactRows(contactRecordToRows(data.customerContact.contact))
        setStatus(data.status ?? 'open')
        setLoseReason(data.loseReason ?? '')
        setCloseReason(data.closeReason ?? '')
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, projectId, navigate])

  const customerOptions = useMemo(() => {
    const options = customers.map((c) => ({ value: c.id, label: c.name }))
    // Keep the project's customer selectable even if it was disabled later,
    // so projects already using it still show it and remain saveable.
    if (customerId && !options.some((option) => option.value === customerId)) {
      options.push({
        value: customerId,
        label: assignedCustomerName || 'Unknown customer',
      })
    }
    return options
  }, [customers, customerId, assignedCustomerName])

  const statusOptions = useMemo(
    () =>
      PROJECT_STATUSES.map((value) => ({
        value,
        label: PROJECT_STATUS_LABELS[value],
      })),
    [],
  )

  const loseReasonOptions = useMemo(
    () =>
      PROJECT_LOSE_REASONS.map((value) => ({
        value,
        label: PROJECT_LOSE_REASON_LABELS[value],
      })),
    [],
  )

  const closeReasonOptions = useMemo(
    () =>
      PROJECT_CLOSE_REASONS.map((value) => ({
        value,
        label: PROJECT_CLOSE_REASON_LABELS[value],
      })),
    [],
  )

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Name is required')
      return
    }
    if (!customerId) {
      toast.error('Customer is required')
      return
    }
    const trimmedContactName = contactName.trim()
    if (!trimmedContactName) {
      toast.error('Contact name is required')
      return
    }
    if (status === 'lose' && !loseReason) {
      toast.error('Lose reason is required')
      return
    }
    if (status === 'close' && !closeReason) {
      toast.error('Close reason is required')
      return
    }

    const body = {
      name: trimmedName,
      description: description.trim(),
      customerId,
      customerContact: {
        name: trimmedContactName,
        gender,
        contact: rowsToContactRecord(contactRows),
      },
      status,
      loseReason: status === 'lose' ? loseReason : null,
      closeReason: status === 'close' ? closeReason : null,
    }

    setSaving(true)
    try {
      const response =
        mode === 'create'
          ? await apiFetch<ProjectDetail>('/project', {
              method: 'POST',
              body: JSON.stringify(body),
            })
          : await apiFetch<ProjectDetail>(`/project/${projectId}`, {
              method: 'PATCH',
              body: JSON.stringify(body),
            })

      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to save project')
        return
      }

      toast.success(mode === 'create' ? 'Project created' : 'Project updated')
      void navigate({
        to: '/dashboard/projects/$projectId',
        params: { projectId: response.data.id },
      })
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading project…
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>
          {mode === 'create' ? 'New project' : 'Edit project'}
        </h1>
        <p className={`mt-2 ${hintClassName}`}>
          {mode === 'create'
            ? 'Project number is assigned automatically on save.'
            : 'Project number cannot be changed.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="max-w-xl space-y-6">
        {mode === 'edit' ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Project number</span>
            <input
              className={cn(inputClassName, 'tabular-nums')}
              value={projectNumber}
              readOnly
              disabled
            />
          </label>
        ) : null}

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Name</span>
          <input
            className={inputClassName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canManage || saving}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Description</span>
          <textarea
            className={cn(inputClassName, 'min-h-24')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManage || saving}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Customer</span>
          <Combobox
            value={customerId}
            onValueChange={setCustomerId}
            options={customerOptions}
            placeholder="Select customer…"
            searchPlaceholder="Search customers…"
            emptyText="No customers found."
            aria-label="Customer"
            className="sm:w-full"
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Status</span>
          <Combobox
            value={status}
            onValueChange={(value) => {
              if (PROJECT_STATUSES.includes(value as ProjectStatus)) {
                const next = value as ProjectStatus
                setStatus(next)
                if (next !== 'lose') setLoseReason('')
                if (next !== 'close') setCloseReason('')
              }
            }}
            options={statusOptions}
            placeholder="Select status…"
            searchPlaceholder="Search status…"
            emptyText="No status found."
            aria-label="Status"
            className="sm:w-full"
          />
        </div>

        {status === 'lose' ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Lose reason</span>
            <Combobox
              value={loseReason}
              onValueChange={(value) => {
                if (PROJECT_LOSE_REASONS.includes(value as ProjectLoseReason)) {
                  setLoseReason(value as ProjectLoseReason)
                }
              }}
              options={loseReasonOptions}
              placeholder="Select lose reason…"
              searchPlaceholder="Search reason…"
              emptyText="No reason found."
              aria-label="Lose reason"
              className="sm:w-full"
            />
          </div>
        ) : null}

        {status === 'close' ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Close reason</span>
            <Combobox
              value={closeReason}
              onValueChange={(value) => {
                if (
                  PROJECT_CLOSE_REASONS.includes(value as ProjectCloseReason)
                ) {
                  setCloseReason(value as ProjectCloseReason)
                }
              }}
              options={closeReasonOptions}
              placeholder="Select close reason…"
              searchPlaceholder="Search reason…"
              emptyText="No reason found."
              aria-label="Close reason"
              className="sm:w-full"
            />
          </div>
        ) : null}

        <fieldset className="space-y-4 rounded-md border border-(--line) p-4">
          <legend className="px-1 text-sm font-medium">Customer contact</legend>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <input
              className={inputClassName}
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={!canManage || saving}
              required
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Gender</span>
            <Combobox
              value={gender}
              onValueChange={(value) => {
                if (PROJECT_GENDERS.includes(value as ProjectGender)) {
                  setGender(value as ProjectGender)
                }
              }}
              options={PROJECT_GENDERS.map((g) => ({
                value: g,
                label: g === 'male' ? 'Male' : 'Female',
              }))}
              placeholder="Gender"
              className="w-full"
              disabled={!canManage || saving}
              aria-label="Gender"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Contact fields</span>
              {canManage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setContactRows((rows) => [...rows, emptyContactRow()])
                  }
                  disabled={saving}
                >
                  <Plus className="size-4" aria-hidden />
                  Add field
                </Button>
              ) : null}
            </div>
            <p className={hintClassName}>
              Custom key/value pairs (e.g. email, phone1).
            </p>
            <div className="space-y-2">
              {contactRows.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <input
                    className={cn(inputClassName, 'min-w-0 flex-1')}
                    placeholder="key"
                    value={row.key}
                    onChange={(e) =>
                      setContactRows((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, key: e.target.value } : r,
                        ),
                      )
                    }
                    disabled={!canManage || saving}
                  />
                  <input
                    className={cn(inputClassName, 'min-w-0 flex-1')}
                    placeholder="value"
                    value={row.value}
                    onChange={(e) =>
                      setContactRows((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                    disabled={!canManage || saving}
                  />
                  {canManage && contactRows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() =>
                        setContactRows((rows) =>
                          rows.filter((_, i) => i !== index),
                        )
                      }
                      disabled={saving}
                      aria-label="Remove contact field"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <button type="submit" className={buttonClassName} disabled={saving}>
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  Saving…
                </span>
              ) : mode === 'create' ? (
                'Create project'
              ) : (
                'Save changes'
              )}
            </button>
          ) : null}
          {mode === 'edit' && projectId ? (
            <Link
              to="/dashboard/projects/$projectId"
              params={{ projectId }}
              className={cn(buttonOutlineClassName, 'no-underline')}
            >
              Cancel
            </Link>
          ) : (
            <Link
              to="/dashboard/projects"
              className={cn(buttonOutlineClassName, 'no-underline')}
            >
              Back
            </Link>
          )}
        </div>
      </form>
    </div>
  )
}
