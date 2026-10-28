import type { ProjectRabUserRef, ProjectShopDrawingBoqMaterial } from '#/lib/project'

export type PurchaseRequestStatus =
  | 'draft'
  | 'submitted'
  | 'cancelled'
  | 'declined'
export type PurchaseRequestLineSource = 'spk' | 'extra'

export const PURCHASE_REQUEST_STATUSES: PurchaseRequestStatus[] = [
  'draft',
  'submitted',
  'cancelled',
  'declined',
]

export const PURCHASE_REQUEST_STATUS_LABELS: Record<
  PurchaseRequestStatus,
  string
> = {
  draft: 'Draft',
  submitted: 'Submitted',
  cancelled: 'Cancelled',
  declined: 'Declined',
}

/** Item Master material with its units. */
export type PurchasingMaterial = ProjectShopDrawingBoqMaterial

export type PurchasingProject = {
  id: string
  projectNumber: string
  name: string
}

export type PurchasingProjectContext = PurchasingProject & {
  rabKeys: string[]
  orders: Array<{ id: string; number: string; itemLabel: string }>
}

export type PurchaseRequestLine = {
  id: string
  source: PurchaseRequestLineSource
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  qty: string
  inRab: boolean
  overPlan: boolean
  note: string
  orderedQty: string
  receivedQty: string
  orderStatus: RequestLineOrderStatus
  orders: Array<{
    id: string
    number: string
    status: PurchaseOrderStatus
    qty: string
  }>
}

export type PurchaseRequestSummary = {
  id: string
  number: string
  status: PurchaseRequestStatus
  projectId: string
  projectNumber: string
  projectName: string
  productionOrderId: string | null
  productionOrderNumber: string | null
  itemLabel: string | null
  neededDate: string
  lineCount: number
  flaggedCount: number
  orderStatus: RequestLineOrderStatus
  receiptStatus: RealizationProgress
  requestedBy: ProjectRabUserRef | null
  createdAt: string | null
  submittedAt: string | null
}

export type PurchaseRequest = PurchaseRequestSummary & {
  notes: string
  lines: PurchaseRequestLine[]
  submittedBy: ProjectRabUserRef | null
  cancelledAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelReason: string
  declinedAt: string | null
  declinedBy: ProjectRabUserRef | null
  declineReason: string
  orders: Array<{
    id: string
    number: string
    status: PurchaseOrderStatus
    vendorName: string
    total: string
  }>
  canChange: boolean
}

export type PurchaseRequestPlanRow = {
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  plannedQty: string
  requestedQty: string
  remainingQty: string
  inRab: boolean
  orderedQty: string
  receivedQty: string
}

export type PurchaseRequestPlan = {
  productionOrderId: string
  productionOrderNumber: string
  projectId: string
  projectNumber: string
  projectName: string
  itemLabel: string
  plannedStart: string | null
  rows: PurchaseRequestPlanRow[]
}

/** SPK vs extra is decided by the server from the SPK material list. */
export type PurchaseRequestLineInput = {
  materialItemId: string
  itemUomId: string
  qty: string
  note: string
}

/** Same key the API uses for RAB lines. */
export function materialKey(row: {
  materialItemId: string
  itemUomId: string
}): string {
  return `${row.materialItemId}:${row.itemUomId}`
}

