import { createFileRoute } from '@tanstack/react-router'
import ProjectDashboard from '#/components/forms/ProjectDashboard'

export const Route = createFileRoute(
  '/_authenticated/dashboard/projects/$projectId/',
)({
  component: ProjectDashboardPage,
})

function ProjectDashboardPage() {
  const { projectId } = Route.useParams()
  return <ProjectDashboard projectId={projectId} />
}
