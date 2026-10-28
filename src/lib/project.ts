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
export const PROJECT_PHASES = [
  'tender',
  'internal',
  'production',
  'aftersales',
] as const
export type ProjectPhase = (typeof PROJECT_PHASES)[number]

export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  tender: 'Tender',
  internal: 'Internal',
  production: 'Production',
  aftersales: 'Aftersales',
}

export function phaseForStatus(
  status: ProjectStatus,
  productionReleasedAt?: string | null,
): ProjectPhase {
  if (status === 'completed') return 'aftersales'
  if (productionReleasedAt) return 'production'
  if (status === 'win') return 'internal'
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
  /** Set once the project is released to production. */
  productionReleasedAt: string | null
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
  /** Kode, e.g. "SA1". */
  code: string
  name: string
  /** `{code}-{name}`. */
  label: string
  /** Keterangan, one spec line per entry. */
  descriptions: string[]
  /** Ukuran, free text (p x tebal x t mm). */
  dimension: string
  /** Free-text group; the project's category list is derived from its items. */
  category: string | null
  /** YYYY-MM-DD when mockup was approved; null if not needed / not yet. */
  mockupApproveDate: string | null
  current: ProjectShopDrawingFile | null
  versions: ProjectShopDrawingFile[]
  /** File Produksi (CNC / cutting files), versioned like the drawing. */
  productionCurrent: ProjectShopDrawingFile | null
  productionVersions: ProjectShopDrawingFile[]
  /** Removed in the open RAB change; deleted when the change is committed. */
  removedInChange: boolean
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
  | 'pylon'
  | 'blade'
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
  /** SD units one formula qty makes; "1" = plain per-unit qty. */
  yieldQty: string
  qtyPerUnit: string
  totalQty: string
  addedAt: string | null
  addedBy: string | null
  addReason: string | null
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
  /** YYYY-MM-DD when mockup was approved; null if not needed / not yet. */
  mockupApproveDate: string | null
  main: ProjectShopDrawingBoqMain
  lighting: ProjectShopDrawingBoqLighting
  mounting: ProjectShopDrawingBoqMounting
  other: ProjectShopDrawingBoqOther
  contentFrozen: boolean
  contentFrozenAt: string | null
  rabLocked: boolean
  changeDraftOpen: boolean
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
  categoryIds: string[]
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
  /** Purchase qty after UOM rounding (priced). */
  totalQty: string
  /** BOQ need before rounding; null for labour / legacy. */
  exactQty: string | null
  /** totalQty − exactQty; negative when rounded down below need. */
  wasteQty: string | null
  rounding: { decimals: number; mode: 'up' | 'nearest' | 'down' } | null
  unitPrice: string | null
  tarifId: string | null
  lineTotal: string | null
  hasTarif: boolean
  origin: 'lock' | 'append' | 'labour' | null
  addedAt: string | null
  addedBy: ProjectRabUserRef | null
  addReason: string | null
  priceEditable: boolean
}

export type ProjectRabLabourItem = {
  id: string
  itemId: string
  name: string
  description: string
  baseUomId: string | null
  uoms: ProjectShopDrawingBoqMaterialUom[]
}

export type AddProjectRabLabourLine = {
  itemId: string
  itemUomId: string
  totalQty: string
  unitPrice?: string | null
}

export type ProjectRabItemGroup = {
  materialItemId: string
  materialCode: string
  materialName: string
  hasTarif: boolean
  lines: ProjectRabLine[]
}

export type ProjectRabChangeDraftRef = {
  id: string
  reason: string
  openedAt: string
  openedBy: ProjectRabUserRef
}

export type ProjectRabChangeSummary = {
  id: string
  projectId: string
  reason: string
  status: 'draft' | 'committed' | 'discarded'
  openedAt: string
  openedBy: ProjectRabUserRef
  committedAt: string | null
  committedBy: ProjectRabUserRef | null
  /** Present when status is committed. */
  revision: number | null
}

export type ProjectRabLineChangeKind = 'added' | 'removed' | 'changed'

export type ProjectRabChangeLineDiff = {
  key: string
  kind: ProjectRabLineChangeKind
  materialName: string | null
  oldTotalQty: string | null
  newTotalQty: string | null
  oldUnitPrice: string | null
  newUnitPrice: string | null
}

export type ProjectRabChangeBoqDiff = {
  shopDrawingItemId: string
  shopDrawingFileId: string
  shopDrawingItemName: string
  fileVersion: number | null
  kind: 'added' | 'removed'
}

/** An item whose counted (current) file version was switched. */
export type ProjectRabChangeVersionDiff = {
  shopDrawingItemId: string
  shopDrawingItemName: string
  fromFileId: string | null
  fromVersion: number | null
  toFileId: string | null
  toVersion: number | null
}

export type ProjectRabChangeBoqMaterialDiff = {
  shopDrawingFileId: string
  shopDrawingItemId: string
  /** `{kode}-{name}` of the shop drawing item. */
  shopDrawingItemName: string
  fileVersion: number | null
  key: string
  kind: ProjectRabLineChangeKind
  materialCode: string | null
  materialName: string | null
  uomSymbol: string | null
  oldTotalQty: string | null
  newTotalQty: string | null
}

/** One RAB change and the materials it added to / changed in / removed from shop drawings. */
export type ProjectRabMaterialChangeGroup = {
  changeId: string
  status: 'draft' | 'committed'
  revision: number | null
  reason: string
  /** committedAt, or openedAt for the open draft. */
  at: string
  by: ProjectRabUserRef | null
  materials: ProjectRabChangeBoqMaterialDiff[]
}

export type ProjectRabChangeDiff = {
  lineDiff: ProjectRabChangeLineDiff[]
  boqDiff: ProjectRabChangeBoqDiff[]
  versionDiff: ProjectRabChangeVersionDiff[]
  boqMaterialDiff: ProjectRabChangeBoqMaterialDiff[]
}

export type ProjectRabChangeDetail = ProjectRabChangeSummary & {
  lineDiff: Array<
    ProjectRabChangeLineDiff & {
      materialItemId: string | null
      materialCode: string | null
      uomSymbol: string | null
    }
  >
  boqDiff: ProjectRabChangeBoqDiff[]
  versionDiff: ProjectRabChangeVersionDiff[]
  boqMaterialDiff: ProjectRabChangeBoqMaterialDiff[]
  baselineGrandTotal: string | null
  grandTotal: string | null
  lines: ProjectRabLine[]
}

export type ProjectRab = {
  id: string
  projectId: string
  status: 'draft' | 'locked'
  lockedAt: string | null
  lockedBy: ProjectRabUserRef | null
  changeDraft: ProjectRabChangeDraftRef | null
  baselineGrandTotal: string | null
  changeDiff: ProjectRabChangeDiff | null
  /** Locked RAB: shop drawing material changes per change, newest first. */
  materialChanges: ProjectRabMaterialChangeGroup[]
  groups: ProjectRabItemGroup[]
  grandTotal: string | null
  /** Latest committed change revision; 0 if locked with no commits. */
  currentRevision: number
}

export type ProjectRabElaborationLine = {
  materialItemId: string
  itemUomId: string
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
  shopDrawingItemId: string
  shopDrawingFileId: string
  shopDrawingItemName: string
  fileVersion: number
  originalFilename: string
  makeQty: string
  blocks: ProjectRabElaborationBlock[]
}

export type ProjectRabElaboration = {
  documents: ProjectRabElaborationDoc[]
}
