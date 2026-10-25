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
  /** Issued: snapshot. Draft: the shop drawing item's current category. */
  category: string | null
}

/** Category group for printing; an empty list means the quotation is flat. */
export type QuotationSection = {
  title: string
  /** "I", "II", … for the SUB TOTAL row. */
  numeral: string
  /** Indexes into `lines`, in printed order. */
  lineIndexes: number[]
  subtotal: string
}

/** Lines in printed order, with section header / subtotal rows when grouped. */
export type QuotationPrintRow<L> =
  | { type: 'line'; no: number; line: L }
  | { type: 'section'; title: string }
  | { type: 'subtotal'; label: string; amount: string }

export function quotationPrintRows<L>(
  lines: L[],
  sections: QuotationSection[],
): QuotationPrintRow<L>[] {
  if (sections.length === 0) {
    return lines.map((line, i) => ({ type: 'line', no: i + 1, line }))
  }
  return sections.flatMap((s): QuotationPrintRow<L>[] => [
    { type: 'section', title: s.title },
    ...s.lineIndexes.map((idx, i): QuotationPrintRow<L> => ({
      type: 'line',
      no: i + 1,
      line: lines[idx]!,
    })),
    { type: 'subtotal', label: `SUB TOTAL ${s.numeral}`, amount: s.subtotal },
  ])
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
  sections: QuotationSection[]
  /** Issuer full name printed under "Hormat kami" (issued only). */
  issuedByName: string | null
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
  sections: QuotationSection[]
  issuedByName: string | null
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
