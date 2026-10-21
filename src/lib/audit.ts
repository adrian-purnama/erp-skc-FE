export type AuditAction = 'A' | 'U' | 'D'

export type AuditCollection = {
  key: string
  label: string
  auditCollection: string
  modelName: string
}

export type AuditActor = {
  id: string
  email: string
}

export type AuditEvent = {
  id: string
  refId: string
  action: AuditAction
  at: string
  by: AuditActor | null
  summary: { label?: string; changedKeys?: string[] }
  before: unknown
  after: unknown
}

export type AuditListResult = {
  items: AuditEvent[]
  total: number
  page: number
  limit: number
}

export function actionLabel(action: AuditAction): string {
  if (action === 'A') return 'Created'
  if (action === 'U') return 'Updated'
  return 'Deleted'
}

export function changeSummary(event: AuditEvent): string {
  if (event.action === 'A') return 'created'
  if (event.action === 'D') return 'deleted'
  const n = event.summary.changedKeys?.length ?? 0
  if (n === 0) return 'no field changes'
  if (n === 1) return '1 field'
  return `${n} fields`
}

export function shortId(id: string): string {
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}
