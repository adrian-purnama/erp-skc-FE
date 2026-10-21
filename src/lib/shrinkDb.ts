export type ShrinkSection = 'audit' | 'documents'

export type ShrinkDbStep =
  | 'idle'
  | 'audit'
  | 'documents'
  | 'shopDrawings'
  | 'finalize'

export type ShrinkLiveStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'

export type ShrinkOrphanReport = {
  shrinkBlobsPurged: number
  unmatchedBlobIds: string[]
  scopesMissingCurrent: Array<{
    kind: 'document' | 'shopDrawing'
    projectId: string
    scope: string
  }>
}

export type ShrinkRunResult = {
  auditDeleted: number
  documentVersionsSoftDeleted: number
  shopDrawingVersionsSoftDeleted: number
  blobsPurged: number
  errors: string[]
  orphans?: ShrinkOrphanReport
}

export type ShrinkDbStatus = {
  jobId: string | null
  status: ShrinkLiveStatus
  section: ShrinkSection | null
  step: ShrinkDbStep
  processed: number
  total: number
  percent: number
  excludedProjectIds: string[]
  result: ShrinkRunResult | null
  errorMessage: string | null
  startedAt: string | null
  lastHeartbeatAt: string | null
  persistedStatus?: string
}

export const SHRINK_SECTION_LABELS: Record<ShrinkSection, string> = {
  audit: 'Audit log cleanup',
  documents: 'Documents & shop drawings',
}

export const SHRINK_STEP_LABELS: Record<ShrinkDbStep, string> = {
  idle: 'Idle',
  audit: 'Cleaning audit logs',
  documents: 'Soft-deleting old document versions',
  shopDrawings: 'Soft-deleting old shop drawing versions',
  finalize: 'Finalizing',
}
