import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { Ban, Mail, Pencil, Shield, UserRound } from 'lucide-react'
import UserAdminEditor from '#/components/forms/admin/UserAdminEditor'
import ListTable, {
  ListChip,
  type ListTableColumn,
} from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import type { AdminRole, AdminUser } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import { hintClassName } from '#/lib/ui-classes'

type Props = {
  /** Open the edit sheet for this user id (e.g. from deep link). */
  initialEditUserId?: string
}

export default function UsersAdminForm({ initialEditUserId }: Props) {
  const navigate = useNavigate()
  const [emailQuery, setEmailQuery] = useState('')
  const debouncedQuery = useDebouncedValue(emailQuery, 250)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<AdminUser[]>([])
  const [rolesCatalog, setRolesCatalog] = useState<AdminRole[]>([])
  const [page, setPage] = useState(1)
  const [editUserId, setEditUserId] = useState<string | null>(
    initialEditUserId ?? null,
  )

  const roleNameByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const role of rolesCatalog) map.set(role.key, role.name)
    return map
  }, [rolesCatalog])

  async function reload() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const q = debouncedQuery.trim()
      if (q) params.set('email', q)
      const path = params.size
        ? `/admin/users?${params.toString()}`
        : '/admin/users'
      const [usersRes, rolesRes] = await Promise.all([
        apiFetch<AdminUser[]>(path),
        apiFetch<AdminRole[]>('/admin/roles'),
      ])
      if (!usersRes.success || !usersRes.data) {
        toast.error(usersRes.message || 'Failed to load users')
        return
      }
      setResults(usersRes.data)
      setPage(1)
      if (rolesRes.success && rolesRes.data) setRolesCatalog(rolesRes.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  useEffect(() => {
    if (initialEditUserId) setEditUserId(initialEditUserId)
  }, [initialEditUserId])

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginate(results, page, DEFAULT_PAGE_SIZE),
    [results, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  const editUser = useMemo(
    () => results.find((u) => u.id === editUserId) ?? null,
    [results, editUserId],
  )

  function openEdit(userId: string) {
    setEditUserId(userId)
    void navigate({
      to: '/admin/users',
      search: { edit: userId },
      replace: true,
    })
  }

  function closeEdit() {
    setEditUserId(null)
    void navigate({
      to: '/admin/users',
      search: { edit: undefined },
      replace: true,
    })
  }

  const columns = useMemo<ListTableColumn<AdminUser>[]>(
    () => [
      {
        header: 'Email',
        icon: Mail,
        widthClassName: 'min-w-[14rem]',
        cellClassName: 'font-medium',
        cell: (user) => user.email,
        copyValue: (user) => user.email,
      },
      {
        header: 'Roles',
        icon: Shield,
        widthClassName: 'min-w-[12rem]',
        cell: (user) =>
          (user.roles ?? []).length === 0 ? (
            <span className="text-(--muted)">No roles</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {(user.roles ?? []).map((key) => (
                <ListChip key={key} tone="neutral">
                  {roleNameByKey.get(key) ?? key}
                </ListChip>
              ))}
            </div>
          ),
      },
      {
        header: 'Status',
        icon: Ban,
        widthClassName: 'w-28',
        cell: (user) =>
          user.isBlocked ? (
            <ListChip tone="danger">Blocked</ListChip>
          ) : (
            <ListChip tone="success">Active</ListChip>
          ),
      },
      {
        header: 'Actions',
        align: 'right',
        widthClassName: 'w-28 whitespace-nowrap',
        cellClassName: 'py-1.5',
        cell: (user) => (
          <div
            className="flex items-center justify-end"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEdit(user.id)}
            >
              <Pencil />
              Edit
            </Button>
          </div>
        ),
      },
    ],
    [roleNameByKey],
  )

  return (
    <>
      <ListTable
        toolbarStart={
          loading ? null : (
            <span className={hintClassName}>
              {results.length} {results.length === 1 ? 'user' : 'users'}
            </span>
          )
        }
        search={{
          value: emailQuery,
          onChange: setEmailQuery,
          placeholder: 'Search email…',
          'aria-label': 'Search users by email',
        }}
        isRowMuted={(user) => user.isBlocked}
        loading={loading}
        loadingLabel="Loading users…"
        empty={
          debouncedQuery.trim()
            ? `No users found for “${debouncedQuery.trim()}”.`
            : 'No users yet.'
        }
        columns={columns}
        rows={pageItems}
        rowKey={(user) => user.id}
        onRowClick={(user) => openEdit(user.id)}
        pagination={{
          page: safePage,
          totalPages,
          totalItems: results.length,
          pageSize: DEFAULT_PAGE_SIZE,
          onPageChange: setPage,
        }}
      />

      <Sheet
        open={editUserId !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit()
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserRound className="size-4" aria-hidden />
              {editUser?.email ?? 'Edit user'}
            </SheetTitle>
            <SheetDescription>
              Manage roles and account settings for this user.
            </SheetDescription>
          </SheetHeader>
          {editUserId ? (
            <div className="px-4 pb-4">
              <UserAdminEditor
                userId={editUserId}
                onSaved={() => void reload()}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
