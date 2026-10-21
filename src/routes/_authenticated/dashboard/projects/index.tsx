import { createFileRoute } from '@tanstack/react-router'
import ProjectForm from '#/components/forms/ProjectForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/projects/')({
  beforeLoad: () => requirePermissionBeforeLoad('project.view'),
  component: ProjectsPage,
})

function ProjectsPage() {
  return <ProjectForm mode="list" />
}
