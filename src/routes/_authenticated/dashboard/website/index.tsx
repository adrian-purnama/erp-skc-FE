import { createFileRoute } from '@tanstack/react-router'
import WebsiteContentForm from '#/components/forms/website/WebsiteContentForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/website/')({
  beforeLoad: () => requirePermissionBeforeLoad('landing.view'),
  component: WebsiteContentPage,
})

function WebsiteContentPage() {
  return <WebsiteContentForm />
}
