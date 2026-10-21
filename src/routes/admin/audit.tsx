import { createFileRoute } from '@tanstack/react-router'
import AuditViewerForm from '#/components/forms/admin/AuditViewerForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/audit')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.audit.view'),
  component: AdminAuditPage,
})

function AdminAuditPage() {
  return (
    <div className="mx-auto w-full max-w-5xl text-[var(--ink)]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Audit Log</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Review create, update, and delete history across audited collections.
        </p>
      </div>

      <AuditViewerForm />
    </div>
  )
}
