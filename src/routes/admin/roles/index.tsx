import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { MoreHorizontal, Search } from 'lucide-react'
import ListPagination from '#/components/forms/shared/ListPagination'
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
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/admin/roles/')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: AdminRolesPage,
})

function AdminRolesPage() {
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
  const dialogRef = useRef<HTMLDialogElement>(null)

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

  useEffect(() => {
    if (deleteTarget) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [deleteTarget])

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

  async function confirmDelete(force: boolean) {
    if (!deleteTarget) return
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
    }
  }

  return (
    <div className="w-full text-[var(--ink)]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Roles</h1>
          <p className={`mt-2 ${hintClassName}`}>
            Bundle permissions and assign them to users.
          </p>
        </div>
        {canManage ? (
          <Link to="/admin/roles/new" className={buttonClassName}>
            New role
          </Link>
        ) : null}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or key…"
          className={cn(inputClassName, 'pl-10')}
          aria-label="Search roles"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`${cardClassName} h-16 animate-pulse bg-[var(--surface)]`}
            />
          ))}
        </div>
      ) : error ? (
        <div className={`${cardClassName} space-y-3 p-6`}>
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" className={buttonOutlineClassName} onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${cardClassName} space-y-3 px-6 py-10 text-center`}>
          <p className={hintClassName}>No roles match your search.</p>
          {canManage ? (
            <Link to="/admin/roles/new" className={buttonClassName}>
              Create a role
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Permissions</th>
                  <th className="px-3 py-2 font-medium">Includes</th>
                  <th className="px-3 py-2 font-medium">Users</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((role) => (
                  <tr
                    key={role.key}
                    className="cursor-pointer border-b border-[var(--line)] hover:bg-[var(--surface)]"
                    onClick={() =>
                      void navigate({
                        to: '/admin/roles/$key',
                        params: { key: role.key },
                      })
                    }
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium">{role.name}</div>
                      <div className={`font-mono text-xs ${hintClassName}`}>
                        {role.key}
                      </div>
                      {role.isSystem ? (
                        <span className="mt-1 inline-block rounded-full border border-[var(--line)] px-2 py-0.5 text-xs">
                          System
                        </span>
                      ) : null}
                    </td>
                    <td className={`px-3 py-3 ${hintClassName}`}>
                      {role.description || '—'}
                    </td>
                    <td className="px-3 py-3">
                      {role.permissions.includes('*')
                        ? '*'
                        : role.permissions.length}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {role.includes.length === 0
                          ? '—'
                          : role.includes.map((inc) => (
                              <span
                                key={inc}
                                className="rounded-full border border-[var(--line)] px-2 py-0.5 text-xs"
                              >
                                {inc}
                              </span>
                            ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">{role.assignedUserCount}</td>
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-[var(--surface)]"
                            aria-label={`Actions for ${role.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-[var(--radius-md)] border border-[var(--line)] p-0 backdrop:bg-black/40"
        onClose={() => setDeleteTarget(null)}
      >
        {deleteTarget ? (
          <div className="space-y-4 p-6">
            <h2 className="text-lg font-medium">Delete {deleteTarget.name}?</h2>
            <p className={`text-sm ${hintClassName}`}>
              Assigned to {deleteTarget.assignedUserCount} user
              {deleteTarget.assignedUserCount === 1 ? '' : 's'}. Deleting with
              force removes this role from those users.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={buttonOutlineClassName}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={buttonClassName}
                onClick={() =>
                  void confirmDelete(deleteTarget.assignedUserCount > 0)
                }
              >
                {deleteTarget.assignedUserCount > 0
                  ? 'Delete and remove from users'
                  : 'Delete'}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  )
}
