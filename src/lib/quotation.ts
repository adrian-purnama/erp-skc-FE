import type { ProjectCustomerContact, ProjectRabUserRef } from '#/lib/project'

export type QuotationStatus = 'draft' | 'issued' | 'superseded'
export type QuotationDiscountType = 'percent' | 'amount'

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  superseded: 'Superseded',
}

export type QuotationLine = {
  key: string
  kind: 'item' | 'labour'
  shopDrawingItemId: string | null
  shopDrawingFileId: string | null
  description: string
  qty: string
  uom: string
  costUnitPrice: string
  unitPrice: string
  priceOverridden: boolean
  lineTotal: string
}

export type QuotationTotals = {
  costTotal: string
  subtotal: string
  discountAmount: string
  taxBase: string
  taxAmount: string
  grandTotal: string
  margin: string
}

export type QuotationSummary = {
  id: string
  projectId: string
  revision: number
  quotationNumber: string
  status: QuotationStatus
  rabRevision: number
  grandTotal: string
  createdAt: string | null
  createdBy: ProjectRabUserRef | null
  issuedAt: string | null
  issuedBy: ProjectRabUserRef | null
}

export type Quotation = QuotationSummary & {
  subject: string
  markupPercent: string
  discountType: QuotationDiscountType
  discountValue: string
  taxPercent: string
  validUntil: string | null
  notes: string
  termOfPaymentId: string | null
  termOfPaymentText: string
  company: {
    name: string
    npwp: string
    address: string
    phone: string
    email: string
    website: string
    hasLogo: boolean
  }
  customer: { customerId: string; name: string; address: string; npwp: string }
  contact: ProjectCustomerContact
  lines: QuotationLine[]
  totals: QuotationTotals
  rabOutdated: boolean
  /** Client link (also the QR on the PDF); null for drafts. */
  verifyUrl: string | null
  verifyState: QuotationVerifyState
}

export type QuotationVerifyState =
  'valid' | 'expired' | 'superseded' | 'unavailable'

/** What the client link returns; `quotation` only while `state` is valid. */
export type PublicQuotationLink = {
  state: QuotationVerifyState
  quotationNumber: string | null
  companyName: string | null
  validUntil: string | null
  quotation: PublicQuotation | null
}

export type PublicQuotation = {
  quotationNumber: string
  revision: number
  issuedAt: string | null
  validUntil: string | null
  subject: string
  company: {
    name: string
    npwp: string
    address: string
    phone: string
    email: string
    website: string
    hasLogo: boolean
  }
  customer: { name: string; address: string }
  attention: string
  lines: Array<{
    description: string
    qty: string
    uom: string
    unitPrice: string
    lineTotal: string
  }>
  discountType: QuotationDiscountType
  discountValue: string
  taxPercent: string
  totals: {
    subtotal: string
    discountAmount: string
    taxBase: string
    taxAmount: string
    grandTotal: string
  }
  termOfPaymentText: string
  notes: string
}

/** YYYY-MM-DD → "30 November 2026" (id-ID). */
export function formatYmdLong(ymd: string | null): string {
  if (!ymd) return '—'
  const d = new Date(`${ymd}T00:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return ymd
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d)
}

export type QuotationOverview = {
  projectId: string
  rabStatus: 'none' | 'draft' | 'locked'
  rabChangeDraftOpen: boolean
  currentRabRevision: number
  createBlockedReason: string | null
  revisions: QuotationSummary[]
}

export type QuotationHeaderPatch = Partial<{
  subject: string
  markupPercent: string
  discountType: QuotationDiscountType
  discountValue: string
  taxPercent: string
  validUntil: string | null
  notes: string
  termOfPaymentId: string | null
}>

export type QuotationLinePatch = Partial<{
  description: string
  uom: string
  unitPrice: string | null
}>

export function formatRupiah(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount.trim() === '')
    return '—'
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)}`
}
