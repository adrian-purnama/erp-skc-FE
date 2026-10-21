import { createFileRoute } from '@tanstack/react-router'
import ShrinkDbForm from '#/components/forms/admin/ShrinkDbForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'
import { hintClassName } from '#/lib/ui-classes'

export const Route = createFileRoute('/admin/shrink-db')({
  beforeLoad: () => requirePermissionBeforeLoad('admin.shrinkDb.run'),
  component: AdminShrinkDbPage,
})

function AdminShrinkDbPage() {
  return (
    <div className="mx-auto w-full max-w-5xl text-[var(--ink)]">
      <div className="mb-8">
        <h1 className="text-2xl font-medium tracking-tight">Shrink DB</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Prune old audit history and non-current file versions. Runs as a
          background job with live progress.
        </p>
      </div>

      <ShrinkDbForm />
    </div>
  )
}
