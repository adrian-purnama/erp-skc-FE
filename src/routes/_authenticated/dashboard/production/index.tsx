import { createFileRoute } from '@tanstack/react-router'
import ProductionOrdersForm from '#/components/forms/production/ProductionOrdersForm'
import { requirePermissionBeforeLoad } from '#/lib/requirePermissionBeforeLoad'

export const Route = createFileRoute('/_authenticated/dashboard/production/')({
  beforeLoad: () => requirePermissionBeforeLoad('production.view'),
  component: ProductionPage,
})

function ProductionPage() {
  return <ProductionOrdersForm />
}
