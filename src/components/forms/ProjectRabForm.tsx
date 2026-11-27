import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  changeKindBadgeClass,
  changeKindLabel,
  formatCostingWhen,
} from '#/components/forms/costingStatus'
import ProjectCostingStatusStrip from '#/components/forms/ProjectCostingStatusStrip'
import ProjectRabChangeHistory from '#/components/forms/ProjectRabChangeHistory'
import ProjectRabCharges from '#/components/forms/ProjectRabCharges'
import { RabSdMaterialChanges } from '#/components/forms/RabSdMaterialChanges'
import { ListSearchInput } from '#/components/forms/shared/ListTable'
import TenderProjectPicker from '#/components/forms/TenderProjectPicker'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Button } from '#/components/ui/button'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  formatRupiahDigits,
  rupiahDigits,
  RupiahInput,
} from '#/components/ui/rupiah-input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import type { ItemCategoryOut } from '#/lib/itemMaster'
import type {
  ProjectRab,
  ProjectRabChangeBoqMaterialDiff,
  ProjectRabChangeDraftRef,
  ProjectRabChangeSummary,
  ProjectRabElaboration,
  ProjectRabElaborationDoc,
  ProjectRabLabourExecutor,
  ProjectRabLabourItem,
  ProjectRabLabourProcessRow,
  ProjectRabLabourRole,
  ProjectShopDrawingItem,
  ProjectRabLine,
  ProjectRabLineChangeKind,
  ProjectShopDrawingBoqMaterial,
} from '#/lib/project'
import {
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  metaTextClassName,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  onProjectIdChange?: (projectId: string | undefined) => void
  /** Inside the project dashboard: no page title, picker or back link. */
  embedded?: boolean
  /** Called whenever the loaded RAB changes (lock, price, change, …). */
  onChanged?: () => void
}

const formatWhen = formatCostingWhen

/**
 * Saved decimal amount → whole-rupiah digits, rounded half up (not cut off):
 * a total typed as 100.000 over 3 units is stored as 99999.99999999.
 */
function roundedRupiahDigits(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount.trim() === '') return ''
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  return String(Math.round(Math.abs(n)))
}

/** Display saved amount as Rp-formatted (or —). */
function formatRupiahAmount(amount: string | null | undefined): string {
  const digits = roundedRupiahDigits(amount)
  if (!digits) return '—'
  const negative = Number(amount) < 0 && digits !== '0'
  return `${negative ? '-' : ''}Rp ${formatRupiahDigits(digits)}`
}

function plainFromSaved(amount: string | null | undefined): string {
  return roundedRupiahDigits(amount)
}

function flatLines(rab: ProjectRab | null): ProjectRabLine[] {
  if (!rab) return []
  return rab.groups.flatMap((g) => g.lines)
}

function findEstimateLine(
  lines: ProjectRabLine[],
  materialCode: string,
  uomSymbol: string,
): ProjectRabLine | undefined {
  const code = materialCode.trim()
  const uom = uomSymbol.trim()
  return lines.find(
    (l) =>
      l.origin !== 'labour' &&
      l.materialCode.trim() === code &&
      l.uomSymbol.trim() === uom,
  )
}

/** qty × unit price → rupiah digits string, or null if no price. */
function estimateAmount(
  totalQty: string,
  unitPrice: string | null | undefined,
): string | null {
  if (
    unitPrice === null ||
    unitPrice === undefined ||
    unitPrice.trim() === ''
  ) {
    return null
  }
  const qty = Number(totalQty)
  // Saved prices may carry decimals (set from a line total); drafts are digits.
  const price = Number(unitPrice.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return null
  return String(Math.round(qty * price))
}

/** This drawing's share of the purchased qty (need scaled by RAB rounding). */
function boughtQty(needQty: string, est: ProjectRabLine | undefined): string {
  const need = Number(needQty)
  if (!est || !Number.isFinite(need)) return needQty
  return formatContributionQty(purchaseShare(est, need))
}

/** BOQ-derived material buckets on Estimate / Elaboration filters. */
type RabBoqSection = 'base' | 'finishing' | 'lighting' | 'mounting' | 'other'
type RabMaterialSection = RabBoqSection | 'labour'

const SECTION_ORDER: readonly RabMaterialSection[] = [
  'base',
  'finishing',
  'lighting',
  'mounting',
  'other',
  'labour',
] as const

const SECTION_LABELS: Record<RabMaterialSection, string> = {
  base: 'Base material',
  finishing: 'Finishing',
  lighting: 'Lighting',
  mounting: 'Mounting',
  other: 'Other',
  labour: 'Labour',
}

const SECTION_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All sections' },
  ...SECTION_ORDER.map((section) => ({
    value: section,
    label: SECTION_LABELS[section],
  })),
]

/** How price inputs are typed: per unit, or the whole line total. */
type PriceMode = 'unit' | 'total'

/** Pricing tab lists materials only; labour lives on each shop drawing. */
const MATERIAL_SECTION_FILTER_OPTIONS = SECTION_FILTER_OPTIONS.filter(
  (o) => o.value !== 'labour',
)

/** Sum of rupiah amounts; null when none is priced. */
function sumAmounts(amounts: Array<string | null | undefined>): string | null {
  let sum = 0
  let any = false
  for (const amount of amounts) {
    if (amount == null || amount === '') continue
    // Exact amounts, rounded once at the end (like the server's grand total).
    const n = Number(amount)
    if (!Number.isFinite(n)) continue
    sum += n
    any = true
  }
  return any ? String(Math.round(sum)) : null
}

function labourRows(
  lines: ProjectRabLine[],
  priceDrafts: Record<string, string>,
): EstimateSectionRow[] {
  const ordered = [...lines].sort(
    (a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999),
  )
  return ordered.map((line) => {
    const price = unitPriceForLine(line, priceDrafts)
    return {
      line,
      contributionQty: line.totalQty,
      contributionTotal:
        price === '' ? null : estimateAmount(line.totalQty, price),
      alsoIn: [],
    }
  })
}

type EstimateSectionRow = {
  line: ProjectRabLine
  contributionQty: string
  contributionTotal: string | null
  alsoIn: RabBoqSection[]
}

type EstimateSectionGroup = {
  section: RabMaterialSection
  label: string
  rows: EstimateSectionRow[]
  subtotal: string | null
}

function sectionFromBlockTitle(title: string): RabBoqSection {
  const t = title.trim().toLowerCase()
  if (t.startsWith('base')) return 'base'
  if (t.startsWith('finishing')) return 'finishing'
  if (t.startsWith('lighting')) return 'lighting'
  if (t.startsWith('mounting')) return 'mounting'
  return 'other'
}

function elaborationLineKey(materialItemId: string, itemUomId: string): string {
  return `${materialItemId}:${itemUomId}`
}

function formatContributionQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0'
  return String(Number(qty.toPrecision(12)))
}

/** Draft digits, else the saved unit price (full precision); '' if none. */
function unitPriceForLine(
  line: ProjectRabLine,
  priceDrafts: Record<string, string>,
): string {
  if (priceDrafts[line.key] !== undefined) {
    return rupiahDigits(priceDrafts[line.key]!)
  }
  return line.unitPrice?.trim() ?? ''
}

/**
 * Section share of the purchase qty: the BOQ need scaled by the line's
 * rounding (totalQty / exactQty), so section rows add up to what is bought.
 */
function purchaseShare(line: ProjectRabLine, needQty: number): number {
  const exact = Number(line.exactQty)
  const total = Number(line.totalQty)
  if (!line.exactQty || !Number.isFinite(exact) || exact <= 0) return needQty
  if (!Number.isFinite(total)) return needQty
  return (needQty * total) / exact
}

function sumContributionTotals(rows: EstimateSectionRow[]): string | null {
  return sumAmounts(rows.map((row) => row.contributionTotal))
}

/** Group material RAB lines by BOQ section using elaboration contribution qtys. */
function buildEstimateSections(
  elaboration: ProjectRabElaboration | null,
  materialLines: ProjectRabLine[],
  priceDrafts: Record<string, string>,
): EstimateSectionGroup[] {
  const lineByKey = new Map(materialLines.map((l) => [l.key, l]))
  const qtyBySection = new Map<RabBoqSection, Map<string, number>>()
  const sectionsSeenByKey = new Map<string, Set<RabBoqSection>>()

  for (const doc of elaboration?.documents ?? []) {
    for (const block of doc.blocks) {
      const section = sectionFromBlockTitle(block.title)
      let bucket = qtyBySection.get(section)
      if (!bucket) {
        bucket = new Map()
        qtyBySection.set(section, bucket)
      }
      for (const el of block.lines) {
        const key = elaborationLineKey(el.materialItemId, el.itemUomId)
        const qty = Number(el.totalQty)
        if (!Number.isFinite(qty)) continue
        bucket.set(key, (bucket.get(key) ?? 0) + qty)
        let seen = sectionsSeenByKey.get(key)
        if (!seen) {
          seen = new Set()
          sectionsSeenByKey.set(key, seen)
        }
        seen.add(section)
      }
    }
  }

  const assignedKeys = new Set<string>()
  for (const bucket of qtyBySection.values()) {
    for (const key of bucket.keys()) assignedKeys.add(key)
  }

  let otherBucket = qtyBySection.get('other')
  if (!otherBucket) {
    otherBucket = new Map()
    qtyBySection.set('other', otherBucket)
  }
  for (const line of materialLines) {
    if (assignedKeys.has(line.key)) continue
    const qty = Number(line.totalQty)
    if (!Number.isFinite(qty)) continue
    otherBucket.set(line.key, (otherBucket.get(line.key) ?? 0) + qty)
  }

  function rowsForBoqSection(section: RabBoqSection): EstimateSectionRow[] {
    const bucket = qtyBySection.get(section)
    if (!bucket) return []
    const rows: EstimateSectionRow[] = []
    for (const [key, qty] of bucket) {
      const line = lineByKey.get(key)
      if (!line) continue
      const contributionQty = formatContributionQty(purchaseShare(line, qty))
      const price = unitPriceForLine(line, priceDrafts)
      const contributionTotal =
        price === '' ? null : estimateAmount(contributionQty, price)
      const alsoIn = [...(sectionsSeenByKey.get(key) ?? [])]
        .filter((s) => s !== section)
        .sort((a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b))
      rows.push({ line, contributionQty, contributionTotal, alsoIn })
    }
    rows.sort((a, b) => a.line.materialName.localeCompare(b.line.materialName))
    return rows
  }

  return SECTION_ORDER.flatMap((section) => {
    if (section === 'labour') return []
    const rows = rowsForBoqSection(section)
    return {
      section,
      label: SECTION_LABELS[section],
      rows,
      subtotal: sumContributionTotals(rows),
    }
  })
}

function estimateRowMatches(row: EstimateSectionRow, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  return (
    textMatches(row.line.materialName, q) ||
    textMatches(row.line.materialCode, q) ||
    textMatches(row.line.uomSymbol, q)
  )
}

function textMatches(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  return text.toLowerCase().includes(q)
}

