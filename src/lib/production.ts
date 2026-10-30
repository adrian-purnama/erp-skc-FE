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
  makeType: ProductionOrderType
  shopDrawing: boolean
  boq: boolean
  makeQty: string | null
  productionFile: boolean
  /** False for outsource: the vendor brings its own production files. */
  productionFileRequired: boolean
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
  /** Finished pcs (last labour stage, or legacy Σ reports). */
  doneQty: string
  /** Weighted labour progress 0–100 when staged; else done/qty %. */
  progressPercent: number
  plannedStart: string | null
  plannedFinish: string | null
  picUserId: string | null
  pic: string
  createdAt: string | null
  releasedAt: string | null
  completedAt: string | null
}

export type ProductionLabourStage = {
  sequence: number
  name: string
  weightPercent: number
  materialItemId: string
  itemUomId: string
  qtyDone: string
}

export type ProductionOrderMaterial = {
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  qtyPerUnit: string
  /** Need before rounding (per unit × SPK qty). */
  exactQty: string
  /** To request / issue, rounded like the RAB over the item's SPKs. */
  qty: string
}

export type ProductionReport = {
  id: string
  productionOrderId: string
  /** Set when a vendor handover created it; void the handover instead. */
  handoverId: string | null
  qtyDone: string
  /** Inhouse staged report; null on legacy / vendor. */
  stageSequence: number | null
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
  /** Subcon / outsource: vendor handovers, newest first. */
  handovers: ProductionHandover[]
  /** Checklist rows a new handover starts with. */
  defaultHandoverChecklist: string[]
  /** Subcon / outsource fee lines, received in step with handovers. */
  vendorFees: ProductionVendorFee[]
  /** Subcon: each material and where it is. */
  materialsAtVendor: ProductionMaterialAtVendor[]
  /** Subcon: surat jalan to the vendor, newest first. */
  dispatches: MaterialDispatch[]
  /** Subcon: where material goes (approved fee PO); null until approved. */
  dispatchVendor: { vendorName: string; purchaseOrderNumber: string } | null
  /** POs carrying this SPK's lines; `vendorFee` ones are the subcon / outsource vendor. */
  purchaseOrders: ProductionOrderPurchase[]
  /** Inhouse staged SPK: frozen labour stepper (empty when legacy / vendor). */
  labourStages: ProductionLabourStage[]
}

export type ProductionOrderPurchase = {
  id: string
  number: string
  vendorName: string
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
  /** This SPK's share of the PO, integer rupiah. */
  total: string
  /** Carries the vendor fee (a labour line): the subcon / outsource vendor's PO. */
  vendorFee: boolean
}

export type ProductionHandoverStatus = 'draft' | 'posted' | 'voided'

export type ProductionHandoverCheck = {
  label: string
  /** Null until checked. */
  result: 'ok' | 'not_ok' | null
  note: string
}

export type ProductionHandoverPhoto = {
  id: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
}

/** Serah Terima: units a vendor handed over on an SPK. */
export type ProductionHandover = {
  id: string
  number: string
  productionOrderId: string
  status: ProductionHandoverStatus
  handoverDate: string
  qty: string
  deliveryNoteNumber: string
  receivedByUserId: string | null
  receivedByName: string
  notes: string
  checklist: ProductionHandoverCheck[]
  photos: ProductionHandoverPhoto[]
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  postedAt: string | null
  postedBy: ProjectRabUserRef | null
  voidedAt: string | null
  voidedBy: ProjectRabUserRef | null
  voidReason: string
}

export type ProductionVendorFee = {
  materialItemId: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  feeQty: string
  /** Fee × handed over / SPK qty. */
  receivableQty: string
  /** On draft and posted realizations. */
  receivedQty: string
}

export const PRODUCTION_HANDOVER_STATUS_LABELS: Record<
  ProductionHandoverStatus,
  string
> = {
  draft: 'Draft',
  posted: 'Posted',
  voided: 'Voided',
}

export type ProductionMaterialAtVendor = {
  materialItemId: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  needQty: string
  receivedAtUsQty: string
  /** On surat jalan not sent yet. */
  onTheWayQty: string
  /** At our warehouse and free to send. */
  availableQty: string
  /** Sent + delivered straight by the supplier. */
  atVendorQty: string
}

export type MaterialDispatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'rejected'
  | 'cancelled'
  | 'voided'

/** Surat jalan: our material sent to a subcon vendor. */
export type MaterialDispatch = {
  id: string
  number: string
  status: MaterialDispatchStatus
  vendorName: string
  feePurchaseOrderNumber: string
  dispatchDate: string
  lines: Array<{
    materialItemId: string
    materialCode: string
    materialName: string
    itemUomId: string
    uomSymbol: string
    qty: string
  }>
  notes: string
  receivedByName: string
  photos: ProductionHandoverPhoto[]
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  submittedAt: string | null
  approvedBy: ProjectRabUserRef | null
  approvedAt: string | null
  rejectedBy: ProjectRabUserRef | null
  rejectedAt: string | null
  rejectReason: string
  sentBy: ProjectRabUserRef | null
  sentAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelledAt: string | null
  cancelReason: string
  voidedBy: ProjectRabUserRef | null
  voidedAt: string | null
  voidReason: string
}

export const MATERIAL_DISPATCH_STATUS_LABELS: Record<MaterialDispatchStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Waiting approval',
  approved: 'Approved',
  sent: 'Sent',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  voided: 'Voided',
}

/** Who makes a shop drawing item. */
export const MAKE_TYPE_OPTIONS: Array<{
  value: ProductionOrderType
  label: string
  hint: string
  disabled?: boolean
}> = [
  { value: 'inhouse', label: 'Inhouse', hint: 'Made in our workshop' },
  {
    value: 'outsource',
    label: 'Outsource',
    hint: 'Vendor makes it all',
  },
  {
    value: 'subcon',
    label: 'Subcon',
    hint: 'Our material, vendor does the work',
  },
]

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
