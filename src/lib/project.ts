export const PROJECT_GENDERS = ['male', 'female'] as const
export type ProjectGender = (typeof PROJECT_GENDERS)[number]

export const PROJECT_STATUSES = [
  'open',
  'win',
  'lose',
  'close',
  'completed',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  open: 'Open',
  win: 'Win',
  lose: 'Lose',
  close: 'Close',
  completed: 'Completed',
}

/** Lifecycle phases shown on the project dashboard. */
export const PROJECT_PHASES = ['tender', 'internal', 'aftersales'] as const
export type ProjectPhase = (typeof PROJECT_PHASES)[number]

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  tender: 'Tender',
  internal: 'Internal',
  aftersales: 'Aftersales',
}

export function phaseForStatus(status: ProjectStatus): ProjectPhase {
  if (status === 'win') return 'internal'
  if (status === 'completed') return 'aftersales'
  return 'tender'
}

export function phaseIndex(phase: ProjectPhase): number {
  return PROJECT_PHASES.indexOf(phase)
}

export const PROJECT_LOSE_REASONS = [
  'price',
  'competitor',
  'timing',
  'budget',
  'other',
] as const
export type ProjectLoseReason = (typeof PROJECT_LOSE_REASONS)[number]

export const PROJECT_LOSE_REASON_LABELS: Record<ProjectLoseReason, string> = {
  price: 'Price',
  competitor: 'Competitor',
  timing: 'Timing',
  budget: 'Budget',
  other: 'Other',
}

export const PROJECT_CLOSE_REASONS = [
  'completed',
  'cancelled_customer',
  'cancelled_internal',
  'superseded',
  'other',
] as const
export type ProjectCloseReason = (typeof PROJECT_CLOSE_REASONS)[number]

export const PROJECT_CLOSE_REASON_LABELS: Record<ProjectCloseReason, string> = {
  completed: 'Completed',
  cancelled_customer: 'Cancelled by customer',
  cancelled_internal: 'Cancelled internally',
  superseded: 'Superseded',
  other: 'Other',
}

export const PROJECT_DOCUMENT_KINDS = [
  'sph',
  'content',
  'bboq',
  'siteSurvey',
  'meetingMinutes',
] as const
export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number]

export const PROJECT_DOCUMENT_KIND_LABELS: Record<ProjectDocumentKind, string> =
  {
    sph: 'SPH',
    content: 'Content',
    bboq: 'BBOQ Excel',
    siteSurvey: 'Site Survey',
    meetingMinutes: 'Minutes of Meeting',
  }

/** Non-versioned project file repos (any type, soft-delete + audit). */
export const PROJECT_LOOSE_FILE_KINDS = ['shopDrawingMap'] as const
export type ProjectLooseFileKind = (typeof PROJECT_LOOSE_FILE_KINDS)[number]

export const PROJECT_LOOSE_FILE_KIND_LABELS: Record<
  ProjectLooseFileKind,
  string
> = {
  shopDrawingMap: 'Forcon / Map',
}

export type ProjectLooseFile = {
  id: string
  kind: ProjectLooseFileKind
  originalFilename: string
  contentType: string
  sizeBytes: number
  contentHash?: string | null
  isDeleted: boolean
  uploadedAt: string | null
  uploadedByName: string | null
  deletedAt: string | null
  deletedByName: string | null
  linked?: boolean
}

export type ProjectLooseFilesByKind = {
  kind: ProjectLooseFileKind
  files: ProjectLooseFile[]
}

export const PROJECT_FILE_MAX_BYTES = 20 * 1024 * 1024
export const PROJECT_LOOSE_FILE_MAX_BYTES = PROJECT_FILE_MAX_BYTES
export const PROJECT_DOCUMENT_MAX_BYTES = PROJECT_FILE_MAX_BYTES

export type ProjectCustomerContact = {
  name: string
  gender: ProjectGender
  contact: Record<string, string>
}

export type ProjectListItem = {
  id: string
  name: string
  description: string
  customerId: string
  customerName: string | null
  projectNumber: string
  status: ProjectStatus
  loseReason: ProjectLoseReason | null
  closeReason: ProjectCloseReason | null
  isActive: boolean
}

export type ProjectDetail = ProjectListItem & {
  customerContact: ProjectCustomerContact
}

export type ProjectDocument = {
  id: string
  kind: ProjectDocumentKind
  version: number
  isCurrent: boolean
  isDeleted: boolean
  contentHash?: string | null
  sameAsVersion?: number | null
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string | null
  uploadedByName: string | null
  deletedAt: string | null
  deletedByName: string | null
  linked?: boolean
}

export type ProjectDocumentsByKind = {
  kind: ProjectDocumentKind
  current: ProjectDocument | null
  versions: ProjectDocument[]
}

