import { createFileRoute } from '@tanstack/react-router'
import ShrinkDbForm from '#/components/forms/admin/ShrinkDbForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/shrink-db')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.shrinkDb.run'),
  component: AdminShrinkDbPage,
})

function AdminShrinkDbPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Shrink DB</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Clear old audit history and unused file versions. Progress updates live.
        </p>
      </div>

      <ShrinkDbForm />
    </div>
  )
}
