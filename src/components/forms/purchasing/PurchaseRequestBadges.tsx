import { Link } from '@tanstack/react-router'
import { useAuth } from '#/context/authContext'
import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_RAB_STATUS_LABELS,
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
  PurchaseRabStatus,
  PurchaseRequestLineSource,
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

export function PurchaseRabStatusChip({ status }: { status: PurchaseRabStatus }) {
  return (
    <span
      className={cn(
        chipBase,
        status === 'locked'
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      )}
    >
      {PURCHASE_RAB_STATUS_LABELS[status]}
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

export function RealizationStatusChip({
  status,
}: {
  status: RealizationStatus
}) {
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
  | 'overRabQty'

export const FLAG_LABELS: Record<LineFlag, string> = {
  extra: 'Extra',
  notInRab: 'Not in RAB',
  overPlan: 'Over plan',
  overRequest: 'More than requested',
  overBudget: 'Above RAB price',
  overRabQty: 'Above RAB qty',
}

export const FLAG_TITLES: Record<LineFlag, string> = {
  extra: 'Not on the SPK material list or the RAB',
  notInRab: 'This material and unit are not budgeted on the RAB',
  overPlan: 'More than the SPK needs / the RAB budgets in total',
  overRequest: 'Ordering more than the request still needs',
  overBudget: 'Unit price is higher than the RAB price',
  overRabQty: 'With the other POs on this RAB, more than the RAB qty',
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
  source: PurchaseRequestLineSource
  inRab: boolean
  overPlan: boolean
}): LineFlag[] {
  const flags: LineFlag[] = []
  if (line.source === 'extra') flags.push('extra')
  if (line.overPlan) flags.push('overPlan')
  if (!line.inRab) flags.push('notInRab')
  return flags
}

/**
 * Link to the RAB an SPP / PO is checked against: the Purchasing RAB, or the
 * project RAB of an SPK's project. Plain text when the viewer cannot open it.
 */
export function RabLink({
  purchaseRabId,
  projectId,
  label,
  className,
}: {
  purchaseRabId: string | null
  projectId: string | null
  label: string
  className?: string
}) {
  const { can } = useAuth()
  const linkClass = cn(
    'font-medium tabular-nums underline-offset-4 hover:underline',
    className,
  )
  if (purchaseRabId) {
    return (
      <Link
        to="/dashboard/purchasing/rabs/$rabId"
        params={{ rabId: purchaseRabId }}
        className={linkClass}
      >
        {label}
      </Link>
    )
  }
  if (projectId && can('project.view')) {
    return (
      <Link to="/dashboard/internal/rab" search={{ projectId }} className={linkClass}>
        {label}
      </Link>
    )
  }
  return <span className={cn('font-medium', className)}>{label}</span>
}
