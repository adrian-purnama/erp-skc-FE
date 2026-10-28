import { createFileRoute } from '@tanstack/react-router'
import RealizationEditor from '#/components/forms/purchasing/RealizationEditor'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

type NewRealizationSearch = {
  orderId?: string
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export const Route = createFileRoute('/_authenticated/dashboard/purchasing/realizations/new')({
  beforeLoad: () => requirePermissionBeforeLoad('purchasing.realize'),
  validateSearch: (search: Record<string, unknown>): NewRealizationSearch => ({
    orderId: optionalString(search.orderId),
  }),
  component: NewRealizationPage,
})

function NewRealizationPage() {
  const { orderId } = Route.useSearch()
  return <RealizationEditor key={orderId ?? 'none'} orderId={orderId} />
}
