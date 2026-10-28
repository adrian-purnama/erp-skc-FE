import type { ProjectRabUserRef } from '#/lib/project'

export type ProductionOrderType = 'inhouse' | 'subcon' | 'outsource'
export type ProductionOrderStatus =
  'draft' | 'released' | 'in_progress' | 'completed' | 'cancelled'

export const PRODUCTION_ORDER_STATUSES: ProductionOrderStatus[] = [
  'draft',
  'released',
  'in_progress',
  'completed',
  'cancelled',
]

export const PRODUCTION_ORDER_STATUS_LABELS: Record<
  ProductionOrderStatus,
  string
> = {
  draft: 'Draft',
  released: 'Released',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const PRODUCTION_ORDER_TYPE_LABELS: Record<ProductionOrderType, string> =
  {
    inhouse: 'Inhouse',
    subcon: 'Subcon',
    outsource: 'Outsource',
  }

export type ProductionReadinessCheck = {
  key: 'quotation' | 'rab' | 'items'
  label: string
  ok: boolean
  detail: string
}

export type ProductionReadinessItem = {
  itemId: string
  code: string
  name: string
  label: string
  shopDrawing: boolean
  boq: boolean
  makeQty: string | null
  productionFile: boolean
  ready: boolean
}

export type ProductionReadiness = {
  projectId: string
  ready: boolean
  releasedAt: string | null
  releasedBy: ProjectRabUserRef | null
  checks: ProductionReadinessCheck[]
  items: ProductionReadinessItem[]
  readyCount: number
  totalCount: number
}

export type ProductionItemProgressStatus =
  'not_started' | 'partial' | 'in_progress' | 'done'

export const PRODUCTION_ITEM_STATUS_LABELS: Record<
  ProductionItemProgressStatus,
  string
> = {
  not_started: 'Not started',
  partial: 'Ordered',
  in_progress: 'In progress',
  done: 'Done',
}

export type ProductionItemProgress = {
  itemId: string
  code: string
  name: string
  label: string
  category: string | null
  makeQty: string
  orderedQty: string
  doneQty: string
  remainingToOrder: string
  percent: number
  status: ProductionItemProgressStatus
  orderCount: number
}

export type ProductionProjectProgress = {
  projectId: string
  releasedAt: string | null
  items: ProductionItemProgress[]
  totals: { makeQty: string; doneQty: string; percent: number }
}

export type ProductionOrderSummary = {
  id: string
  number: string
  type: ProductionOrderType
  status: ProductionOrderStatus
  projectId: string
  projectNumber: string
  projectName: string
  shopDrawingItemId: string
  itemLabel: string
  qty: string
  doneQty: string
  plannedStart: string | null
  plannedFinish: string | null
  picUserId: string | null
  pic: string
  createdAt: string | null
  releasedAt: string | null
  completedAt: string | null
}

export type ProductionOrderMaterial = {
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  qtyPerUnit: string
  qty: string
}

export type ProductionReport = {
  id: string
  productionOrderId: string
  qtyDone: string
  reportDate: string
  notes: string
  reportedBy: ProjectRabUserRef | null
  createdAt: string | null
  isVoided: boolean
  voidedAt: string | null
  voidedBy: ProjectRabUserRef | null
  voidReason: string
}

export type ProductionOrderFileRef = {
  fileId: string
  version: number
  originalFilename: string
}

export type ProductionOrder = ProductionOrderSummary & {
  notes: string
  createdBy: ProjectRabUserRef | null
  releasedBy: ProjectRabUserRef | null
  /** Issuer full name printed on the SPK. */
  releasedByName: string
  completedBy: ProjectRabUserRef | null
  completeNote: string
  cancelledAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelReason: string
  makeQty: string
  materials: ProductionOrderMaterial[]
  shopDrawingFile: ProductionOrderFileRef | null
  productionFile: ProductionOrderFileRef | null
  maxQty: string
  reports: ProductionReport[]
}

export type ProductionPicUser = {
  id: string
  name: string
  email: string
}

/** Draft / released / in progress SPKs still hold qty and take reports. */
export function isActiveOrder(status: ProductionOrderStatus): boolean {
  return status === 'released' || status === 'in_progress'
}

export function productionStatusChipClass(
  status: ProductionOrderStatus | ProductionItemProgressStatus,
): string {
  switch (status) {
    case 'draft':
    case 'partial':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'released':
    case 'in_progress':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    case 'completed':
    case 'done':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    default:
      return 'border-(--line) text-(--muted)'
  }
}
