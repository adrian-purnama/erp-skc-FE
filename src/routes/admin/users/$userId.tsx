import { createFileRoute, redirect } from '@tanstack/react-router'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/admin/users/$userId')({
  beforeLoad: async ({ params }) => {
    await requirePermissionBeforeLoad('admin.user.view')
    throw redirect({
      to: '/admin/users',
      search: { edit: params.userId },
    })
  },
  component: () => null,
})
