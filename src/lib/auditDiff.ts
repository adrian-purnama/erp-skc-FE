export type DiffRow = {
  key: string
  before: unknown
  after: unknown
  changed: boolean
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v instanceof Date ? v.toISOString() : v,
  )
}

/** Top-level field diff between before/after snapshots. */
export function fieldDiff(before: unknown, after: unknown): DiffRow[] {
  const a =
    before && typeof before === 'object'
      ? (before as Record<string, unknown>)
      : {}
  const b =
    after && typeof after === 'object' ? (after as Record<string, unknown>) : {}
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  return keys
    .filter((key) => key !== '__v')
    .map((key) => {
      const beforeVal = a[key]
      const afterVal = b[key]
      return {
        key,
        before: beforeVal,
        after: afterVal,
        changed: stable(beforeVal) !== stable(afterVal),
      }
    })
}

export function formatAuditValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
}
