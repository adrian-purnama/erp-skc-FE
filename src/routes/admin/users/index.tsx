import { createFileRoute } from '@tanstack/react-router'
import UsersAdminForm from '#/components/forms/UsersAdminForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

type UsersSearch = {
  edit?: string
}

export const Route = createFileRoute('/admin/users/')({
  validateSearch: (search: Record<string, unknown>): UsersSearch => ({
    edit: typeof search.edit === 'string' ? search.edit : undefined,
  }),
  beforeLoad: () => requirePermissionBeforeLoad('admin.user.view'),
  component: AdminUsersPage,
})

function AdminUsersPage() {
  const { edit } = Route.useSearch()

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Users</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Find a user by email, then edit roles and account flags.
        </p>
      </div>

      <UsersAdminForm initialEditUserId={edit} />
    </div>
  )
}
