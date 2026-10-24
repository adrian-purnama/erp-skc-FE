import { createFileRoute } from '@tanstack/react-router'
import AuditViewerForm from '#/components/forms/admin/AuditViewerForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/audit')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.audit.view'),
  component: AdminAuditPage,
})

function AdminAuditPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Audit Log</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Create, update, and delete history across collections.
        </p>
      </div>

      <AuditViewerForm />
    </div>
  )
}
