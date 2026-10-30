import type {
  ProjectRabUserRef,
  ProjectShopDrawingBoqMaterial,
} from '#/lib/project'

export type PurchaseRequestStatus =
  'draft' | 'submitted' | 'cancelled' | 'declined'
export type PurchaseRequestLineSource = 'spk' | 'rab' | 'extra'

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

/** An SPK you are PIC of that can take a new SPP. */
export type PurchasingSpk = {
  id: string
  number: string
  itemLabel: string
  projectId: string
  projectNumber: string
  projectName: string
}

/** A locked Purchasing RAB that an SPP can be made for. */
export type PurchasingRabOption = {
  id: string
  number: string
  title: string
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
  projectId: string | null
  /** "—" / "No project" for a Purchasing RAB without a project. */
  projectNumber: string
  projectName: string
  productionOrderId: string | null
  productionOrderNumber: string | null
  itemLabel: string | null
  purchaseRabId: string | null
  purchaseRabNumber: string | null
  purchaseRabTitle: string | null
  neededDate: string
  lineCount: number
  flaggedCount: number
  orderStatus: RequestLineOrderStatus
  receiptStatus: RealizationProgress
  /** When the requester confirmed they received everything. */
  receivedAt: string | null
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
  receivedBy: ProjectRabUserRef | null
  /** You made it, everything arrived and it is not confirmed yet. */
  canConfirmReceived: boolean
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
  /** RAB basis only: budget unit price. */
  unitPrice: string | null
  orderedQty: string
  receivedQty: string
}

/** What an SPK or a Purchasing RAB still has to request. */
export type PurchaseRequestPlan = {
  basis: 'spk' | 'rab'
  productionOrderId: string | null
  productionOrderNumber: string | null
  purchaseRabId: string | null
  purchaseRabNumber: string | null
  projectId: string | null
  projectNumber: string | null
  projectName: string | null
  /** SPK: shop drawing item; RAB: its title. */
  itemLabel: string
  plannedStart: string | null
  /** Keys counted as on the RAB for this SPP. */
  rabKeys: string[]
  rows: PurchaseRequestPlanRow[]
}

/** SPK / RAB vs extra is decided by the server from the SPK or RAB list. */
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
  'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled'

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

/** One vendor's past prices for a material×UOM, from approved POs. */
export type VendorPrice = {
  vendorId: string
  vendorName: string
  lastPrice: string
  lastOrderNumber: string
  lastDate: string | null
  minPrice: string
  orderCount: number
}

export type OpenRequestLine = {
  requestId: string
  requestNumber: string
  requestLineId: string
  neededDate: string
  projectId: string | null
  projectNumber: string
  projectName: string
  productionOrderNumber: string | null
  itemLabel: string | null
  purchaseRabId: string | null
  /** "Project RAB" or the Purchasing RAB's number · title. */
  rabLabel: string | null
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
  /** RAB purchase qty; null when the material is not on the RAB. */
  rabQty: string | null
  /** Ordered against the same RAB on other live POs. */
  rabOrderedQty: string
  /** Per vendor, cheapest last price first. */
  priceHistory: VendorPrice[]
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
  /** With other live POs this goes past the RAB qty. */
  overRabQty: boolean
  orderNote: string
  /** Arrived / bought on posted realizations. */
  realizedQty: string
}

export type PurchaseOrderSummary = {
  id: string
  number: string
  status: PurchaseOrderStatus
  vendorId: string
  vendorName: string
  /** Goods only. */
  total: string
  /** Goods + estimated tax / delivery / other (= total when nothing is estimated). */
  estimatedTotal: string
  lineCount: number
  overBudgetCount: number
  requestId: string
  requestNumber: string
  projectNumber: string
  projectName: string
  /** The SPP's Purchasing RAB; null for an SPK (project RAB) SPP. */
  purchaseRabId: string | null
  /** "Project RAB" or the Purchasing RAB's number · title. */
  rabLabel: string | null
  expectedDate: string | null
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  submittedAt: string | null
  approver1: ProjectRabUserRef | null
  approver2: ProjectRabUserRef | null
  /** Pending POs: the level waiting to approve. */
  approvalLevel: 1 | 2 | null
  approved1At: string | null
  approvedAt: string | null
  /** Posted receipts against the PO's lines. */
  receiptStatus: RealizationProgress
  /** Vendor payments marked paid, integer rupiah. */
  paidTotal: string
}