/** Positive finite number from user input, else null. */
export function parseQty(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function purchaseRequestStatusChipClass(
  status: PurchaseRequestStatus,
): string {
  switch (status) {
    case 'draft':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'submitted':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    case 'declined':
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
    default:
      return 'border-(--line) text-(--muted)'
  }
}

// ---- Purchase orders ----

export type RequestLineOrderStatus = 'open' | 'partial' | 'ordered'

export const REQUEST_ORDER_STATUS_LABELS: Record<
  RequestLineOrderStatus,
  string
> = {
  open: 'Not ordered',
  partial: 'Partly ordered',
  ordered: 'Ordered',
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
]

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> =
  {
    draft: 'Draft',
    pending_approval: 'Waiting approval',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  }

export type PurchasingOption = { id: string; label: string; detail: string }

export type OpenRequestLine = {
  requestId: string
  requestNumber: string
  requestLineId: string
  neededDate: string
  projectId: string
  projectNumber: string
  projectName: string
  productionOrderNumber: string | null
  itemLabel: string | null
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  requestedQty: string
  orderedQty: string
  remainingQty: string
  source: PurchaseRequestLineSource
  inRab: boolean
  overPlan: boolean
  note: string
  rabUnitPrice: string | null
}

export type PurchaseOrderLine = Omit<
  OpenRequestLine,
  'orderedQty' | 'remainingQty'
> & {
  id: string
  qty: string
  unitPrice: string
  amount: string
  orderedElsewhereQty: string
  overRequest: boolean
  overBudget: boolean
  orderNote: string
  realizedQty: string
  receivedQty: string
}

export type PurchaseOrderSummary = {
  id: string
  number: string
  status: PurchaseOrderStatus
  vendorId: string
  vendorName: string
  total: string
  lineCount: number
  overBudgetCount: number
  requestId: string
  requestNumber: string
  projectNumber: string
  projectName: string
  expectedDate: string | null
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  submittedAt: string | null
  approvedAt: string | null
}

export type PurchaseOrder = PurchaseOrderSummary & {
  termOfPaymentId: string | null
  termOfPayment: string
  notes: string
  lines: PurchaseOrderLine[]
  rabTotal: string
  submittedBy: ProjectRabUserRef | null
  approvedBy: ProjectRabUserRef | null
  rejectedAt: string | null
  rejectedBy: ProjectRabUserRef | null
  rejectReason: string
  cancelledAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelReason: string
  /** You created it, so you may edit, send, revise or cancel it. */
  canChange: boolean
  realizationStatus: RealizationProgress
  realizedTotal: string
  realizations: Array<{
    id: string
    number: string
    status: RealizationStatus
    purchaseDate: string
    total: string
    difference: string
  }>
  receiptStatus: RealizationProgress
  receipts: Array<{
    id: string
    number: string
    status: GoodsReceiptStatus
    receivedDate: string
    lineCount: number
  }>
}

/** "1016400" → "Rp 1.016.400". */
export function formatRupiah(digits: string | null | undefined): string {
  if (!digits) return '—'
  const n = Number(digits)
  return Number.isFinite(n) ? `Rp ${new Intl.NumberFormat('id-ID').format(n)}` : '—'
}

export function purchaseOrderStatusChipClass(status: PurchaseOrderStatus): string {
  switch (status) {
    case 'draft':
      return 'border-(--line) text-(--muted)'
    case 'pending_approval':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
    case 'approved':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'rejected':
      return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
    default:
      return 'border-(--line) text-(--muted) line-through'
  }
}

export function requestOrderStatusChipClass(
  status: RequestLineOrderStatus,
): string {
  switch (status) {
    case 'ordered':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'partial':
      return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    default:
      return 'border-(--line) text-(--muted)'
  }
}

// ---- Nota Realisasi ----

export type RealizationStatus = 'draft' | 'posted' | 'voided'
export type RealizationMethod = 'vendor' | 'staff'
export type RealizationProgress = 'none' | 'partial' | 'full'

export const REALIZATION_STATUS_LABELS: Record<RealizationStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  voided: 'Voided',
}

export const REALIZATION_METHOD_LABELS: Record<RealizationMethod, string> = {
  vendor: 'Vendor invoice',
  staff: 'Staff purchase',
}

export const REALIZATION_PROGRESS_LABELS: Record<RealizationProgress, string> = {
  none: 'Not bought yet',
  partial: 'Partly bought',
  full: 'Fully bought',
}

export type RealizationPoLine = {
  poLineId: string
  materialCode: string
  materialName: string
  uomSymbol: string
  orderedQty: string
  approvedPrice: string
  realizedQty: string
  remainingQty: string
}

