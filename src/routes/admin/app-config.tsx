import { createFileRoute } from '@tanstack/react-router'
import AppConfigForm from '#/components/forms/AppConfigForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/app-config')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.config.view'),
  component: AdminAppConfigPage,
})

function AdminAppConfigPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>App config</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Branding and whether login or registration stays open.
        </p>
      </div>

      <AppConfigForm />
    </div>
  )
}
