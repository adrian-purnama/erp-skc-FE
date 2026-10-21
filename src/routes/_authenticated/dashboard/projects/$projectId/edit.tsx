import { createFileRoute } from '@tanstack/react-router'
import ProjectForm from '#/components/forms/ProjectForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute(
  '/_authenticated/dashboard/projects/$projectId/edit',
)({
  beforeLoad: () =>
    requirePermissionBeforeLoad('project.manage', '/dashboard/projects'),
  component: EditProjectPage,
})

function EditProjectPage() {
  const { projectId } = Route.useParams()
  return <ProjectForm mode="edit" projectId={projectId} />
}
