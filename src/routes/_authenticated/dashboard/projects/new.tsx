import { createFileRoute } from '@tanstack/react-router'
import ProjectForm from '#/components/forms/ProjectForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/projects/new')({
  beforeLoad: () =>
    requirePermissionBeforeLoad('project.manage', '/dashboard/projects'),
  component: NewProjectPage,
})

function NewProjectPage() {
  return <ProjectForm mode="create" />
}
