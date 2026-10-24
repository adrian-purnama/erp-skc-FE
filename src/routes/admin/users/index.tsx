import { createFileRoute } from '@tanstack/react-router'
import UsersAdminForm from '#/components/forms/UsersAdminForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/users/')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.user.view'),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Users</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Find a user by email, then open them to manage roles and account flags.
        </p>
      </div>

      <UsersAdminForm />
    </div>
  )
}