/** One material×UOM on the PO's RAB and/or the PO itself. */
export type PurchaseOrderRabCompareLine = {
  key: string
  materialItemId: string
  materialCode: string
  materialName: string
  uomSymbol: string
  /** Null when the item is not on the RAB. */
  rabQty: string | null
  rabUnitPrice: string | null
  rabAmount: string | null
  /** Qty on other live POs of the same RAB. */
  otherOrderedQty: string
  /** Null when the item is not on this PO. */
  poQty: string | null
  poUnitPrice: string | null
  poAmount: string | null
  /** Posted realizations; null when the item is not on this PO. */
  realizedQty: string | null
  realizedUnitPrice: string | null
  realizedAmount: string | null
}

export type PurchaseOrderRabCompare = {
  orderId: string
  orderNumber: string
  status: PurchaseOrderStatus
  vendorName: string
  projectNumber: string
  projectName: string
  rab: {
    label: string
    purchaseRabId: string | null
    projectId: string | null
    status: 'draft' | 'locked'
    total: string
    /** The RAB's own tax / delivery / other budget (whole RAB). */
    chargesTotal: string
    chargesByCategory: Record<PurchaseChargeCategory, string>
  } | null
  poTotal: string
  /** Posted realizations: goods only, charges, and count. */
  realizedSubtotal: string
  realizedCharges: string
  /** Posted charges per category vs the PO's estimates. */
  realizedChargesByCategory: Record<PurchaseChargeCategory, string>
  estimates: PurchaseChargeAmounts
  realizationCount: number
  lines: PurchaseOrderRabCompareLine[]
}

/** One version of the PO's vendor quotation (versioned like project documents). */
export type PurchaseOrderQuotation = {
  id: string
  version: number
  isCurrent: boolean
  isDeleted: boolean
  /** Earlier version with identical content, unless uploaded as forced different. */
  sameAsVersion: number | null
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string | null
  uploadedByName: string | null
  deletedAt: string | null
  deletedByName: string | null
}

export type PurchaseOrderQuotations = {
  current: PurchaseOrderQuotation | null
  /** Newest first, deleted ones included. */
  versions: PurchaseOrderQuotation[]
}

export const PO_QUOTATION_MAX_BYTES = 15 * 1024 * 1024

export type PurchaseOrder = PurchaseOrderSummary & {
  termOfPaymentId: string | null
  termOfPayment: string
  notes: string
  lines: PurchaseOrderLine[]
  rabTotal: string
  submittedBy: ProjectRabUserRef | null
  approved1By: ProjectRabUserRef | null
  approvedBy: ProjectRabUserRef | null
  quotation: PurchaseOrderQuotations
  /** Estimated tax / delivery / other rows; percents follow the goods total. */
  estimatedCharges: RealizationCharge[]
  /** Estimates per category (null = nothing estimated there). */
  estimates: PurchaseChargeAmounts
  /** Goods total + estimates. */
  estimatedTotal: string
  rejectedAt: string | null
  rejectedBy: ProjectRabUserRef | null
  rejectReason: string
  cancelledAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelReason: string
  /** Cancelled after part of it arrived: the received part stays on record. */
  closedPartial: boolean
  /** You created it, so you may edit, send, revise or cancel it. */
  canChange: boolean
  /** You are the approver the PO waits on now. */
  canApprove: boolean
  realizationStatus: RealizationProgress
  /** Posted notas incl. their charges. */
  realizedTotal: string
  /** Posted notas, goods only: compares with `total`. */
  realizedSubtotal: string
  realizations: Array<{
    id: string
    number: string
    status: RealizationStatus
    method: RealizationMethod
    purchaseDate: string
    total: string
    difference: string
  }>
}

/** "1016400" → "Rp 1.016.400". */
export function formatRupiah(digits: string | null | undefined): string {
  if (!digits) return '—'
  const n = Number(digits)
  return Number.isFinite(n)
    ? `Rp ${new Intl.NumberFormat('id-ID').format(n)}`
    : '—'
}

export function purchaseOrderStatusChipClass(
  status: PurchaseOrderStatus,
): string {
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

// ---- Realization (vendor: Penerimaan, staff: Nota Realisasi) ----

export type RealizationStatus = 'draft' | 'posted' | 'voided'
export type RealizationMethod = 'vendor' | 'staff'
export type RealizationProgress = 'none' | 'partial' | 'full'

export const REALIZATION_STATUS_LABELS: Record<RealizationStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  voided: 'Voided',
}

export const REALIZATION_METHOD_LABELS: Record<RealizationMethod, string> = {
  vendor: 'From vendor',
  staff: 'Staff purchase',
}