export type RealizationPlan = {
  purchaseOrderId: string
  poNumber: string
  vendorName: string
  requestId: string
  requestNumber: string
  projectNumber: string
  projectName: string
  approvedTotal: string
  lines: RealizationPoLine[]
}

export type RealizationLine = {
  id: string
  poLineId: string
  materialCode: string
  materialName: string
  uomSymbol: string
  qty: string
  unitPrice: string
  approvedPrice: string
  amount: string
  difference: string
  note: string
}

export type RealizationPhoto = {
  id: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedBy: ProjectRabUserRef | null
  uploadedAt: string | null
}

export type RealizationSummary = {
  id: string
  number: string
  status: RealizationStatus
  method: RealizationMethod
  purchaseOrderId: string
  poNumber: string
  vendorName: string
  requestNumber: string
  projectNumber: string
  projectName: string
  buyerName: string
  purchaseDate: string
  place: string
  total: string
  difference: string
  photoCount: number
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  postedAt: string | null
}

export type Realization = RealizationSummary & {
  buyerUserId: string | null
  notaNumber: string
  comments: string
  lines: RealizationLine[]
  photos: RealizationPhoto[]
  postedBy: ProjectRabUserRef | null
  voidedAt: string | null
  voidedBy: ProjectRabUserRef | null
  voidReason: string
  canChange: boolean
}

export type RealizationQueueRow = PurchaseOrderSummary & {
  realizationStatus: RealizationProgress
  realizedTotal: string
}

export type PurchasingUser = { id: string; name: string; email: string }

/** "+Rp 300.000" / "−Rp 50.000" / "Rp 0" for a signed rupiah difference. */
export function formatRupiahDiff(digits: string): string {
  const n = Number(digits)
  if (!Number.isFinite(n) || n === 0) return 'Rp 0'
  const abs = new Intl.NumberFormat('id-ID').format(Math.abs(n))
  return `${n > 0 ? '+' : '−'}Rp ${abs}`
}

export function realizationStatusChipClass(status: RealizationStatus): string {
  switch (status) {
    case 'posted':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    case 'voided':
      return 'border-(--line) text-(--muted) line-through'
    default:
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }
}

// ---- Penerimaan Barang ----

export type GoodsReceiptStatus = 'posted' | 'voided'

export const GOODS_RECEIPT_STATUS_LABELS: Record<GoodsReceiptStatus, string> = {
  posted: 'Received',
  voided: 'Voided',
}

export const RECEIPT_PROGRESS_LABELS: Record<RealizationProgress, string> = {
  none: 'Not arrived yet',
  partial: 'Partly arrived',
  full: 'All arrived',
}

export type ReceiptPoLine = {
  poLineId: string
  materialCode: string
  materialName: string
  uomSymbol: string
  orderedQty: string
  receivedQty: string
  remainingQty: string
}

export type ReceiptPlan = {
  purchaseOrderId: string
  poNumber: string
  vendorName: string
  requestId: string
  requestNumber: string
  projectNumber: string
  projectName: string
  expectedDate: string | null
  lines: ReceiptPoLine[]
}

export type GoodsReceiptSummary = {
  id: string
  number: string
  status: GoodsReceiptStatus
  purchaseOrderId: string
  poNumber: string
  vendorName: string
  requestNumber: string
  projectNumber: string
  projectName: string
  receivedDate: string
  receivedByName: string
  deliveryNoteNumber: string
  lineCount: number
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
}

export type GoodsReceipt = GoodsReceiptSummary & {
  notes: string
  lines: Array<{
    id: string
    poLineId: string
    materialCode: string
    materialName: string
    uomSymbol: string
    orderedQty: string
    qty: string
    note: string
  }>
  voidedAt: string | null
  voidedBy: ProjectRabUserRef | null
  voidReason: string
}

export type ReceiptQueueRow = PurchaseOrderSummary & {
  receiptStatus: RealizationProgress
}

export function goodsReceiptStatusChipClass(status: GoodsReceiptStatus): string {
  return status === 'posted'
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : 'border-(--line) text-(--muted) line-through'
}
