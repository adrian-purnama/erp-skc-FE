import { createFileRoute } from '@tanstack/react-router'
import RoleEditor from '#/components/admin/RoleEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/admin/roles/$key')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: EditRolePage,
})

function EditRolePage() {
  const { key } = Route.useParams()
  return <RoleEditor mode="edit" roleKey={key} />
}
