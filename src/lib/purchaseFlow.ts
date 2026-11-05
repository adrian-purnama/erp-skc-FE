import type { PipelineTone } from '#/lib/projectPipeline'
import type {
  PurchaseOrderStatus,
  PurchasePaymentKind,
  PurchasePaymentStage,
  PurchasePaymentStatus,
  PurchaseRequestStatus,
  RealizationMethod,
  RealizationStatus,
  VendorInvoiceStatus,
} from '#/lib/purchasing'
import type {
  ProductionOrderStatus,
  ProductionLabourExecutor,
} from '#/lib/production'

export type PurchaseFlowKind =
  'request' | 'order' | 'realization' | 'invoice' | 'payment' | 'spk'

/** SPP → PO → receipts → invoices → payments around one document, related ones only. */
export type PurchaseFlowStage =
  'request' | 'order' | 'receive' | 'invoice' | 'pay'

export type PurchaseFlow = {
  focus: { kind: PurchaseFlowKind; id: string }
  /** Stages this viewer may see: a requester gets request + order, no amounts. */
  stages: PurchaseFlowStage[]
  spks: Array<{
    id: string
    number: string
    labourName: string
    executor: ProductionLabourExecutor
    status: ProductionOrderStatus
  }>
  purchaseRabs: Array<{ id: string; number: string }>
  requests: Array<{ id: string; number: string; status: PurchaseRequestStatus }>
  orders: Array<{
    id: string
    number: string
    status: PurchaseOrderStatus
    closedPartial: boolean
    approvalLevel: 1 | 2 | null
    vendorName: string
    total: string
    estimatedTotal: string
    /** A subcon / outsource vendor fee PO. */
    vendorFee: boolean
    receipt: 'none' | 'partial' | 'full'
    receivedSubtotal: string
    payable: string | null
    paid: string | null
  }>
  realizations: Array<{
    id: string
    number: string
    status: RealizationStatus
    method: RealizationMethod
    purchaseOrderId: string
    total: string
    deliveredTo: 'us' | 'vendor'
    /** Vendor GR: its live invoice; null = still at the PO price. */
    invoiceId: string | null
  }>
  invoices: Array<{
    id: string
    number: string
    status: VendorInvoiceStatus
    purchaseOrderId: string
    vendorInvoiceNumber: string
    total: string
  }>
  payments: Array<{
    id: string
    number: string
    kind: PurchasePaymentKind
    status: PurchasePaymentStatus
    stage: PurchasePaymentStage
    amount: string
    purchaseOrderId: string
    payeeName: string
  }>
  totals: {
    ordered: string
    receivedGoods: string
    owed: string
    paid: string
    /** Posted staff notas (paid back by reimbursement) and what of that is reimbursed. */
    staffBought: string
    reimbursed: string
  }
}

export type FlowStageInsight = {
  tone: PipelineTone
  label: string
  /** 0–100, or null for no bar. */
  pct: number | null
  detail: string
}

export type PurchaseFlowInsight = {
  request: FlowStageInsight
  order: FlowStageInsight
  receive: FlowStageInsight
  invoice: FlowStageInsight
  pay: FlowStageInsight
  next: { tone: PipelineTone; text: string }
}

const rp = (digits: string | number) =>
  `Rp ${new Intl.NumberFormat('id-ID').format(Number(digits) || 0)}`

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0
}

