import { createFileRoute } from '@tanstack/react-router'
import RealizationsForm from '#/components/forms/purchasing/RealizationsForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/realizations/')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.realize'),
  component: RealizationsPage,
})

function RealizationsPage() {
  return <RealizationsForm />
}