/** Document title per method: one document type, two names. */
export const REALIZATION_DOC_LABELS: Record<RealizationMethod, string> = {
  vendor: 'Penerimaan',
  staff: 'Nota Realisasi',
}

export const REALIZATION_PROGRESS_LABELS: Record<RealizationProgress, string> =
  {
    none: 'Not arrived yet',
    partial: 'Partly arrived',
    full: 'All arrived',
  }

export type RealizationChargeKind = 'percent' | 'fixed'

/** Spending buckets for costs on top of the goods. */
export type PurchaseChargeCategory = 'tax' | 'delivery' | 'other'

export const PURCHASE_CHARGE_CATEGORIES: PurchaseChargeCategory[] = [
  'tax',
  'delivery',
  'other',
]

export const PURCHASE_CHARGE_CATEGORY_LABELS: Record<
  PurchaseChargeCategory,
  string
> = {
  tax: 'Tax',
  delivery: 'Delivery',
  other: 'Others',
}

/** Integer rupiah per category; null = not estimated / nothing. */
export type PurchaseChargeAmounts = Record<PurchaseChargeCategory, string | null>

export type RealizationCharge = {
  id: string
  category: PurchaseChargeCategory
  label: string
  kind: RealizationChargeKind
  /** Percent of the goods subtotal, for `percent`. */
  rate: string | null
  /** Integer rupiah. */
  amount: string
}

/** Same rounding as the server: percent of the subtotal, half up. */
export function percentChargeAmount(subtotal: string, rate: string): string {
  const s = Number(subtotal)
  const r = Number(rate)
  if (!Number.isFinite(s) || !Number.isFinite(r) || r <= 0) return '0'
  return String(Math.round((s * r) / 100))
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
  /** The PO's tax / delivery / other estimates, as a guide for the charges. */
  estimates: PurchaseChargeAmounts
  lines: RealizationPoLine[]
  /** Other drafts on this PO; their qty is already held. */
  drafts: RealizationDraftRef[]
  /** Subcon SPK material: vendors it may be delivered straight to; null when not possible. */
  directToVendor: string[] | null
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
  receivedByName: string
  purchaseDate: string
  place: string
  deliveryNoteNumber: string
  /** `vendor`: the supplier delivered straight to the subcon vendor. */
  deliveredTo: 'us' | 'vendor'
  /** Staff notas: the reimbursement paying it back, if any. */
  reimbursement: {
    id: string
    number: string
    status: PurchasePaymentStatus
  } | null
  /** Σ goods lines. */
  subtotal: string
  chargesTotal: string
  /** subtotal + chargesTotal. */
  total: string
  /** Goods lines only: actual − approved. */
  difference: string
  photoCount: number
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  postedAt: string | null
}

export type Realization = RealizationSummary & {
  buyerUserId: string | null
  receivedByUserId: string | null
  notaNumber: string
  comments: string
  lines: RealizationLine[]
  charges: RealizationCharge[]
  photos: RealizationPhoto[]
  postedBy: ProjectRabUserRef | null
  voidedAt: string | null
  voidedBy: ProjectRabUserRef | null
  voidReason: string
  canChange: boolean
}

export type RealizationDraftRef = { id: string; number: string }

