import { Outlet, createFileRoute } from '@tanstack/react-router'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/projects/$projectId',
)({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  component: ProjectIdLayout,
})

function ProjectIdLayout() {
  return <Outlet />
}
