import { createFileRoute } from '@tanstack/react-router'
import WebsitePostEditor from '#/components/forms/website/WebsitePostEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/website/$postId')({
  beforeLoad: () => requirePermissionBeforeLoad('landing.view'),
  component: WebsitePostPage,
})

function WebsitePostPage() {
  const { postId } = Route.useParams()
  return <WebsitePostEditor key={postId} postId={postId} />
}