export type RealizationQueueRow = PurchaseOrderSummary & {
  realizationStatus: RealizationProgress
  realizedTotal: string
  /** Drafts not posted yet on this PO. */
  drafts: RealizationDraftRef[]
  /** Posted + draft qty already cover the whole PO. */
  heldByDrafts: boolean
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

// ---- Purchasing RAB (budget outside the BOQ) ----

export type PurchaseRabStatus = 'draft' | 'locked'

export const PURCHASE_RAB_STATUSES: PurchaseRabStatus[] = ['draft', 'locked']

export const PURCHASE_RAB_STATUS_LABELS: Record<PurchaseRabStatus, string> = {
  draft: 'Draft',
  locked: 'Locked',
}

export type PurchaseRabSummary = {
  id: string
  number: string
  title: string
  status: PurchaseRabStatus
  lineCount: number
  total: string
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  lockedAt: string | null
}

export type PurchaseRabLine = {
  key: string
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  qty: string
  unitPrice: string
  amount: string
  note: string
  /** On live SPPs made for this RAB. */
  requestedQty: string
  /** On live POs for those SPPs. */
  orderedQty: string
}

export type PurchaseRab = PurchaseRabSummary & {
  notes: string
  lines: PurchaseRabLine[]
  /** Budgeted tax / delivery / other; percents follow the lines total. */
  charges: RealizationCharge[]
  chargesTotal: string
  /** Lines total + charges. */
  grandTotal: string
  lockedBy: ProjectRabUserRef | null
  requests: Array<{ id: string; number: string; status: PurchaseRequestStatus }>
  /** Locked and no live SPP uses it. */
  canUnlock: boolean
}

export type PurchaseRabLineInput = {
  materialItemId: string
  itemUomId: string
  qty: string
  unitPrice: string
  note: string
}

// ---- Payments (vendor stages, staff reimbursements) ----

export type PurchasePaymentKind = 'vendor' | 'reimburse'
export type PurchasePaymentStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'cancelled'
export type PurchasePaymentStage = 'dp' | 'termin' | 'pelunasan'
export type PurchasePaymentMethod = 'transfer' | 'cash' | 'other'

/** Level 1 → level 2 sign-off. */
export type PaymentApproval = {
  approver1: ProjectRabUserRef | null
  approver2: ProjectRabUserRef | null
  approvalLevel: 1 | 2 | null
  awaitingUserId: string | null
  /** You are the approver this waits on now. */
  viewerCanApprove: boolean
  approved1By: ProjectRabUserRef | null
  approved1At: string | null
  approvedBy: ProjectRabUserRef | null
  approvedAt: string | null
  rejectedBy: ProjectRabUserRef | null
  rejectedAt: string | null
  rejectReason: string
}

export type ReimburseItem = PaymentApproval & {
  id: string
  realizationId: string
  realizationNumber: string
  purchaseOrderId: string
  purchaseOrderNumber: string
  purchaseDate: string
  place: string
  amount: string
  status: 'pending' | 'approved' | 'rejected'
}

export type PaymentProof = {
  id: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
}

export type PurchasePayment = PaymentApproval & {
  /** You made this request (may edit, send, cancel). */
  viewerIsOwner: boolean
  id: string
  number: string
  kind: PurchasePaymentKind
  status: PurchasePaymentStatus
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  vendorName: string | null
  stage: PurchasePaymentStage | null
  basis: 'percent' | 'fixed' | null
  rate: string | null
  realizations: Array<{
    id: string
    number: string
    purchaseDate: string
    total: string
  }>
  payeeUserId: string | null
  payeeName: string
  items: ReimburseItem[]
  amount: string
  dueDate: string | null
  notes: string
  createdBy: ProjectRabUserRef | null
  createdAt: string | null
  submittedAt: string | null
  paidAt: string | null
  paidBy: ProjectRabUserRef | null
  paidDate: string | null
  method: PurchasePaymentMethod | null
  reference: string
  proofs: PaymentProof[]
  cancelledAt: string | null
  cancelledBy: ProjectRabUserRef | null
  cancelReason: string
}

/** A PO's vendor payments and what is left to pay. */
export type PurchaseOrderPayments = {
  purchaseOrderId: string
  /** Estimate until fully received, then the actual received amount. */
  payable: string
  final: boolean
  scheduledTotal: string
  paidTotal: string
  remaining: string
  /** Bought by staff: paid by reimbursement, not to the vendor. */
  staffRealizedTotal: string
  payments: PurchasePayment[]
}

/** Slim row for Finance → Payments vendor-stage PO picker. */
export type PayablePurchaseOrder = {
  id: string
  number: string
  vendorName: string
  payable: string
  remaining: string
  final: boolean
}

export type ReimbursableNota = {
  realizationId: string
  number: string
  purchaseOrderId: string
  purchaseOrderNumber: string
  purchaseDate: string
  place: string
  total: string
}

export const PAYMENT_STATUS_LABELS: Record<PurchasePaymentStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Waiting approval',
  approved: 'To pay',
  paid: 'Paid',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export const PAYMENT_STAGE_LABELS: Record<PurchasePaymentStage, string> = {
  dp: 'DP',
  termin: 'Termin',
  pelunasan: 'Pelunasan',
}

export const PAYMENT_METHOD_LABELS: Record<PurchasePaymentMethod, string> = {
  transfer: 'Bank transfer',
  cash: 'Cash',
  other: 'Other',
}

/** "DP 30%", "Termin", "Reimbursement". */
export function paymentLabel(p: PurchasePayment): string {
  if (p.kind === 'reimburse') return 'Reimbursement'
  const stage = p.stage ? PAYMENT_STAGE_LABELS[p.stage] : 'Payment'
  return p.basis === 'percent' && p.rate ? `${stage} ${p.rate}%` : stage
}

export function paymentStatusTone(
  status: PurchasePaymentStatus,
): 'neutral' | 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'paid':
      return 'success'
    case 'approved':
      return 'info'
    case 'pending_approval':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'neutral'
  }
}