function highlightText(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: ReactNode[] = []
  let start = 0
  let hit = 0
  let i = lower.indexOf(needle, start)
  while (i !== -1) {
    if (i > start) parts.push(text.slice(start, i))
    parts.push(
      <mark
        key={`h-${hit}`}
        className="rounded-sm bg-[#ffe08a] px-0.5 text-inherit"
      >
        {text.slice(i, i + needle.length)}
      </mark>,
    )
    hit += 1
    start = i + needle.length
    i = lower.indexOf(needle, start)
  }
  if (start < text.length) parts.push(text.slice(start))
  return parts.length > 0 ? parts : text
}

type ChangeProvenance = {
  kind: ProjectRabLineChangeKind
  whenIso: string | null
  byName: string | null
  because: string
  fromOpenChange: boolean
  oldTotalQty: string | null
  newTotalQty: string | null
  oldUnitPrice: string | null
  newUnitPrice: string | null
}

function boqMaterialScopeKey(fileId: string, rabKey: string): string {
  return `${fileId}::${rabKey}`
}

/** Elaboration badges/qty deltas scoped to the shop-drawing file that actually changed. */
function buildElaborationProvenanceByFile(
  changeDiff: ProjectRab['changeDiff'],
  changeDraft: ProjectRabChangeDraftRef | null,
): Map<string, ChangeProvenance> {
  const map = new Map<string, ChangeProvenance>()
  for (const d of changeDiff?.boqMaterialDiff ?? []) {
    map.set(boqMaterialScopeKey(d.shopDrawingFileId, d.key), {
      kind: d.kind,
      whenIso: changeDraft?.openedAt ?? null,
      byName: changeDraft?.openedBy.name ?? null,
      because: changeDraft?.reason.trim() ?? '',
      fromOpenChange: Boolean(changeDraft),
      oldTotalQty: d.oldTotalQty,
      newTotalQty: d.newTotalQty,
      oldUnitPrice: null,
      newUnitPrice: null,
    })
  }
  return map
}

function ChangeProvenanceNote({
  provenance,
}: {
  provenance: ChangeProvenance
}) {
  const when = provenance.whenIso ? formatWhen(provenance.whenIso) : null
  const meta = [
    provenance.fromOpenChange ? 'Open change' : null,
    when,
    provenance.byName,
  ]
    .filter(Boolean)
    .join(' · ')

  const deltaParts: string[] = []
  if (
    provenance.kind === 'changed' &&
    provenance.oldTotalQty != null &&
    provenance.newTotalQty != null &&
    provenance.oldTotalQty !== provenance.newTotalQty
  ) {
    deltaParts.push(`Qty ${provenance.oldTotalQty} → ${provenance.newTotalQty}`)
  }
  if (
    provenance.kind === 'changed' &&
    (provenance.oldUnitPrice != null || provenance.newUnitPrice != null) &&
    (provenance.oldUnitPrice ?? '') !== (provenance.newUnitPrice ?? '')
  ) {
    deltaParts.push(
      `Price ${formatRupiahAmount(provenance.oldUnitPrice)} → ${formatRupiahAmount(provenance.newUnitPrice)}`,
    )
  }
  if (provenance.kind === 'removed' && provenance.oldTotalQty != null) {
    deltaParts.push(`Was ${provenance.oldTotalQty}`)
  }

  return (
    <div className={cn('mt-1 space-y-0.5 text-xs', hintClassName)}>
      {meta ? <p>{meta}</p> : null}
      {provenance.because ? (
        <p className="text-(--ink)">Because: {provenance.because}</p>
      ) : null}
      {deltaParts.length > 0 ? (
        <p className="tabular-nums">{deltaParts.join(' · ')}</p>
      ) : null}
    </div>
  )
}

