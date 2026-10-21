import { createFileRoute } from '@tanstack/react-router'
import UsersAdminForm from '#/components/forms/UsersAdminForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/users/')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.user.view'),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  return (
    <div className="mx-auto w-full max-w-3xl text-[var(--ink)]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Users</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Browse users, filter by email, then open one to manage roles and account
          flags.
        </p>
      </div>

      <UsersAdminForm />
    </div>
  )
}
