import { createFileRoute } from '@tanstack/react-router'
import RolesAdminForm from '#/components/forms/admin/RolesAdminForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/roles/')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: AdminRolesPage,
})

function AdminRolesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Roles</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Bundle permissions and assign them to users.
        </p>
      </div>

      <RolesAdminForm />
    </div>
  )
}
