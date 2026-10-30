import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  KeyRound,
  MoreHorizontal,
  Shield,
  Users,
  Layers,
} from 'lucide-react'
import ListTable, {
  ListChip,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useAuth } from '#/context/authContext'
import type { AdminRole } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { hintClassName } from '#/lib/ui-classes'

export default function RolesAdminForm() {
  const { can } = useAuth()
  const canManage = can('admin.role.manage')
  const navigate = useNavigate()
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 250)
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<AdminRole | null>(null)
  const [deleting, setDeleting] = useState(false)

  const roleNameByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const role of roles) map.set(role.key, role.name)
    return map
  }, [roles])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch<AdminRole[]>('/admin/roles')
      if (!response.success || !response.data) {
        setError(response.message || 'Failed to load roles')
        return
      }
      setRoles(response.data)
    } catch {
      setError('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return roles
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q),
    )
  }, [roles, debounced])

  useEffect(() => {
    setPage(1)
  }, [debounced])

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginate(filtered, page, DEFAULT_PAGE_SIZE),
    [filtered, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  async function confirmDelete() {
    if (!deleteTarget) return
    const force = deleteTarget.assignedUserCount > 0
    setDeleting(true)
    try {
      const path = force
        ? `/admin/roles/${deleteTarget.key}?force=true`
        : `/admin/roles/${deleteTarget.key}`
      const response = await apiFetch(path, { method: 'DELETE' })
      if (!response.success) {
        if (
          response.data &&
          typeof response.data === 'object' &&
          'assignedUserCount' in response.data
        ) {
          toast.error(
            `Assigned to ${(response.data as { assignedUserCount: number }).assignedUserCount} users. Use force to remove.`,
          )
          return
        }
        toast.error(response.message || 'Delete failed')
        return
      }
      toast.success('Role deleted')
      setDeleteTarget(null)
      await load()
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ListTableColumn<AdminRole>[]>(
    () => [
      {
        header: 'Name',
        icon: Shield,
        widthClassName: 'min-w-[12rem]',
        cellClassName: 'font-medium',
        cell: (role) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>{role.name}</span>
              {role.isSystem ? (
                <ListChip tone="info">System</ListChip>
              ) : null}
            </div>
            <div className={`font-mono text-xs ${hintClassName}`}>
              {role.key}
            </div>
          </div>
        ),
        copyValue: (role) => role.name,
      },
      {
        header: 'Description',
        widthClassName: 'min-w-[12rem]',
        cell: (role) => (
          <span className="line-clamp-2 text-(--muted)">
            {role.description || '—'}
          </span>
        ),
      },
      {
        header: 'Permissions',
        icon: KeyRound,
        align: 'right',
        widthClassName: 'w-28',
        cellClassName: 'tabular-nums',
        cell: (role) =>
          role.permissions.includes('*') ? '*' : role.permissions.length,
      },
      {
        header: 'Includes',
        icon: Layers,
        widthClassName: 'min-w-[10rem]',
        cell: (role) =>
          role.includes.length === 0 ? (
            <span className="text-(--muted)">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {role.includes.map((inc) => (
                <ListChip key={inc} tone="neutral">
                  {roleNameByKey.get(inc) ?? inc}
                </ListChip>
              ))}
            </div>
          ),
      },
      {
        header: 'Users',
        icon: Users,
        align: 'right',
        widthClassName: 'w-20',
        cellClassName: 'tabular-nums',
        cell: (role) => role.assignedUserCount,
      },
      {
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-24 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (role) => (
          <div
            className="flex items-center justify-end"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Actions for ${role.name}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    void navigate({
                      to: '/admin/roles/$key',
                      params: { key: role.key },
                    })
                  }
                >
                  Edit
                </DropdownMenuItem>
                {canManage ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void navigate({
                        to: '/admin/roles/new',
                        search: { from: role.key },
                      })
                    }
                  >
                    Duplicate
                  </DropdownMenuItem>
                ) : null}
                {canManage && !role.isSystem ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(role)}
                  >
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [canManage, navigate, roleNameByKey],
  )

  if (error && !loading) {
    return (
      <div className="space-y-3 rounded-lg border border-(--line) p-6">
        <p className="text-sm text-red-700">{error}</p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <>
      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {filtered.length} {filtered.length === 1 ? 'role' : 'roles'}
            </span>
          )
        }
        search={{
          value: query,
          onChange: setQuery,
          placeholder: 'Search…',
          'aria-label': 'Search roles',
        }}
        addAction={
          canManage
            ? {
                label: 'New role',
                onClick: () =>
                  void navigate({ to: '/admin/roles/new' }),
              }
            : undefined
        }
        loading={loading}
        loadingLabel="Loading roles…"
        empty={
          debounced.trim()
            ? 'No roles match the current search.'
            : 'No roles yet.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(role) => role.key}
        onRowClick={(role) =>
          void navigate({
            to: '/admin/roles/$key',
            params: { key: role.key },
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.name ?? 'role'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Assigned to ${deleteTarget.assignedUserCount} user${deleteTarget.assignedUserCount === 1 ? '' : 's'}. Deleting with force removes this role from those users.`
                : 'This role will be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting
                ? 'Deleting…'
                : deleteTarget && deleteTarget.assignedUserCount > 0
                  ? 'Delete and remove from users'
                  : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