export type ProjectShopDrawingFile = {
  id: string
  itemId: string
  version: number
  isCurrent: boolean
  isDeleted: boolean
  contentHash?: string | null
  sameAsVersion?: number | null
  hasBoq: boolean
  originalFilename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string | null
  uploadedByName: string | null
  deletedAt: string | null
  deletedByName: string | null
  linked?: boolean
}

export type ProjectShopDrawingItem = {
  id: string
  name: string
  current: ProjectShopDrawingFile | null
  versions: ProjectShopDrawingFile[]
}

export type ProjectShopDrawingBoqLineInputs = {
  v1: string
  v2?: string
  v3?: string
}

export type ProjectShopDrawingBoqFinishPlacement = 'top' | 'bottom'

export type ProjectShopDrawingBoqMountingType =
  | 'mounted'
  | 'hanging'
  | 'freestanding'
  | 'other'

export type ProjectShopDrawingBoqLine = {
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  uomName: string
  formula: string
  inputs: ProjectShopDrawingBoqLineInputs
  qtyPerUnit: string
  totalQty: string
}

export type ProjectShopDrawingBoqFinishing = {
  finishingOrder: number
  placement: ProjectShopDrawingBoqFinishPlacement
  lines: ProjectShopDrawingBoqLine[]
}

export type ProjectShopDrawingBoqBase = ProjectShopDrawingBoqLine & {
  key: string
  spec?: string
  finishings: ProjectShopDrawingBoqFinishing[]
}

export type ProjectShopDrawingBoqPart = {
  key: string
  label?: string
  bases: ProjectShopDrawingBoqBase[]
}

export type ProjectShopDrawingBoqAssembly = {
  lines: ProjectShopDrawingBoqLine[]
}

export type ProjectShopDrawingBoqMain = {
  parts: ProjectShopDrawingBoqPart[]
  assembly: ProjectShopDrawingBoqAssembly
}

export type ProjectShopDrawingBoqLighting = {
  lines: ProjectShopDrawingBoqLine[]
}

export type ProjectShopDrawingBoqMounting = {
  type: ProjectShopDrawingBoqMountingType
  lines: ProjectShopDrawingBoqLine[]
}

export type ProjectShopDrawingBoqOther = {
  lines: ProjectShopDrawingBoqLine[]
}

export type ProjectShopDrawingBoq = {
  id: string
  projectId: string
  shopDrawingItemId: string
  shopDrawingItemName: string
  shopDrawingFileId: string
  fileVersion: number
  originalFilename: string
  makeQty: string
  main: ProjectShopDrawingBoqMain
  lighting: ProjectShopDrawingBoqLighting
  mounting: ProjectShopDrawingBoqMounting
  other: ProjectShopDrawingBoqOther
  warnings: string[]
}

export type ProjectShopDrawingBoqMaterialUom = {
  id: string
  itemId: string
  uomId: string
  isBase: boolean
  conversionFactor: string | null
  sortOrder: number
  symbol: string
  name: string
  formulas: string[]
}

export type ProjectShopDrawingBoqMaterial = {
  id: string
  itemId: string
  name: string
  description: string
  baseUomId: string | null
  uoms: ProjectShopDrawingBoqMaterialUom[]
}

export type ProjectShopDrawingBoqVersionSummary = {
  fileId: string
  version: number
  originalFilename: string
  isCurrent: boolean
  hasBoq: boolean
}

export type ProjectShopDrawingBoqItemSummary = {
  itemId: string
  name: string
  versions: ProjectShopDrawingBoqVersionSummary[]
}

export type ProjectRabUserRef = {
  id: string
  name: string
}

export type ProjectRabLine = {
  key: string
  materialItemId: string
  materialCode: string
  materialName: string
  itemUomId: string
  uomSymbol: string
  uomName: string
  totalQty: string
  unitPrice: string | null
  tarifId: string | null
  lineTotal: string | null
  hasTarif: boolean
  origin: 'lock' | 'append' | null
  addedAt: string | null
  addedBy: ProjectRabUserRef | null
  priceEditable: boolean
}

export type ProjectRabItemGroup = {
  materialItemId: string
  materialCode: string
  materialName: string
  hasTarif: boolean
  lines: ProjectRabLine[]
}

export type ProjectRab = {
  id: string
  projectId: string
  status: 'draft' | 'locked'
  lockedAt: string | null
  lockedBy: ProjectRabUserRef | null
  groups: ProjectRabItemGroup[]
  grandTotal: string | null
}

export type ProjectRabElaborationLine = {
  materialName: string
  materialCode: string
  uomSymbol: string
  qtyPerUnit: string
  makeQty: string
  totalQty: string
}

export type ProjectRabElaborationBlock = {
  title: string
  lines: ProjectRabElaborationLine[]
}

export type ProjectRabElaborationDoc = {
  shopDrawingItemName: string
  fileVersion: number
  originalFilename: string
  makeQty: string
  blocks: ProjectRabElaborationBlock[]
}

export type ProjectRabElaboration = {
  documents: ProjectRabElaborationDoc[]
}