/** Where a purchase stands, stage by stage, and what to do next. */
export function buildPurchaseFlowInsight(
  flow: PurchaseFlow,
): PurchaseFlowInsight {
  const liveRequests = flow.requests.filter(
    (r) => r.status === 'draft' || r.status === 'submitted',
  )
  const request: FlowStageInsight =
    flow.requests.length === 0
      ? { tone: 'idle', label: 'None', pct: null, detail: 'No SPP' }
      : liveRequests.some((r) => r.status === 'submitted')
        ? {
            tone: 'ok',
            label: 'Submitted',
            pct: null,
            detail: `${flow.requests.length} SPP`,
          }
        : liveRequests.length > 0
          ? {
              tone: 'progress',
              label: 'Draft',
              pct: null,
              detail: 'Not submitted yet',
            }
          : {
              tone: 'warn',
              label: 'Closed',
              pct: null,
              detail: 'Cancelled or declined',
            }

  const live = flow.orders.filter(
    (o) => o.status !== 'cancelled' || o.closedPartial,
  )
  const pending = live.filter((o) => o.status === 'pending_approval')
  const drafts = live.filter((o) => o.status === 'draft')
  const rejected = live.filter((o) => o.status === 'rejected')
  const approved = live.filter(
    (o) => o.status === 'approved' || o.closedPartial,
  )
  const ordered = Number(flow.totals.ordered)
  const requesterOnly = !flow.stages.includes('pay')
  const order: FlowStageInsight =
    live.length === 0
      ? { tone: 'idle', label: 'Not ordered', pct: null, detail: 'No PO yet' }
      : rejected.length > 0
        ? {
            tone: 'warn',
            label: 'Rejected',
            pct: null,
            detail: `${rejected.length} PO to revise`,
          }
        : pending.length > 0
          ? {
              tone: 'progress',
              label: `Waiting L${pending[0]!.approvalLevel ?? 1}`,
              pct: null,
              detail: `${approved.length} of ${live.length} approved`,
            }
          : drafts.length > 0
            ? {
                tone: 'progress',
                label: 'Draft',
                pct: null,
                detail: `${drafts.length} PO not sent`,
              }
            : {
                tone: 'ok',
                label: 'Approved',
                pct: null,
                detail: requesterOnly
                  ? `${live.length} PO approved`
                  : rp(ordered),
              }

  const received = Number(flow.totals.receivedGoods)
  const allFull =
    approved.length > 0 &&
    approved.every((o) => o.receipt === 'full' || o.closedPartial)
  const receive: FlowStageInsight =
    approved.length === 0
      ? {
          tone: 'idle',
          label: 'Not yet',
          pct: null,
          detail: 'Needs an approved PO',
        }
      : allFull
        ? { tone: 'ok', label: 'Received', pct: 100, detail: rp(received) }
        : received > 0
          ? {
              tone: 'progress',
              label: 'Partial',
              pct: pct(received, ordered),
              detail: `${rp(received)} of ${rp(ordered)}`,
            }
          : {
              tone: 'idle',
              label: 'Not received',
              pct: 0,
              detail: 'Nothing arrived yet',
            }

  // Vendor GRs are priced by their invoice; until then they count at the PO price.
  const postedInvoice = new Set(
    flow.invoices.filter((i) => i.status === 'posted').map((i) => i.id),
  )
  const vendorGrs = flow.realizations.filter(
    (r) => r.method === 'vendor' && r.status === 'posted',
  )
  const invoiced = vendorGrs.filter(
    (r) => r.invoiceId !== null && postedInvoice.has(r.invoiceId),
  )
  const uninvoiced = vendorGrs.filter(
    (r) => r.invoiceId === null || !postedInvoice.has(r.invoiceId),
  )
  const invoice: FlowStageInsight =
    vendorGrs.length === 0
      ? {
          tone: 'idle',
          label: 'Nothing yet',
          pct: null,
          detail: 'No vendor goods receipt',
        }
      : uninvoiced.length === 0
        ? {
            tone: 'ok',
            label: 'Invoiced',
            pct: 100,
            detail: `${vendorGrs.length} of ${vendorGrs.length} GRs`,
          }
        : {
            tone: invoiced.length > 0 ? 'progress' : 'idle',
            label: invoiced.length > 0 ? 'Partial' : 'Not invoiced',
            pct: pct(invoiced.length, vendorGrs.length),
            detail: `${invoiced.length} of ${vendorGrs.length} GRs · rest at PO price`,
          }

  const owed = Number(flow.totals.owed)
  const paid = Number(flow.totals.paid)
  const pay: FlowStageInsight =
    owed <= 0
      ? {
          tone: 'idle',
          label: 'Nothing owed',
          pct: null,
          detail: 'Needs an approved PO',
        }
      : paid >= owed
        ? { tone: 'ok', label: 'Paid', pct: 100, detail: rp(paid) }
        : paid > 0
          ? {
              tone: 'progress',
              label: 'Partial',
              pct: pct(paid, owed),
              detail: `${rp(paid)} of ${rp(owed)}`,
            }
          : {
              tone: 'idle',
              label: 'Not paid',
              pct: 0,
              detail: `${rp(owed)} owed`,
            }

  const next = ((): PurchaseFlowInsight['next'] => {
    // A requester only waits on purchasing: say what they are waiting for.
    if (requesterOnly) {
      if (live.length === 0) {
        return liveRequests.length > 0
          ? { tone: 'progress', text: 'Waiting for purchasing to order it' }
          : { tone: 'idle', text: 'Nothing open in this request' }
      }
      if (approved.length === 0)
        return { tone: 'progress', text: 'Ordered: waiting for PO approval' }
      return { tone: 'ok', text: 'Ordered: waiting for delivery' }
    }
    if (live.length === 0) {
      return liveRequests.length > 0
        ? { tone: 'progress', text: 'Next: make a PO for this SPP' }
        : { tone: 'idle', text: 'Nothing open in this purchase' }
    }
    if (rejected.length > 0)
      return {
        tone: 'warn',
        text: `Next: revise ${rejected[0]!.number} and send it again`,
      }
    if (drafts.length > 0)
      return {
        tone: 'progress',
        text: `Next: send ${drafts[0]!.number} for approval`,
      }
    if (pending.length > 0) {
      return {
        tone: 'progress',
        text: `Waiting for level ${pending[0]!.approvalLevel ?? 1} approval of ${pending[0]!.number}`,
      }
    }
    if (!allFull)
      return { tone: 'progress', text: 'Next: record what arrives (receipt)' }
    if (uninvoiced.length > 0)
      return {
        tone: 'progress',
        text: `Next: add the vendor invoice for ${uninvoiced[0]!.number}${uninvoiced.length > 1 ? ` and ${uninvoiced.length - 1} more` : ''}`,
      }
    if (paid < owed)
      return {
        tone: 'progress',
        text: 'Next: pay what is owed (Finance → Payments)',
      }
    return { tone: 'ok', text: 'Done: ordered, received, invoiced and paid' }
  })()

  return { request, order, receive, invoice, pay, next }
}