export default function ProjectRabForm({
  projectId,
  onProjectIdChange,
  embedded = false,
  onChanged,
}: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')

  const [tab, setTab] = useState('estimate')
  // History tab was removed; keep users on a real tab if state lingered.
  useEffect(() => {
    if (tab === 'history') setTab('estimate')
  }, [tab])
  const [rab, setRab] = useState<ProjectRab | null>(null)
  const [elaboration, setElaboration] = useState<ProjectRabElaboration | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [changeOpen, setChangeOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [labourItems, setLabourItems] = useState<ProjectRabLabourItem[]>([])
  /** makeType tag by shop drawing item id (shown on the labour stages box). */
  const [makeTypeByDrawingId, setMakeTypeByDrawingId] = useState<
    Map<string, ProjectShopDrawingItem['makeType']>
  >(() => new Map())
  /** Shop drawing the Add labour dialog is open for. */
  const [labourDrawing, setLabourDrawing] = useState<{
    id: string
    name: string
  } | null>(null)
  const [labourItemId, setLabourItemId] = useState('')
  const [labourUomId, setLabourUomId] = useState('')
  const [labourQty, setLabourQty] = useState('1')
  const [labourPriceDigits, setLabourPriceDigits] = useState('')
  const [reviewChangesOnly, setReviewChangesOnly] = useState(false)
  const [estimateQuery, setEstimateQuery] = useState('')
  const [estimateSectionFilter, setEstimateSectionFilter] =
    useState<string>('all')
  const [elaborationQuery, setElaborationQuery] = useState('')
  const [elaborationSectionFilter, setElaborationSectionFilter] =
    useState<string>('all')
  const [elaborationCategoryFilter, setElaborationCategoryFilter] =
    useState<string>('all')
  const [materials, setMaterials] = useState<ProjectShopDrawingBoqMaterial[]>(
    [],
  )
  const [categories, setCategories] = useState<ItemCategoryOut[]>([])
  const [exportBusy, setExportBusy] = useState(false)
  const [collapsedEstimateSections, setCollapsedEstimateSections] = useState<
    Set<string>
  >(() => new Set())

  const categoryIdsByMaterialId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const m of materials) {
      map.set(m.id, m.categoryIds ?? [])
    }
    return map
  }, [materials])

  const categoryFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All categories' },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  )

  const loadAll = useCallback(async (pid: string) => {
    setLoading(true)
    try {
      const [rabRes, elabRes, labourRes, materialsRes, categoriesRes, sdRes] =
        await Promise.all([
          apiFetch<ProjectRab | null>(`/project/${pid}/rab`),
          apiFetch<ProjectRabElaboration>(`/project/${pid}/rab/elaboration`),
          apiFetch<ProjectRabLabourItem[]>(`/project/${pid}/rab/labour-items`),
          apiFetch<ProjectShopDrawingBoqMaterial[]>(
            `/project/${pid}/shop-drawing/boq/materials`,
          ),
          apiFetch<ItemCategoryOut[]>('/item-categories'),
          apiFetch<ProjectShopDrawingItem[]>(`/project/${pid}/shop-drawing`),
        ])
      if (!rabRes.success) {
        toast.error(rabRes.message || 'Failed to load RAB')
        setRab(null)
      } else {
        setRab(rabRes.data ?? null)
      }
      if (!elabRes.success) {
        setElaboration(null)
      } else {
        setElaboration(elabRes.data ?? null)
      }
      if (!labourRes.success || !labourRes.data) {
        setLabourItems([])
      } else {
        setLabourItems(labourRes.data)
      }
      if (!materialsRes.success || !materialsRes.data) {
        setMaterials([])
      } else {
        setMaterials(materialsRes.data)
      }
      if (!categoriesRes.success || !categoriesRes.data) {
        setCategories([])
      } else {
        setCategories(categoriesRes.data)
      }
      if (!sdRes.success || !sdRes.data) {
        setMakeTypeByDrawingId(new Map())
      } else {
        setMakeTypeByDrawingId(
          new Map(sdRes.data.map((i) => [i.id, i.makeType])),
        )
      }
    } catch {
      toast.error('Unable to reach the server')
      setRab(null)
      setElaboration(null)
      setLabourItems([])
      setMaterials([])
      setCategories([])
      setMakeTypeByDrawingId(new Map())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRab(null)
    setElaboration(null)
    setPriceDrafts({})
    setLabourItems([])
    setLabourDrawing(null)
    setLabourItemId('')
    setLabourUomId('')
    setLabourQty('1')
    setLabourPriceDigits('')
    setChangeReason('')
    setReviewChangesOnly(false)
    setEstimateQuery('')
    setEstimateSectionFilter('all')
    setElaborationQuery('')
    setElaborationSectionFilter('all')
    setElaborationCategoryFilter('all')
    setCollapsedEstimateSections(new Set())
    setMaterials([])
    setCategories([])
    if (!projectId) return
    void loadAll(projectId)
  }, [projectId, loadAll])

  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  useEffect(() => {
    if (rab) onChangedRef.current?.()
  }, [rab])

  const lines = useMemo(() => flatLines(rab), [rab])
  const lineKindByKey = useMemo(() => {
    const map = new Map<string, ProjectRabLineChangeKind>()
    for (const d of rab?.changeDiff?.lineDiff ?? []) {
      map.set(d.key, d.kind)
    }
    return map
  }, [rab?.changeDiff])
  const removedGhostLines = useMemo((): ProjectRabLine[] => {
    return (rab?.changeDiff?.lineDiff ?? [])
      .filter((d) => d.kind === 'removed')
      .map((d) => ({
        key: d.key,
        materialItemId: '',
        materialCode: '',
        materialName: d.materialName ?? d.key,
        itemUomId: '',
        uomSymbol: '',
        uomName: '',
        totalQty: d.oldTotalQty ?? '0',
        exactQty: null,
        wasteQty: null,
        rounding: null,
        unitPrice: d.oldUnitPrice,
        tarifId: null,
        lineTotal: null,
        hasTarif: false,
        origin: null,
        addedAt: null,
        addedBy: null,
        addReason: null,
        priceEditable: false,
        priceByTotal: false,
        shopDrawingItemId: null,
        shopDrawingItemName: null,
        role: null,
        executor: null,
        sequence: null,
        weightPercent: null,
      }))
  }, [rab?.changeDiff])
  const materialLines = useMemo(() => {
    const live = lines.filter((l) => l.origin !== 'labour')
    const ghosts = removedGhostLines.filter(
      (g) => !live.some((l) => l.key === g.key),
    )
    const list = [...live, ...ghosts]
    if (!reviewChangesOnly) return list
    return list.filter((l) => lineKindByKey.has(l.key))
  }, [lines, reviewChangesOnly, lineKindByKey, removedGhostLines])
  const labourLines = useMemo(() => {
    const list = lines.filter((l) => l.origin === 'labour')
    if (!reviewChangesOnly) return list
    return list.filter((l) => lineKindByKey.has(l.key))
  }, [lines, reviewChangesOnly, lineKindByKey])
  const estimateSections = useMemo(() => {
    const groups = buildEstimateSections(
      elaboration,
      materialLines,
      priceDrafts,
    )
    const q = estimateQuery.trim()
    return groups
      .map((group) => {
        const rows = q
          ? group.rows.filter((row) => estimateRowMatches(row, q))
          : group.rows
        return {
          ...group,
          rows,
          subtotal: sumContributionTotals(rows),
        }
      })
      .filter((group) => {
        if (estimateSectionFilter !== 'all') {
          return group.section === estimateSectionFilter
        }
        return true
      })
  }, [
    elaboration,
    materialLines,
    priceDrafts,
    estimateQuery,
    estimateSectionFilter,
  ])
  const totals = useMemo(() => {
    return {
      material: sumAmounts(
        lines.filter((l) => l.origin !== 'labour').map((l) => l.lineTotal),
      ),
      labour: sumAmounts(
        lines.filter((l) => l.origin === 'labour').map((l) => l.lineTotal),
      ),
      unpriced: lines.filter((l) => !l.unitPrice?.trim()).length,
    }
  }, [lines])
  /** Labour per shop drawing item; the first card of each item shows it. */
  const labourByDrawing = useMemo(() => {
    const map = new Map<string, ProjectRabLine[]>()
    for (const line of labourLines) {
      const id = line.shopDrawingItemId ?? ''
      const list = map.get(id) ?? []
      list.push(line)
      map.set(id, list)
    }
    return map
  }, [labourLines])
  const labourCardFileIds = useMemo(() => {
    const seen = new Set<string>()
    const fileIds = new Set<string>()
    for (const doc of elaboration?.documents ?? []) {
      if (seen.has(doc.shopDrawingItemId)) continue
      seen.add(doc.shopDrawingItemId)
      fileIds.add(doc.shopDrawingFileId)
    }
    return fileIds
  }, [elaboration])
  /** Project-wide labour, or labour on a drawing with no BOQ card. */
  const unlinkedLabour = useMemo(() => {
    const drawn = new Set(
      (elaboration?.documents ?? []).map((d) => d.shopDrawingItemId),
    )
    return labourLines.filter(
      (l) => !l.shopDrawingItemId || !drawn.has(l.shopDrawingItemId),
    )
  }, [labourLines, elaboration])
  const changeDraft = rab?.changeDraft ?? null
  const elaborationProvenanceByFile = useMemo(
    () =>
      buildElaborationProvenanceByFile(rab?.changeDiff ?? null, changeDraft),
    [rab?.changeDiff, changeDraft],
  )
  const addedBoqNames = useMemo(() => {
    return (rab?.changeDiff?.boqDiff ?? [])
      .filter((b) => b.kind === 'added')
      .map((b) => b.shopDrawingItemName)
  }, [rab?.changeDiff])
  const changeLineCounts = useMemo(() => {
    const diff = rab?.changeDiff?.lineDiff ?? []
    return {
      added: diff.filter((d) => d.kind === 'added').length,
      removed: diff.filter((d) => d.kind === 'removed').length,
      changed: diff.filter((d) => d.kind === 'changed').length,
    }
  }, [rab?.changeDiff])
  const addedAfterLockGroups = useMemo(() => {
    // One section per change: who / when / because once, appended RAB lines
    // and shop drawing material edits listed under it.
    if (rab?.status !== 'locked') return []
    type Group = {
      key: string
      whenIso: string | null
      byName: string | null
      because: string
      lines: ProjectRabLine[]
      materials: ProjectRabChangeBoqMaterialDiff[]
    }
    const map = new Map<string, Group>()
    for (const line of lines) {
      const inOpenChange = lineKindByKey.get(line.key) === 'added'
      const fromCommit =
        line.origin === 'append' || Boolean(line.addReason?.trim())
      if (!inOpenChange && !fromCommit) continue

      let key: string
      let whenIso: string | null
      let byName: string | null
      let because: string
      if (inOpenChange && changeDraft) {
        key = `draft:${changeDraft.id}`
        whenIso = changeDraft.openedAt
        byName = changeDraft.openedBy.name
        because = changeDraft.reason.trim()
      } else {
        const reason = line.addReason?.trim() || ''
        const byId = line.addedBy?.id ?? ''
        const at = line.addedAt ?? ''
        key = `commit:${reason}|${byId}|${at}`
        whenIso = line.addedAt
        byName = line.addedBy?.name ?? null
        because = reason
      }

      let group = map.get(key)
      if (!group) {
        group = { key, whenIso, byName, because, lines: [], materials: [] }
        map.set(key, group)
      }
      group.lines.push(line)
    }
    for (const change of rab.materialChanges) {
      const because = change.reason.trim()
      // Same keys as the line stamps above, so one change stays one group.
      const key =
        change.status === 'draft'
          ? `draft:${change.changeId}`
          : `commit:${because}|${change.by?.id ?? ''}|${change.at}`
      let group = map.get(key)
      if (!group) {
        group = {
          key,
          whenIso: change.at,
          byName: change.by?.name ?? null,
          because,
          lines: [],
          materials: [],
        }
        map.set(key, group)
      }
      group.materials.push(...change.materials)
    }
    return [...map.values()].sort((a, b) => {
      const ta = a.whenIso ? new Date(a.whenIso).getTime() : 0
      const tb = b.whenIso ? new Date(b.whenIso).getTime() : 0
      return tb - ta
    })
  }, [lines, rab?.status, rab?.materialChanges, lineKindByKey, changeDraft])

  const selectedLabour = useMemo(
    () => labourItems.find((i) => i.id === labourItemId) ?? null,
    [labourItems, labourItemId],
  )

  useEffect(() => {
    if (!selectedLabour) {
      setLabourUomId('')
      return
    }
    const base =
      selectedLabour.uoms.find((u) => u.isBase)?.id ??
      selectedLabour.uoms[0]?.id ??
      ''
    setLabourUomId((prev) =>
      selectedLabour.uoms.some((u) => u.id === prev) ? prev : base,
    )
  }, [selectedLabour])

  async function lockRab() {
    if (!projectId) return
    const missing = lines.filter(
      (l) => !l.unitPrice || l.unitPrice.trim() === '',
    )
    if (missing.length > 0) {
      toast.error(
        `Fill unit price on all lines before locking (${missing.length} missing)`,
      )
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(`/project/${projectId}/rab/lock`, {
        method: 'POST',
      })
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to lock RAB')
        return
      }
      setRab(res.data)
      setPriceDrafts({})
      setLockOpen(false)
      toast.success('RAB locked')
      await loadAll(projectId)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function openChange() {
    if (!projectId) return
    const reason = changeReason.trim()
    if (!reason) {
      toast.error('Reason is required')
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRabChangeSummary>(
        `/project/${projectId}/rab/changes`,
        {
          method: 'POST',
          body: JSON.stringify({ reason }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to open change')
        return
      }
      setChangeOpen(false)
      setChangeReason('')
      toast.success('Change opened')
      await loadAll(projectId)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function commitChange() {
    if (!projectId) return
    const missing = lines.filter(
      (l) => !l.unitPrice || l.unitPrice.trim() === '',
    )
    if (missing.length > 0) {
      toast.error(
        `Fill unit price on all lines before committing (${missing.length} missing)`,
      )
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRabChangeSummary>(
        `/project/${projectId}/rab/changes/current/commit`,
        { method: 'POST' },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to commit change')
        return
      }
      toast.success('Change committed')
      await loadAll(projectId)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function discardChange() {
    if (!projectId) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRabChangeSummary>(
        `/project/${projectId}/rab/changes/current/discard`,
        { method: 'POST' },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to discard change')
        return
      }
      toast.success('Change discarded')
      await loadAll(projectId)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function downloadExport(kind: 'formal' | 'data') {
    if (!projectId || !rab) return
    setExportBusy(true)
    try {
      const q = new URLSearchParams({ kind, revision: 'current' })
      await apiDownload(
        `/project/${projectId}/rab/export?${q.toString()}`,
        `RAB_export.xlsx`,
      )
      toast.success('Export downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExportBusy(false)
    }
  }

  async function fillTarif(lineKey: string) {
    if (!projectId) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}/fill-tarif`,
        { method: 'POST' },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to fill tarif')
        return
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success('Tarif applied')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function saveUnitPrice(lineKey: string) {
    if (!projectId) return
    if (priceDrafts[lineKey] === undefined) return
    const digits = rupiahDigits(priceDrafts[lineKey] ?? '')
    const unitPrice = digits === '' ? null : digits
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ unitPrice }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to update price')
        return
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success(unitPrice === null ? 'Price cleared' : 'Unit price saved')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  function openAddLabour(drawing: { id: string; name: string }) {
    setLabourItemId('')
    setLabourUomId('')
    setLabourQty('1')
    setLabourPriceDigits('')
    setLabourDrawing(drawing)
  }

  /** Save whether a line's price is typed per unit or as the line total. */
  async function setLineMode(lineKey: string, byTotal: boolean) {
    if (!projectId) return
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ priceByTotal: byTotal }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to save price mode')
        return
      }
      setRab(res.data)
    } catch {
      toast.error('Unable to reach the server')
    }
  }

  async function saveLineTotal(
    lineKey: string,
    digits: string,
  ): Promise<boolean> {
    if (!projectId || digits === '') return false
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/lines/${encodeURIComponent(lineKey)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ lineTotal: digits }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to update price')
        return false
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success('Line total saved')
      return true
    } catch {
      toast.error('Unable to reach the server')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addLabourLine() {
    if (!projectId || !canManage || !labourDrawing) return
    if (!labourItemId || !labourUomId) {
      toast.error('Select a labour item and UOM')
      return
    }
    const qty = labourQty.trim()
    if (!qty || Number(qty) <= 0) {
      toast.error('Quantity must be greater than 0')
      return
    }
    const unitPrice = labourPriceDigits === '' ? undefined : labourPriceDigits
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/labour-lines`,
        {
          method: 'POST',
          body: JSON.stringify({
            shopDrawingItemId: labourDrawing.id,
            itemId: labourItemId,
            itemUomId: labourUomId,
            totalQty: qty,
            ...(unitPrice !== undefined ? { unitPrice } : {}),
          }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to add labour')
        return
      }
      setRab(res.data)
      setLabourDrawing(null)
      toast.success('Labour added')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function removeLabourLine(lineKey: string) {
    if (!projectId || !canManage) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/labour-lines/${encodeURIComponent(lineKey)}`,
        { method: 'DELETE' },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to remove labour')
        return
      }
      setRab(res.data)
      setPriceDrafts((prev) => {
        const next = { ...prev }
        delete next[lineKey]
        return next
      })
      toast.success('Labour line removed')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function saveLabourProcess(
    shopDrawingItemId: string,
    ordered: ProjectRabLabourProcessRow[],
  ) {
    if (!projectId || !canManage) return
    setBusy(true)
    try {
      const res = await apiFetch<ProjectRab>(
        `/project/${projectId}/rab/labour-process`,
        {
          method: 'PUT',
          body: JSON.stringify({ shopDrawingItemId, lines: ordered }),
        },
      )
      if (!res.success || !res.data) {
        toast.error(res.message || 'Failed to save labour process')
        return
      }
      setRab(res.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  const isLocked = rab?.status === 'locked'
  const canEdit = !isLocked || Boolean(changeDraft)
  const hasLines = lines.length > 0

  return (
    <div className="space-y-5">
      {embedded ? null : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className={pageTitleClassName}>RAB</h1>
            </div>
            {projectId ? (
              <Link
                to="/dashboard/projects/$projectId"
                params={{ projectId }}
                className={cn(
                  buttonOutlineClassName,
                  'inline-flex h-8 items-center gap-1.5 no-underline',
                )}
              >
                <ArrowLeft className="size-3.5" aria-hidden />
                Back to project
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className={cn('text-sm', hintClassName)}>Project</span>
            <div className="min-w-[16rem] max-w-md flex-1">
              <TenderProjectPicker
                projectId={projectId ?? ''}
                onProjectIdChange={(next) =>
                  onProjectIdChange?.(next || undefined)
                }
                ariaLabel="RAB project"
              />
            </div>
          </div>
        </>
      )}

      {!projectId ? (
        <p className={hintClassName}>Choose a project to view its RAB.</p>
      ) : loading ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <div className="space-y-3">
          <ProjectCostingStatusStrip
            projectId={projectId}
            rab={rab}
            surface="rab"
            actions={
              <>
                {rab ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={busy || exportBusy}
                      >
                        <Download className="size-3.5" aria-hidden />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={exportBusy}
                        onClick={() => void downloadExport('formal')}
                      >
                        Export RAB
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={exportBusy}
                        onClick={() => void downloadExport('data')}
                      >
                        Export Data
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {isLocked && projectId ? (
                  <ProjectRabChangeHistory
                    projectId={projectId}
                    refreshKey={`${rab?.currentRevision ?? 0}-${changeDraft?.id ?? ''}-${rab?.grandTotal ?? ''}`}
                  />
                ) : null}
                {canManage && hasLines && !isLocked ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() => setLockOpen(true)}
                  >
                    <Lock className="size-3.5" aria-hidden />
                    Lock RAB
                  </Button>
                ) : null}
                {canManage && isLocked && !changeDraft ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() => {
                      setChangeReason('')
                      setChangeOpen(true)
                    }}
                  >
                    <LockOpen className="size-3.5" aria-hidden />
                    Open change
                  </Button>
                ) : null}
                {canManage && changeDraft ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={busy}
                      onClick={() => void discardChange()}
                    >
                      <Undo2 className="size-3.5" aria-hidden />
                      Discard
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busy}
                      onClick={() => void commitChange()}
                    >
                      <Check className="size-3.5" aria-hidden />
                      Commit change
                    </Button>
                  </>
                ) : null}
              </>
            }
          />

          {changeDraft &&
          (changeLineCounts.added +
            changeLineCounts.removed +
            changeLineCounts.changed >
            0 ||
            (rab?.changeDiff?.boqDiff.length ?? 0) > 0 ||
            (rab?.changeDiff?.versionDiff.length ?? 0) > 0) ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p
                className={cn(
                  'flex flex-wrap items-center gap-x-1',
                  hintClassName,
                )}
              >
                {changeLineCounts.added > 0
                  ? `${changeLineCounts.added} added`
                  : null}
                {changeLineCounts.changed > 0
                  ? `${changeLineCounts.added > 0 ? ' · ' : ''}${changeLineCounts.changed} changed`
                  : null}
                {changeLineCounts.removed > 0
                  ? `${changeLineCounts.added + changeLineCounts.changed > 0 ? ' · ' : ''}${changeLineCounts.removed} removed`
                  : null}
                {(rab?.changeDiff?.boqDiff ?? []).map((b, i) => (
                  <span key={`${b.kind}-${b.shopDrawingFileId}`}>
                    {i === 0 &&
                    changeLineCounts.added +
                      changeLineCounts.changed +
                      changeLineCounts.removed >
                      0
                      ? ' · '
                      : null}
                    {i === 0 ? 'BOQ: ' : ', '}
                    {b.kind === 'added' ? '+' : '−'}
                    {b.kind === 'added' ? (
                      <Link
                        to="/dashboard/internal/shop-drawing-boq"
                        search={{
                          projectId,
                          itemId: b.shopDrawingItemId,
                          fileId: b.shopDrawingFileId,
                        }}
                        className="underline-offset-2 hover:underline"
                      >
                        {b.shopDrawingItemName}
                      </Link>
                    ) : (
                      b.shopDrawingItemName
                    )}
                    {b.fileVersion !== null ? ` v${b.fileVersion}` : ''}
                  </span>
                ))}
                {(rab?.changeDiff?.versionDiff ?? []).map((v, i) => (
                  <span key={`ver-${v.shopDrawingItemId}`}>
                    {i === 0 ? ' · Version: ' : ', '}
                    {v.shopDrawingItemName}{' '}
                    {v.fromVersion !== null ? `v${v.fromVersion}` : 'none'} →{' '}
                    {v.toVersion !== null ? `v${v.toVersion}` : 'none'}
                  </span>
                ))}
              </p>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-3.5"
                  checked={reviewChangesOnly}
                  onChange={(e) => setReviewChangesOnly(e.target.checked)}
                />
                <span>Review changes only</span>
              </label>
            </div>
          ) : null}

          {hasLines ? (
            <div className="space-y-2">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-(--line) bg-(--line) lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr]">
                <RabStat
                  label="Grand total"
                  value={formatRupiahAmount(rab?.grandTotal)}
                  emphasis
                  hint={
                    changeDraft && rab?.baselineGrandTotal != null
                      ? `${formatDelta(rab.baselineGrandTotal, rab.grandTotal)} vs ${formatRupiahAmount(rab.baselineGrandTotal)}`
                      : undefined
                  }
                />
                <RabStat
                  label="Materials"
                  value={formatRupiahAmount(totals.material)}
                />
                <RabStat
                  label="Labour"
                  value={formatRupiahAmount(totals.labour)}
                />
                <RabStat
                  label="Additional"
                  value={formatRupiahAmount(rab?.chargesTotal)}
                />
                <RabStat
                  label="Cost (excl. PPN)"
                  value={formatRupiahAmount(rab?.cost)}
                  hint="Budget for margin and spend"
                  className="col-span-2 lg:col-span-1"
                />
              </dl>
              {totals.unpriced > 0 ? (
                <p className="inline-flex items-center gap-1.5 text-sm text-amber-800">
                  <AlertTriangle className="size-4" aria-hidden />
                  {totals.unpriced} line{totals.unpriced === 1 ? '' : 's'}{' '}
                  without a price. Price every line before locking.
                </p>
              ) : null}
            </div>
          ) : null}

          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <TabsList variant="line">
              <TabsTrigger value="estimate">Pricing</TabsTrigger>
              <TabsTrigger value="elaboration">By shop drawing</TabsTrigger>
            </TabsList>

            <TabsContent value="estimate" className="mt-4 space-y-6">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <ListSearchInput
                  value={estimateQuery}
                  onChange={setEstimateQuery}
                  placeholder="Find material…"
                  aria-label="Find material in pricing"
                  className="max-w-sm flex-1"
                />
                <Combobox
                  value={estimateSectionFilter}
                  onValueChange={setEstimateSectionFilter}
                  options={MATERIAL_SECTION_FILTER_OPTIONS}
                  placeholder="All sections"
                  searchPlaceholder="Search section…"
                  emptyText="No section found."
                  aria-label="Section filter"
                  className="w-[11rem] shrink-0"
                />
              </div>

              {materialLines.length === 0 ? (
                <p className={cn('text-sm', hintClassName)}>
                  {reviewChangesOnly
                    ? 'No materials changed in this draft.'
                    : 'No materials yet. Fill Shop Drawing BOQ first.'}
                </p>
              ) : estimateSections.every((group) => group.rows.length === 0) ? (
                <p className={cn('text-sm', hintClassName)}>
                  {estimateQuery.trim()
                    ? `No materials match “${estimateQuery.trim()}”.`
                    : 'No materials in this section.'}
                </p>
              ) : (
                estimateSections.map((group) => {
                  if (group.rows.length === 0) return null
                  const isCollapsed = collapsedEstimateSections.has(
                    group.section,
                  )
                  return (
                    <section key={group.section} className="space-y-2">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 border-b border-(--line) pb-2 text-left"
                        onClick={() =>
                          setCollapsedEstimateSections((prev) => {
                            const next = new Set(prev)
                            if (next.has(group.section))
                              next.delete(group.section)
                            else next.add(group.section)
                            return next
                          })
                        }
                        aria-expanded={!isCollapsed}
                      >
                        {isCollapsed ? (
                          <ChevronRight
                            className="size-4 shrink-0 text-(--muted)"
                            aria-hidden
                          />
                        ) : (
                          <ChevronDown
                            className="size-4 shrink-0 text-(--muted)"
                            aria-hidden
                          />
                        )}
                        <h2
                          className={cn(
                            sectionTitleClassName,
                            'min-w-0 flex-1',
                          )}
                        >
                          {group.label}
                          <span
                            className={cn(
                              'ml-2 text-xs font-normal',
                              hintClassName,
                            )}
                          >
                            {group.rows.length}
                          </span>
                        </h2>
                        {group.subtotal != null ? (
                          <span className="text-sm font-medium tabular-nums">
                            {formatRupiahAmount(group.subtotal)}
                          </span>
                        ) : null}
                      </button>

                      {!isCollapsed ? (
                        <RabLineList
                          rows={group.rows}
                          section={group.section}
                          lineKindByKey={lineKindByKey}
                          priceDrafts={priceDrafts}
                          setPriceDrafts={setPriceDrafts}
                          canManage={canManage}
                          busy={busy}
                          query={estimateQuery}
                          onSavePrice={saveUnitPrice}
                          onSaveTotal={saveLineTotal}
                          onSetMode={setLineMode}
                          onFillTarif={fillTarif}
                        />
                      ) : null}
                    </section>
                  )
                })
              )}

              {addedAfterLockGroups.length > 0 ? (
                <section className="space-y-4 border-t border-(--line) pt-4">
                  <h2 className={sectionTitleClassName}>Changes after lock</h2>
                  {addedAfterLockGroups.map((group) => (
                    <div
                      key={group.key}
                      className="space-y-2 rounded-sm border border-(--line)"
                    >
                      <header className="space-y-0.5 border-b border-(--line) bg-(--surface) px-3 py-2">
                        <p className={cn('text-xs', hintClassName)}>
                          {group.whenIso ? formatWhen(group.whenIso) : '—'}
                          {group.byName ? ` · ${group.byName}` : ''}
                        </p>
                        {group.because ? (
                          <p className="text-sm text-(--ink)">
                            Because: {group.because}
                          </p>
                        ) : null}
                      </header>
                      {group.lines.length > 0 ? (
                        <ul className="space-y-0 px-3 pb-2">
                          {group.lines.map((line) => (
                            <li
                              key={line.key}
                              className="border-b border-(--line) py-2 last:border-b-0"
                            >
                              <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                <span>{line.materialName}</span>
                                <span
                                  className={cn(
                                    'inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                                    changeKindBadgeClass('added'),
                                  )}
                                >
                                  Added
                                </span>
                                {line.origin === 'labour' ? (
                                  <span
                                    className={cn('text-xs', hintClassName)}
                                  >
                                    labour
                                    {line.shopDrawingItemName
                                      ? ` · ${line.shopDrawingItemName}`
                                      : ''}
                                  </span>
                                ) : null}
                              </p>
                              <p
                                className={cn(
                                  'font-mono text-xs',
                                  hintClassName,
                                )}
                              >
                                {line.materialCode
                                  ? `${line.materialCode} · `
                                  : ''}
                                {line.totalQty} {line.uomSymbol}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {group.materials.length > 0 ? (
                        <div className="space-y-1 px-3 pb-2">
                          <p
                            className={cn('text-xs font-medium', hintClassName)}
                          >
                            Shop drawing materials
                          </p>
                          <RabSdMaterialChanges materials={group.materials} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {rab && projectId && hasLines ? (
                <ProjectRabCharges
                  projectId={projectId}
                  rab={rab}
                  editable={
                    canManage &&
                    (rab.status === 'draft' || Boolean(changeDraft))
                  }
                  onSaved={setRab}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="elaboration" className="mt-4 space-y-4">
              {!elaboration?.documents.length && labourLines.length === 0 ? (
                <p className={cn('text-sm', hintClassName)}>
                  No shop drawing BOQs yet.
                </p>
              ) : (
                <>
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <ListSearchInput
                      value={elaborationQuery}
                      onChange={setElaborationQuery}
                      placeholder="Find drawing, material or labour…"
                      aria-label="Find in shop drawings"
                      className="max-w-sm flex-1"
                    />
                    <Combobox
                      value={elaborationSectionFilter}
                      onValueChange={setElaborationSectionFilter}
                      options={SECTION_FILTER_OPTIONS}
                      placeholder="All sections"
                      searchPlaceholder="Search section…"
                      emptyText="No section found."
                      aria-label="Section filter"
                      className="w-[11rem] shrink-0"
                    />
                    <Combobox
                      value={elaborationCategoryFilter}
                      onValueChange={setElaborationCategoryFilter}
                      options={categoryFilterOptions}
                      placeholder="All categories"
                      searchPlaceholder="Search category…"
                      emptyText="No category found."
                      aria-label="Category filter"
                      className="w-[10rem] shrink-0"
                    />
                  </div>
                  {(elaboration?.documents ?? []).map((doc) => {
                    const ownsLabour = labourCardFileIds.has(
                      doc.shopDrawingFileId,
                    )
                    return (
                      <RabElaborationDoc
                        key={`${doc.shopDrawingFileId}-${doc.fileVersion}-${doc.originalFilename}`}
                        doc={doc}
                        estimateLines={lines.filter(
                          (l) => l.origin !== 'labour',
                        )}
                        addedInChange={addedBoqNames.includes(
                          doc.shopDrawingItemName,
                        )}
                        reviewChangesOnly={reviewChangesOnly}
                        elaborationProvenanceByFile={
                          elaborationProvenanceByFile
                        }
                        changeDraft={changeDraft}
                        query={elaborationQuery}
                        sectionFilter={elaborationSectionFilter}
                        categoryFilter={elaborationCategoryFilter}
                        categoryIdsByMaterialId={categoryIdsByMaterialId}
                        labour={
                          ownsLabour
                            ? {
                                lines:
                                  labourByDrawing.get(doc.shopDrawingItemId) ??
                                  [],
                                list: {
                                  lineKindByKey,
                                  priceDrafts,
                                  setPriceDrafts,
                                  canManage,
                                  busy,
                                  onSavePrice: saveUnitPrice,
                                  onSaveTotal: saveLineTotal,
                                  onSetMode: setLineMode,
                                  onFillTarif: fillTarif,
                                  onRemove:
                                    canManage && canEdit
                                      ? removeLabourLine
                                      : undefined,
                                },
                                onAdd:
                                  canManage && canEdit && labourItems.length > 0
                                    ? () =>
                                        openAddLabour({
                                          id: doc.shopDrawingItemId,
                                          name: doc.shopDrawingItemName,
                                        })
                                    : undefined,
                                process: {
                                  canEdit: canManage && canEdit,
                                  makeType:
                                    makeTypeByDrawingId.get(
                                      doc.shopDrawingItemId,
                                    ) ?? null,
                                  onSave: (ordered) =>
                                    saveLabourProcess(
                                      doc.shopDrawingItemId,
                                      ordered,
                                    ),
                                },
                              }
                            : null
                        }
                      />
                    )
                  })}
                  {unlinkedLabour.length > 0 &&
                  elaborationCategoryFilter === 'all' &&
                  (elaborationSectionFilter === 'all' ||
                    elaborationSectionFilter === 'labour') ? (
                    <RabUnlinkedLabour
                      lines={unlinkedLabour}
                      query={elaborationQuery}
                      list={{
                        lineKindByKey,
                        priceDrafts,
                        setPriceDrafts,
                        canManage,
                        busy,
                        onSavePrice: saveUnitPrice,
                        onSaveTotal: saveLineTotal,
                        onSetMode: setLineMode,
                        onFillTarif: fillTarif,
                        onRemove:
                          canManage && canEdit ? removeLabourLine : undefined,
                      }}
                    />
                  ) : null}
                  {elaborationQuery.trim() ||
                  elaborationSectionFilter !== 'all' ||
                  elaborationCategoryFilter !== 'all' ||
                  reviewChangesOnly ? (
                    <ElaborationEmptyHint
                      documents={elaboration?.documents ?? []}
                      labourLines={labourLines}
                      addedBoqNames={addedBoqNames}
                      reviewChangesOnly={reviewChangesOnly}
                      elaborationProvenanceByFile={elaborationProvenanceByFile}
                      query={elaborationQuery}
                      sectionFilter={elaborationSectionFilter}
                      categoryFilter={elaborationCategoryFilter}
                      categoryIdsByMaterialId={categoryIdsByMaterialId}
                    />
                  ) : null}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      <AlertDialog open={lockOpen} onOpenChange={setLockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock RAB permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              All lines must have a unit price. After lock, BOQ and RAB are
              frozen. Further edits require opening a change with a reason, then
              committing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void lockRab()
              }}
            >
              {busy ? 'Locking…' : 'Lock RAB'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={changeOpen} onOpenChange={setChangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open change</DialogTitle>
            <DialogDescription>
              Give a reason for this change. You can then edit BOQ and RAB until
              you commit or discard.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            placeholder="Reason for change"
            disabled={busy}
            aria-label="Change reason"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setChangeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !changeReason.trim()}
              onClick={() => void openChange()}
            >
              Open
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={labourDrawing !== null}
        onOpenChange={(open) => {
          if (!open) setLabourDrawing(null)
        }}
      >
        <DialogContent className="overflow-hidden sm:max-w-md">
          <DialogHeader className="min-w-0">
            <DialogTitle>Add labour</DialogTitle>
            <DialogDescription className="truncate">
              {labourDrawing?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-3">
            <div className="min-w-0 space-y-1">
              <p className={cn('text-xs', hintClassName)}>Labour item</p>
              <Combobox
                value={labourItemId}
                onValueChange={setLabourItemId}
                options={labourItems.map((item) => ({
                  value: item.id,
                  label: `${item.itemId} — ${item.name}`,
                }))}
                placeholder="Select labour…"
                searchPlaceholder="Search labour…"
                emptyText="No labour items."
                className="w-full"
                disabled={busy}
                aria-label="Labour item"
              />
            </div>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
              <div className="min-w-0 space-y-1">
                <p className={cn('text-xs', hintClassName)}>UOM</p>
                <Combobox
                  value={labourUomId}
                  onValueChange={setLabourUomId}
                  options={(selectedLabour?.uoms ?? []).map((u) => ({
                    value: u.id,
                    label: `${u.symbol} — ${u.name}`,
                  }))}
                  placeholder="UOM…"
                  searchPlaceholder="Search UOM…"
                  emptyText="No UOMs."
                  className="w-full"
                  disabled={busy || !selectedLabour}
                  aria-label="Labour UOM"
                />
              </div>
              <label className="min-w-0 space-y-1">
                <span className={cn('block text-xs', hintClassName)}>Qty</span>
                <Input
                  value={labourQty}
                  onChange={(e) => setLabourQty(e.target.value)}
                  disabled={busy}
                  inputMode="decimal"
                  className="min-w-0 tabular-nums"
                />
              </label>
            </div>
            <label className="block min-w-0 space-y-1">
              <span className={cn('block text-xs', hintClassName)}>
                Unit price
              </span>
              <RupiahInput
                value={labourPriceDigits}
                onValueChange={setLabourPriceDigits}
                disabled={busy}
                wrapperClassName="min-w-0 w-full"
              />
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setLabourDrawing(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !labourItemId || !labourUomId}
              onClick={() => void addLabourLine()}
            >
              <Plus className="size-3.5" aria-hidden />
              Add labour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RabStat({
  label,
  value,
  hint,
  emphasis = false,
  className,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 bg-white px-4 py-3', className)}>
      <dt className={cn('truncate text-sm', hintClassName)}>{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate tabular-nums',
          emphasis ? 'text-2xl font-semibold' : 'text-lg font-medium',
        )}
      >
        {value}
      </dd>
      {hint ? (
        <dd className={cn('mt-0.5 truncate text-sm', hintClassName)}>{hint}</dd>
      ) : null}
    </div>
  )
}

/** Shared props for editable labour rows (price, tarif, remove). */
type LabourListProps = {
  lineKindByKey: Map<string, ProjectRabLineChangeKind>
  priceDrafts: Record<string, string>
  setPriceDrafts: Dispatch<SetStateAction<Record<string, string>>>
  canManage: boolean
  busy: boolean
  onSavePrice: (lineKey: string) => Promise<void>
  onSaveTotal: (lineKey: string, digits: string) => Promise<boolean>
  onSetMode: (lineKey: string, byTotal: boolean) => Promise<void>
  onFillTarif: (lineKey: string) => Promise<void>
  onRemove?: (lineKey: string) => Promise<void>
}

type DrawingLabour = {
  lines: ProjectRabLine[]
  list: LabourListProps
  onAdd?: () => void
  /** Stage setup (role, executor, sequence, weight %) for labour SPKs. */
  process?: {
    canEdit: boolean
    /** The drawing's make type, shown as a tag only. */
    makeType: ProjectShopDrawingItem['makeType'] | null
    onSave: (rows: ProjectRabLabourProcessRow[]) => Promise<void>
  }
}

const MAKE_TYPE_LABEL: Record<ProjectShopDrawingItem['makeType'], string> = {
  inhouse: 'Inhouse',
  subcon: 'Subcon',
  outsource: 'Outsource',
}

function processRow(line: ProjectRabLine): ProjectRabLabourProcessRow {
  return {
    key: line.key,
    role: line.role ?? 'making',
    executor: line.executor ?? 'inhouse',
    sequence: line.sequence,
    weightPercent: line.weightPercent,
  }
}

/** Making and install rows, each in the given order, get sequence 1..n per track. */
function numberProcessRows(
  making: ProjectRabLabourProcessRow[],
  install: ProjectRabLabourProcessRow[],
): ProjectRabLabourProcessRow[] {
  return [
    ...making.map((r, i) => ({
      ...r,
      role: 'making' as const,
      sequence: i + 1,
      // Unset weights get 1 so a first edit can save; tune to 100% after.
      weightPercent: r.weightPercent ?? 1,
    })),
    ...install.map((r, i) => ({
      ...r,
      role: 'install' as const,
      sequence: i + 1,
      weightPercent: r.weightPercent ?? 1,
    })),
  ]
}

function RabDrawingLabour({
  lines,
  list,
  onAdd,
  query,
  process,
}: DrawingLabour & { query: string }) {
  const [editingSteps, setEditingSteps] = useState(false)
  const unordered = labourRows(lines, list.priceDrafts)
  const all = unordered.map((r) => processRow(r.line))
  const nameByKey = new Map(
    unordered.map((r) => [r.line.key, r.line.materialName]),
  )
  const making = all
    .filter((r) => r.role === 'making')
    .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999))
  const install = all
    .filter((r) => r.role === 'install')
    .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999))
  const weightSum = making.reduce((s, r) => s + (r.weightPercent ?? 0), 0)
  const installSum = install.reduce((s, r) => s + (r.weightPercent ?? 0), 0)
  // Price lines follow the process: making stages in order, then install.
  const stepOrder = new Map(
    [...making, ...install].map((r, i) => [r.key, i] as const),
  )
  const rows = [...unordered].sort(
    (a, b) =>
      (stepOrder.get(a.line.key) ?? 9999) - (stepOrder.get(b.line.key) ?? 9999),
  )
  const allWeighted = making.every(
    (r) => r.weightPercent != null && r.weightPercent >= 1,
  )
  const canEdit = process?.canEdit === true

  function save(
    nextMaking: ProjectRabLabourProcessRow[],
    nextInstall: ProjectRabLabourProcessRow[],
  ) {
    if (!process?.canEdit) return
    void process.onSave(numberProcessRows(nextMaking, nextInstall))
  }

  function patchRow(
    source: ProjectRabLabourProcessRow[],
    key: string,
    patch: Partial<ProjectRabLabourProcessRow>,
  ) {
    return source.map((r) => (r.key === key ? { ...r, ...patch } : r))
  }

  /** Move a making stage to sequence `raw`; the others shift around it. */
  function setSequence(key: string, raw: string) {
    const n = Number(raw.trim())
    if (!Number.isInteger(n) || n < 1 || n > making.length) {
      toast.error(`Sequence must be a whole number from 1 to ${making.length}`)
      return
    }
    const row = making.find((r) => r.key === key)
    if (!row) return
    const rest = making.filter((r) => r.key !== key)
    rest.splice(n - 1, 0, row)
    save(rest, install)
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= making.length) return
    const next = [...making]
    ;[next[index], next[j]] = [next[j], next[index]]
    save(next, install)
  }

  function setWeight(key: string, raw: string) {
    const n = Number(raw.trim())
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      toast.error('Weight must be an integer from 1 to 100')
      return
    }
    save(
      patchRow(making, key, { weightPercent: n }),
      patchRow(install, key, { weightPercent: n }),
    )
  }

  function setRole(key: string, role: ProjectRabLabourRole) {
    const row = all.find((r) => r.key === key)
    if (!row || row.role === role) return
    if (role === 'install') {
      save(
        making.filter((r) => r.key !== key),
        [...install, { ...row, weightPercent: null }],
      )
    } else {
      // Back to making: becomes the last stage.
      save(
        [...making, { ...row, weightPercent: null }],
        install.filter((r) => r.key !== key),
      )
    }
  }

  function setExecutor(key: string, executor: ProjectRabLabourExecutor) {
    save(
      patchRow(making, key, { executor }),
      patchRow(install, key, { executor }),
    )
  }

  function processLine(row: ProjectRabLabourProcessRow, index: number) {
    const name = nameByKey.get(row.key) ?? row.key
    const isMaking = row.role === 'making'
    return (
      <li key={row.key} className="flex flex-wrap items-center gap-2 text-sm">
        {!isMaking ? (
          <span className="w-14 rounded border border-(--line) py-0.5 text-center text-xs text-(--muted)">
            Install
          </span>
        ) : canEdit ? (
          <Input
            type="number"
            min={1}
            max={making.length}
            step={1}
            className="h-7 w-12 px-1.5 text-center text-xs tabular-nums"
            defaultValue={row.sequence ?? ''}
            key={`${row.key}-seq-${row.sequence ?? 'x'}`}
            disabled={list.busy}
            aria-label={`Sequence for ${name}`}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v === '' || Number(v) === (row.sequence ?? NaN)) return
              setSequence(row.key, v)
            }}
          />
        ) : (
          <span className="w-5 tabular-nums text-(--muted)">
            {row.sequence ?? '—'}.
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        {canEdit ? (
          <>
            {isMaking ? (
              <>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    disabled={list.busy || index === 0}
                    aria-label="Move up"
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0"
                    disabled={list.busy || index === making.length - 1}
                    aria-label="Move down"
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </>
            ) : null}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={100}
                step={1}
                className="h-7 w-16 text-xs tabular-nums"
                defaultValue={row.weightPercent ?? ''}
                key={`${row.key}-w-${row.weightPercent ?? 'x'}`}
                disabled={list.busy}
                aria-label={`Weight for ${name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v === '' || Number(v) === (row.weightPercent ?? NaN)) {
                    return
                  }
                  setWeight(row.key, v)
                }}
              />
              <span className="text-(--muted)">%</span>
            </div>
            <Select
              value={row.role}
              disabled={list.busy}
              onValueChange={(v) => setRole(row.key, v as ProjectRabLabourRole)}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-24 px-2 text-xs"
                aria-label={`Role for ${name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="making">Making</SelectItem>
                <SelectItem value="install">Install</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={row.executor}
              disabled={list.busy}
              onValueChange={(v) =>
                setExecutor(row.key, v as ProjectRabLabourExecutor)
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-24 px-2 text-xs"
                aria-label={`Done by for ${name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inhouse">Inhouse</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
          </>
        ) : (
          <span className="tabular-nums text-(--muted)">
            {`${row.weightPercent != null ? `${row.weightPercent}%` : '—'} · `}
            {row.executor === 'vendor' ? 'Vendor' : 'Inhouse'}
          </span>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-1 border-t border-(--line) px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className={metaTextClassName}>
          Labour
          {lines.length > 0 ? (
            <span className="ml-1.5 tabular-nums">{lines.length}</span>
          ) : null}
        </p>
        {onAdd ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2"
            disabled={list.busy}
            onClick={onAdd}
          >
            <Plus className="size-3.5" aria-hidden />
            Add labour
          </Button>
        ) : null}
      </div>
      {process && all.length > 0 ? (
        <div className="mb-2 space-y-2 rounded-md bg-(--surface) px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm">
              {making.map((r, i) => (
                <span key={r.key}>
                  {i > 0 ? (
                    <span className="mx-1.5 text-(--muted)">→</span>
                  ) : null}
                  {nameByKey.get(r.key) ?? r.key}
                  <span className={cn('ml-1 tabular-nums', hintClassName)}>
                    {r.weightPercent != null ? `${r.weightPercent}%` : '—'}
                  </span>
                </span>
              ))}
              {install.length > 0 ? (
                <span className={hintClassName}>
                  {making.length > 0 ? ' · then install: ' : 'Install: '}
                  {install.map((r) => nameByKey.get(r.key) ?? r.key).join(', ')}
                </span>
              ) : null}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {process.makeType ? (
                <span className="rounded-full border border-(--line) px-2 py-0.5 text-xs text-(--muted)">
                  {MAKE_TYPE_LABEL[process.makeType]}
                </span>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-expanded={editingSteps}
                  onClick={() => setEditingSteps((v) => !v)}
                >
                  {editingSteps ? 'Done' : 'Edit steps'}
                </Button>
              ) : null}
            </div>
          </div>
          <WeightCheck
            making={making.length > 0 && allWeighted ? weightSum : null}
            install={
              install.length > 0 &&
              install.every((r) => r.weightPercent != null)
                ? installSum
                : null
            }
          />
          {editingSteps && canEdit ? (
            <ul className="space-y-1.5 border-t border-(--line) pt-2">
              {making.map((r, i) => processLine(r, i))}
              {install.map((r) => processLine(r, -1))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className={cn('text-sm', hintClassName)}>No labour yet.</p>
      ) : (
        <RabLineList rows={rows} section="labour" query={query} {...list} />
      )}
    </div>
  )
}

/** Weights must total 100% per track before SPKs can be made. */
function WeightCheck({
  making,
  install,
}: {
  making: number | null
  install: number | null
}) {
  const parts: { label: string; sum: number }[] = []
  if (making !== null) parts.push({ label: 'Making', sum: making })
  if (install !== null) parts.push({ label: 'Install', sum: install })
  if (parts.length === 0) return null
  const ok = parts.every((p) => p.sum === 100)
  return (
    <p
      className={cn(
        'text-sm tabular-nums',
        ok ? 'text-emerald-700' : 'text-amber-800',
      )}
      title="Each labour line becomes its own SPK. Making steps run in order; install steps run on finished pcs. Each track's weights must add up to 100% before SPKs can be made."
    >
      {ok
        ? 'Weights add up to 100%'
        : parts
            .filter((p) => p.sum !== 100)
            .map((p) => `${p.label} weights total ${p.sum}%, need 100%`)
            .join(' · ')}
    </p>
  )
}

function RabUnlinkedLabour({
  lines,
  query,
  list,
}: {
  lines: ProjectRabLine[]
  query: string
  list: LabourListProps
}) {
  const q = query.trim()
  const visible = lines.filter((line) => labourRowMatches(line, q))
  if (visible.length === 0) return null
  const total = sumAmounts(
    labourRows(visible, list.priceDrafts).map((r) => r.contributionTotal),
  )
  return (
    <section className={cn(cardClassName, 'overflow-hidden p-0')}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Other labour</p>
          <p className={cn('text-xs', hintClassName)}>
            Not linked to a shop drawing with a BOQ.
          </p>
        </div>
        <p className="text-sm font-medium tabular-nums">
          {formatRupiahAmount(total)}
        </p>
      </header>
      <RabDrawingLabour lines={visible} list={list} query={q} />
    </section>
  )
}

function labourRowMatches(line: ProjectRabLine, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  return (
    textMatches(line.materialName, q) ||
    textMatches(line.materialCode, q) ||
    textMatches(line.uomSymbol, q)
  )
}

function materialMatchesCategory(
  materialItemId: string,
  categoryFilter: string,
  categoryIdsByMaterialId: Map<string, string[]>,
): boolean {
  if (categoryFilter === 'all') return true
  const ids = categoryIdsByMaterialId.get(materialItemId) ?? []
  return ids.includes(categoryFilter)
}

function formatDelta(
  baseline: string | null | undefined,
  next: string | null | undefined,
): string {
  if (!baseline || !next) return '—'
  const b = Math.round(Number(baseline))
  const n = Math.round(Number(next))
  if (!Number.isFinite(b) || !Number.isFinite(n)) return '—'
  const d = n - b
  const sign = d > 0 ? '+' : ''
  return `${sign}${formatRupiahAmount(String(d))}`
}

function elaborationRowMatches(
  source: string,
  line: {
    materialName: string
    materialCode: string
    uomSymbol: string
  },
  query: string,
): boolean {
  const q = query.trim()
  if (!q) return true
  return (
    textMatches(source, q) ||
    textMatches(line.materialName, q) ||
    textMatches(line.materialCode, q) ||
    textMatches(line.uomSymbol, q)
  )
}

function countVisibleElaborationRows(
  doc: ProjectRabElaborationDoc,
  opts: {
    addedInChange: boolean
    reviewChangesOnly: boolean
    elaborationProvenanceByFile: Map<string, ChangeProvenance>
    query: string
    sectionFilter: string
    categoryFilter: string
    categoryIdsByMaterialId: Map<string, string[]>
  },
): number {
  if (opts.sectionFilter === 'labour') return 0
  const q = opts.query.trim()
  const docNameHit =
    q.length > 0 &&
    (textMatches(doc.shopDrawingItemName, q) ||
      textMatches(doc.originalFilename, q))
  let count = 0
  for (const block of doc.blocks) {
    const section = sectionFromBlockTitle(block.title)
    if (opts.sectionFilter !== 'all' && opts.sectionFilter !== section) {
      continue
    }
    for (const line of block.lines) {
      const rabKey = elaborationLineKey(line.materialItemId, line.itemUomId)
      const scopeKey = boqMaterialScopeKey(doc.shopDrawingFileId, rabKey)
      if (
        opts.reviewChangesOnly &&
        !opts.addedInChange &&
        !opts.elaborationProvenanceByFile.has(scopeKey)
      ) {
        continue
      }
      if (
        !materialMatchesCategory(
          line.materialItemId,
          opts.categoryFilter,
          opts.categoryIdsByMaterialId,
        )
      ) {
        continue
      }
      if (q && !docNameHit && !elaborationRowMatches(block.title, line, q)) {
        continue
      }
      count += 1
    }
  }
  return count
}

function ElaborationEmptyHint({
  documents,
  labourLines,
  addedBoqNames,
  reviewChangesOnly,
  elaborationProvenanceByFile,
  query,
  sectionFilter,
  categoryFilter,
  categoryIdsByMaterialId,
}: {
  documents: ProjectRabElaborationDoc[]
  labourLines: ProjectRabLine[]
  addedBoqNames: string[]
  reviewChangesOnly: boolean
  elaborationProvenanceByFile: Map<string, ChangeProvenance>
  query: string
  sectionFilter: string
  categoryFilter: string
  categoryIdsByMaterialId: Map<string, string[]>
}) {
  const q = query.trim()
  const docHits =
    sectionFilter === 'labour'
      ? 0
      : documents.reduce(
          (sum, doc) =>
            sum +
            countVisibleElaborationRows(doc, {
              addedInChange: addedBoqNames.includes(doc.shopDrawingItemName),
              reviewChangesOnly,
              elaborationProvenanceByFile,
              query: q,
              sectionFilter,
              categoryFilter,
              categoryIdsByMaterialId,
            }),
          0,
        )
  const labourHits =
    categoryFilter === 'all' &&
    (sectionFilter === 'all' || sectionFilter === 'labour')
      ? labourLines.filter((line) => labourRowMatches(line, q)).length
      : 0
  if (docHits > 0 || labourHits > 0) return null
  return (
    <p className={cn('text-sm', hintClassName)}>
      {q
        ? `No materials match “${q}”.`
        : sectionFilter !== 'all'
          ? 'No materials in this section.'
          : categoryFilter !== 'all'
            ? 'No materials in this category.'
            : reviewChangesOnly
              ? 'No changed materials in elaboration for this draft.'
              : null}
    </p>
  )
}

function RabElaborationDoc({
  doc,
  estimateLines,
  addedInChange,
  reviewChangesOnly,
  elaborationProvenanceByFile,
  changeDraft,
  query,
  sectionFilter,
  categoryFilter,
  categoryIdsByMaterialId,
  labour,
}: {
  doc: ProjectRabElaborationDoc
  estimateLines: ProjectRabLine[]
  addedInChange?: boolean
  reviewChangesOnly: boolean
  elaborationProvenanceByFile: Map<string, ChangeProvenance>
  changeDraft: ProjectRabChangeDraftRef | null
  query: string
  sectionFilter: string
  categoryFilter: string
  categoryIdsByMaterialId: Map<string, string[]>
  /** This card carries the drawing's labour (first card per drawing item). */
  labour: DrawingLabour | null
}) {
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const q = query.trim()
  const docNameHit =
    q.length > 0 &&
    (textMatches(doc.shopDrawingItemName, q) ||
      textMatches(doc.originalFilename, q))
  const allRows = doc.blocks.flatMap((block, bi) =>
    block.lines.map((line, li) => ({
      key: `${block.title}-${bi}-${line.materialCode}-${line.uomSymbol}-${li}`,
      rabKey: elaborationLineKey(line.materialItemId, line.itemUomId),
      scopeKey: boqMaterialScopeKey(
        doc.shopDrawingFileId,
        elaborationLineKey(line.materialItemId, line.itemUomId),
      ),
      source: block.title,
      section: sectionFromBlockTitle(block.title),
      line,
    })),
  )

  const rows = allRows.filter((row) => {
    if (sectionFilter !== 'all' && sectionFilter !== row.section) {
      return false
    }
    if (reviewChangesOnly && !addedInChange) {
      if (!elaborationProvenanceByFile.has(row.scopeKey)) return false
    }
    if (
      !materialMatchesCategory(
        row.line.materialItemId,
        categoryFilter,
        categoryIdsByMaterialId,
      )
    ) {
      return false
    }
    if (q && !docNameHit && !elaborationRowMatches(row.source, row.line, q)) {
      return false
    }
    return true
  })

  const filtering =
    q.length > 0 ||
    sectionFilter !== 'all' ||
    categoryFilter !== 'all' ||
    reviewChangesOnly
  const materialRows = sectionFilter === 'labour' ? [] : rows
  const showLabour =
    labour !== null &&
    categoryFilter === 'all' &&
    (sectionFilter === 'all' || sectionFilter === 'labour')
  const labourVisible = showLabour
    ? labour.lines.filter((line) => docNameHit || labourRowMatches(line, q))
    : []
  if (filtering && materialRows.length === 0 && labourVisible.length === 0) {
    return null
  }

  const materialTotal = sumAmounts(
    allRows.map(({ line }) => {
      const est = findEstimateLine(
        estimateLines,
        line.materialCode,
        line.uomSymbol,
      )
      return estimateAmount(
        boughtQty(line.totalQty, est),
        est?.unitPrice ?? null,
      )
    }),
  )
  const labourTotal = labour
    ? sumAmounts(
        labourRows(labour.lines, labour.list.priceDrafts).map(
          (r) => r.contributionTotal,
        ),
      )
    : null
  const drawingTotal = sumAmounts([materialTotal, labourTotal])
  const materialsExpanded =
    materialsOpen || (filtering && materialRows.length > 0)

  return (
    <section className={cn(cardClassName, 'overflow-hidden p-0')}>
      <header className="space-y-1 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="inline-flex flex-wrap items-center gap-2 text-sm font-medium">
            {highlightText(doc.shopDrawingItemName, q)}
            {addedInChange ? (
              <span
                className={cn(
                  'inline-flex rounded-sm px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                  changeKindBadgeClass('added'),
                )}
              >
                Added in change
              </span>
            ) : null}
          </p>
          <p className="text-base font-semibold tabular-nums">
            {formatRupiahAmount(drawingTotal)}
          </p>
        </div>
        <p className={cn('text-xs tabular-nums', hintClassName)}>
          {doc.makeQty} units · File v{doc.fileVersion} ·{' '}
          {highlightText(doc.originalFilename, q)}
        </p>
        {addedInChange && changeDraft ? (
          <div className={cn('pt-1 text-xs', hintClassName)}>
            <p>
              Open change · {formatWhen(changeDraft.openedAt)} ·{' '}
              {changeDraft.openedBy.name}
            </p>
            {changeDraft.reason.trim() ? (
              <p className="text-(--ink)">
                Because: {changeDraft.reason.trim()}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {sectionFilter === 'labour' ? null : (
        <button
          type="button"
          className="flex w-full items-center gap-2 border-t border-(--line) px-3 py-2 text-left hover:bg-(--surface)"
          onClick={() => setMaterialsOpen((open) => !open)}
          aria-expanded={materialsExpanded}
        >
          {materialsExpanded ? (
            <ChevronDown
              className="size-4 shrink-0 text-(--muted)"
              aria-hidden
            />
          ) : (
            <ChevronRight
              className="size-4 shrink-0 text-(--muted)"
              aria-hidden
            />
          )}
          <span className={cn(metaTextClassName, 'flex-1')}>
            Materials
            <span className="ml-1.5 tabular-nums">
              {filtering ? `${materialRows.length} / ` : ''}
              {allRows.length}
            </span>
          </span>
          <span className="text-sm tabular-nums text-(--muted)">
            {formatRupiahAmount(materialTotal)}
          </span>
        </button>
      )}

      {!materialsExpanded ||
      sectionFilter === 'labour' ? null : materialRows.length === 0 ? (
        <p className={cn('px-4 pb-3 text-sm', hintClassName)}>Empty BOQ.</p>
      ) : (
        <ul className="divide-y divide-(--line) border-t border-(--line)">
          {materialRows.map(({ key, scopeKey, source, line }) => {
            const est = findEstimateLine(
              estimateLines,
              line.materialCode,
              line.uomSymbol,
            )
            const bought = boughtQty(line.totalQty, est)
            const amount = estimateAmount(bought, est?.unitPrice ?? null)
            const provenance = elaborationProvenanceByFile.get(scopeKey)
            const kind = provenance?.kind
            const matched =
              q.length > 0 && elaborationRowMatches(source, line, q)
            return (
              <li
                key={key}
                className={cn(
                  'px-3 py-2.5',
                  kind === 'added' && 'bg-emerald-50/80',
                  kind === 'changed' && 'bg-amber-50/80',
                  kind === 'removed' && 'bg-red-50/60',
                  matched && !kind && 'bg-[#fff6d6]',
                )}
                data-find-hit={matched || undefined}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span>{highlightText(line.materialName, q)}</span>
                      {kind ? (
                        <span
                          className={cn(
                            'inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                            changeKindBadgeClass(kind),
                          )}
                        >
                          {changeKindLabel(kind)}
                        </span>
                      ) : null}
                    </p>
                    <p className={cn('font-mono text-xs', hintClassName)}>
                      {line.materialCode
                        ? highlightText(line.materialCode, q)
                        : '—'}
                      <span className="mx-1.5 text-(--line)">·</span>
                      <span className="tabular-nums">
                        {line.totalQty} {highlightText(line.uomSymbol, q)}
                      </span>
                      <span className="mx-1.5 text-(--line)">·</span>
                      <span className="tabular-nums">
                        {line.qtyPerUnit} × {line.makeQty}
                      </span>
                    </p>
                    {bought !== line.totalQty ? (
                      <p
                        className={cn('text-xs tabular-nums', hintClassName)}
                        title={
                          est
                            ? `RAB buys ${est.totalQty} ${est.uomSymbol} for a need of ${est.exactQty ?? est.totalQty}; this drawing carries its share.`
                            : undefined
                        }
                      >
                        Buy {bought} {line.uomSymbol} · need {line.totalQty}
                      </p>
                    ) : null}
                    <p className={cn('text-xs', hintClassName)}>
                      {highlightText(source, q)}
                    </p>
                    {provenance ? (
                      <ChangeProvenanceNote provenance={provenance} />
                    ) : null}
                  </div>
                  <p className="hidden text-sm tabular-nums text-(--muted) sm:block">
                    {formatRupiahAmount(est?.unitPrice)}
                  </p>
                  <p className="text-sm font-medium tabular-nums">
                    {amount === null ? '—' : formatRupiahAmount(amount)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {showLabour && labour ? (
        <RabDrawingLabour
          lines={filtering ? labourVisible : labour.lines}
          list={labour.list}
          onAdd={labour.onAdd}
          process={labour.process}
          query={q}
        />
      ) : null}
    </section>
  )
}

/** "37.24138" -> "37.24"; integers stay as they are. */
function trimQty(qty: string): string {
  const n = Number(qty)
  if (!Number.isFinite(n)) return qty
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
}

/** Hover text for a line's quantity: BOQ need vs bought, and why. */
function qtyBreakdown(
  line: ProjectRabLine,
  contributionQty: string,
): string | undefined {
  const parts: string[] = []
  if (contributionQty !== line.totalQty) {
    parts.push(`RAB total ${line.totalQty} ${line.uomSymbol}`)
  }
  if (line.exactQty !== null && line.exactQty !== line.totalQty) {
    parts.push(
      `BOQ needs ${trimQty(line.exactQty)}, buying ${line.totalQty} ${line.uomSymbol}`,
    )
    const waste = Number(line.wasteQty)
    if (waste > 0) parts.push(`waste ${trimQty(String(waste))}`)
    if (line.rounding) {
      parts.push(
        `rounded ${line.rounding.mode === 'nearest' ? 'to nearest' : line.rounding.mode} step ${line.rounding.step}`,
      )
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function RabLineList({
  rows,
  section,
  lineKindByKey,
  priceDrafts,
  setPriceDrafts,
  canManage,
  busy,
  query,
  onSavePrice,
  onSaveTotal,
  onSetMode,
  onFillTarif,
  onRemove,
}: {
  rows: EstimateSectionRow[]
  section: RabMaterialSection
  lineKindByKey: Map<string, ProjectRabLineChangeKind>
  priceDrafts: Record<string, string>
  setPriceDrafts: Dispatch<SetStateAction<Record<string, string>>>
  canManage: boolean
  busy: boolean
  query: string
  onSavePrice: (lineKey: string) => Promise<void>
  onSaveTotal: (lineKey: string, digits: string) => Promise<boolean>
  onSetMode: (lineKey: string, byTotal: boolean) => Promise<void>
  onFillTarif: (lineKey: string) => Promise<void>
  onRemove?: (lineKey: string) => Promise<void>
}) {
  const q = query.trim()
  const [totalDrafts, setTotalDrafts] = useState<Record<string, string>>({})
  /** Mode picked on a row this session; else the line's saved mode. */
  const [modeByKey, setModeByKey] = useState<Record<string, PriceMode>>({})
  const setRowMode = (key: string, mode: PriceMode) => {
    setModeByKey((prev) => ({ ...prev, [key]: mode }))
    void onSetMode(key, mode === 'total')
    setTotalDrafts((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }
  return (
    <>
      <ul className="space-y-0">
        {rows.map((row) => {
          const { line, contributionQty, contributionTotal, alsoIn } = row
          const rowKey = `${section}:${line.key}`
          const savedDigits = plainFromSaved(line.unitPrice)
          const draftDigits =
            priceDrafts[line.key] !== undefined
              ? rupiahDigits(priceDrafts[line.key]!)
              : savedDigits
          const dirty =
            priceDrafts[line.key] !== undefined && draftDigits !== savedDigits
          const editable = canManage && line.priceEditable
          const hasPrice = draftDigits !== ''
          const showTarif = editable && line.hasTarif && !hasPrice
          const kind = lineKindByKey.get(line.key)
          const matched = q.length > 0 && estimateRowMatches(row, q)
          const amount =
            contributionTotal ??
            (hasPrice ? estimateAmount(contributionQty, draftDigits) : null)
          const byTotal =
            (modeByKey[line.key] ?? (line.priceByTotal ? 'total' : 'unit')) ===
            'total'
          const savedTotalDigits = plainFromSaved(line.lineTotal)
          const totalDigits = totalDrafts[line.key] ?? savedTotalDigits
          const totalDirty =
            totalDrafts[line.key] !== undefined &&
            totalDigits !== savedTotalDigits &&
            totalDigits !== ''
          const qtyNum = Number(line.totalQty)
          const unitFromTotal =
            totalDigits !== '' && qtyNum > 0
              ? String(Math.round(Number(totalDigits) / qtyNum))
              : ''
          return (
            <li
              key={rowKey}
              className={cn(
                'group border-b border-(--line) py-3 last:border-b-0',
                kind === 'added' && 'bg-emerald-50/80',
                kind === 'changed' && 'bg-amber-50/80',
                kind === 'removed' && 'bg-red-50/60',
                matched && !kind && 'bg-[#fff6d6]',
              )}
            >
              <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_19rem_minmax(7rem,auto)_auto] sm:items-center sm:gap-x-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span
                      className={cn(
                        kind === 'removed' && 'line-through opacity-80',
                      )}
                    >
                      {highlightText(line.materialName, q)}
                    </span>
                    {kind ? (
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                          changeKindBadgeClass(kind),
                        )}
                      >
                        {changeKindLabel(kind)}
                      </span>
                    ) : null}
                  </p>
                  <p className={cn('text-sm', hintClassName)}>
                    {line.materialCode ? (
                      <>
                        <span className="font-mono text-xs">
                          {highlightText(line.materialCode, q)}
                        </span>
                        <span className="mx-1.5 text-(--line)">·</span>
                      </>
                    ) : null}
                    <span
                      className={cn(
                        'tabular-nums',
                        line.exactQty !== null &&
                          line.exactQty !== line.totalQty &&
                          'cursor-help underline decoration-dotted underline-offset-4',
                      )}
                      title={qtyBreakdown(line, contributionQty)}
                    >
                      {contributionQty} {highlightText(line.uomSymbol, q)}
                    </span>
                  </p>
                  {line.exactQty !== null && Number(line.wasteQty) < 0 ? (
                    <p className="text-sm text-amber-700">
                      Short {trimQty((line.wasteQty ?? '').replace('-', ''))}{' '}
                      {line.uomSymbol} against the BOQ
                    </p>
                  ) : null}
                  {alsoIn.length > 0 ? (
                    <p className={cn('text-xs', hintClassName)}>
                      Also in {alsoIn.map((s) => SECTION_LABELS[s]).join(', ')}
                    </p>
                  ) : null}
                  {line.origin === 'append' && line.addedBy && line.addedAt ? (
                    <p className={cn('text-xs', hintClassName)}>
                      Added {line.addedBy.name} {formatWhen(line.addedAt)}
                      {line.addReason?.trim()
                        ? ` · ${line.addReason.trim()}`
                        : ''}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                  {editable ? (
                    <>
                      <div
                        role="radiogroup"
                        aria-label={`Price entry for ${line.materialName}`}
                        className={cn(
                          'flex h-8 shrink-0 items-center rounded-md border border-(--line) p-0.5 text-xs transition-opacity',
                          !byTotal &&
                            'sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
                        )}
                      >
                        {(['unit', 'total'] as const).map((mode) => {
                          const active = (mode === 'total') === byTotal
                          return (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={busy}
                              onClick={() => setRowMode(line.key, mode)}
                              className={cn(
                                'h-full rounded-[5px] px-2 transition-colors',
                                active
                                  ? 'bg-(--ink) text-(--surface)'
                                  : 'text-(--muted) hover:text-(--ink)',
                              )}
                            >
                              {mode === 'unit'
                                ? `/ ${line.uomSymbol}`
                                : 'Total'}
                            </button>
                          )
                        })}
                      </div>
                      {byTotal ? (
                        <>
                          <RupiahInput
                            value={totalDigits}
                            onValueChange={(digits) =>
                              setTotalDrafts((prev) => ({
                                ...prev,
                                [line.key]: digits,
                              }))
                            }
                            disabled={busy}
                            wrapperClassName="min-w-0 flex-1"
                            className="h-8"
                            aria-label={`Line total ${line.materialName}`}
                          />
                          {totalDirty ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 shrink-0 px-2"
                              disabled={busy}
                              onClick={() => {
                                void onSaveTotal(line.key, totalDigits).then(
                                  (saved) =>
                                    saved &&
                                    setTotalDrafts((prev) => {
                                      const next = { ...prev }
                                      delete next[line.key]
                                      return next
                                    }),
                                )
                              }}
                            >
                              Save
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <RupiahInput
                          value={draftDigits}
                          onValueChange={(digits) =>
                            setPriceDrafts((prev) => ({
                              ...prev,
                              [line.key]: digits,
                            }))
                          }
                          disabled={busy}
                          wrapperClassName="min-w-0 flex-1"
                          className="h-8"
                          aria-label={`Unit price ${line.materialName}`}
                        />
                      )}
                      {!byTotal && dirty ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2"
                          disabled={busy}
                          onClick={() => void onSavePrice(line.key)}
                        >
                          Save
                        </Button>
                      ) : null}
                      {showTarif ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void onFillTarif(line.key)}
                        >
                          Tarif
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-sm tabular-nums">
                      {formatRupiahAmount(line.unitPrice)}
                    </span>
                  )}
                </div>

                <p className="text-base font-medium tabular-nums sm:text-right">
                  {formatRupiahAmount(amount)}
                  {byTotal && totalDirty && unitFromTotal ? (
                    <span
                      className={cn(
                        'mt-0.5 block text-xs font-normal',
                        hintClassName,
                      )}
                    >
                      ≈ Rp {formatRupiahDigits(unitFromTotal)} /{' '}
                      {line.uomSymbol}
                    </span>
                  ) : null}
                </p>

                {onRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-700"
                    disabled={busy}
                    aria-label={`Remove ${line.materialName}`}
                    onClick={() => void onRemove(line.key)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
