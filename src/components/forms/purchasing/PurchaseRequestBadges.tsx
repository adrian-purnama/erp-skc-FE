import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_REQUEST_STATUS_LABELS,
  REALIZATION_STATUS_LABELS,
  REQUEST_ORDER_STATUS_LABELS,
  realizationStatusChipClass,
  purchaseOrderStatusChipClass,
  purchaseRequestStatusChipClass,
  requestOrderStatusChipClass,
} from '#/lib/purchasing'
import type {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  RealizationStatus,
  RequestLineOrderStatus,
} from '#/lib/purchasing'
import { cn } from '#/lib/utils'

const chipBase =
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function PurchaseRequestStatusChip({
  status,
}: {
  status: PurchaseRequestStatus
}) {
  return (
    <span className={cn(chipBase, purchaseRequestStatusChipClass(status))}>
      {PURCHASE_REQUEST_STATUS_LABELS[status]}
    </span>
  )
}

export function PurchaseOrderStatusChip({
  status,
}: {
  status: PurchaseOrderStatus
}) {
  return (
    <span className={cn(chipBase, purchaseOrderStatusChipClass(status))}>
      {PURCHASE_ORDER_STATUS_LABELS[status]}
    </span>
  )
}

export function RequestOrderStatusChip({
  status,
}: {
  status: RequestLineOrderStatus
}) {
  return (
    <span className={cn(chipBase, requestOrderStatusChipClass(status))}>
      {REQUEST_ORDER_STATUS_LABELS[status]}
    </span>
  )
}

export function RealizationStatusChip({ status }: { status: RealizationStatus }) {
  return (
    <span className={cn(chipBase, realizationStatusChipClass(status))}>
      {REALIZATION_STATUS_LABELS[status]}
    </span>
  )
}

export type LineFlag =
  | 'extra'
  | 'notInRab'
  | 'overPlan'
  | 'overRequest'
  | 'overBudget'

const FLAG_LABELS: Record<LineFlag, string> = {
  extra: 'Extra',
  notInRab: 'Not in RAB',
  overPlan: 'Over plan',
  overRequest: 'More than requested',
  overBudget: 'Above RAB price',
}

const FLAG_TITLES: Record<LineFlag, string> = {
  extra: 'Not on the SPK material list',
  notInRab: 'This material and unit are not budgeted on the project RAB',
  overPlan: 'More than the SPK needs in total',
  overRequest: 'Ordering more than the request still needs',
  overBudget: 'Unit price is higher than the RAB price',
}

/** Small marker for lines purchasing should look at. */
export function LineFlagBadge({ flag }: { flag: LineFlag }) {
  return (
    <span
      title={FLAG_TITLES[flag]}
      className={cn(
        chipBase,
        'px-1.5 py-0',
        flag === 'extra'
          ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      )}
    >
      {FLAG_LABELS[flag]}
    </span>
  )
}

export function lineFlags(line: {
  source: 'spk' | 'extra'
  inRab: boolean
  overPlan: boolean
}): LineFlag[] {
  const flags: LineFlag[] = []
  if (line.source === 'extra') flags.push('extra')
  if (line.overPlan) flags.push('overPlan')
  if (!line.inRab) flags.push('notInRab')
  return flags
}
