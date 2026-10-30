import { createFileRoute } from '@tanstack/react-router'
import PermissionsAdminForm from '#/components/forms/admin/PermissionsAdminForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/permissions')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: AdminPermissionsPage,
})

function AdminPermissionsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Permissions</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Browse curated permissions and sync them with the current routes.
        </p>
      </div>

      <PermissionsAdminForm />
    </div>
  )
}
