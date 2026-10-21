import { createFileRoute } from '@tanstack/react-router'
import RoleEditor from '#/components/admin/RoleEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewRoleSearch = {
  from?: string
}

export const Route = createFileRoute('/admin/roles/new')({
  validateSearch: (search: Record<string, unknown>): NewRoleSearch => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  beforeLoad: () => requirePermissionBeforeLoad('admin.role.view'),
  component: NewRolePage,
})

function NewRolePage() {
  const { from } = Route.useSearch()
  return <RoleEditor mode="create" duplicateFrom={from} />
}
