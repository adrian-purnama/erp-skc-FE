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
  ArrowLeft,
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
  ProjectRabLabourItem,
  ProjectRabLine,
  ProjectRabLineChangeKind,
  ProjectShopDrawingBoqMaterial,
} from '#/lib/project'
import {
  buttonClassName,
  buttonOutlineClassName,
  cardClassName,
  hintClassName,
  pageTitleClassName,
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

/** Labour rows stay plain in the list; change markers live under Added after lock. */
const NO_LINE_KINDS = new Map<string, ProjectRabLineChangeKind>()

/** Display saved amount as Rp-formatted (or —). */
function formatRupiahAmount(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount.trim() === '') {
    return '—'
  }
  const digits = rupiahDigits(amount.split('.')[0] ?? amount)
  if (!digits) return '—'
  return `Rp ${formatRupiahDigits(digits)}`
}

function plainFromSaved(amount: string | null | undefined): string {
  if (!amount) return ''
  return rupiahDigits(amount.split('.')[0] ?? amount)
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
  const price = Number(rupiahDigits(unitPrice.split('.')[0] ?? unitPrice))
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return null
  return String(Math.round(qty * price))
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

function unitPriceDigitsForLine(
  line: ProjectRabLine,
  priceDrafts: Record<string, string>,
): string {
  if (priceDrafts[line.key] !== undefined) {
    return rupiahDigits(priceDrafts[line.key]!)
  }
  return plainFromSaved(line.unitPrice)
}

function sumContributionTotals(
  rows: EstimateSectionRow[],
): string | null {
  let sum = 0
  let any = false
  for (const row of rows) {
    if (row.contributionTotal == null || row.contributionTotal === '') continue
    const n = Number(
      rupiahDigits(
        String(row.contributionTotal).split('.')[0] ?? row.contributionTotal,
      ),
    )
    if (!Number.isFinite(n)) continue
    sum += n
    any = true
  }
  return any ? String(Math.round(sum)) : null
}

/** Group RAB lines by BOQ section using elaboration contribution qtys. */
function buildEstimateSections(
  elaboration: ProjectRabElaboration | null,
  materialLines: ProjectRabLine[],
  labourLines: ProjectRabLine[],
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
      const contributionQty = formatContributionQty(qty)
      const priceDigits = unitPriceDigitsForLine(line, priceDrafts)
      const contributionTotal =
        priceDigits === ''
          ? null
          : estimateAmount(contributionQty, priceDigits)
      const alsoIn = [...(sectionsSeenByKey.get(key) ?? [])]
        .filter((s) => s !== section)
        .sort(
          (a, b) =>
            SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b),
        )
      rows.push({ line, contributionQty, contributionTotal, alsoIn })
    }
    rows.sort((a, b) =>
      a.line.materialName.localeCompare(b.line.materialName),
    )
    return rows
  }

  return SECTION_ORDER.map((section) => {
    if (section === 'labour') {
      const rows: EstimateSectionRow[] = labourLines.map((line) => {
        const priceDigits = unitPriceDigitsForLine(line, priceDrafts)
        const contributionTotal =
          line.lineTotal ??
          (priceDigits === ''
            ? null
            : estimateAmount(line.totalQty, priceDigits))
        return {
          line,
          contributionQty: line.totalQty,
          contributionTotal,
          alsoIn: [],
        }
      })
      return {
        section,
        label: SECTION_LABELS[section],
        rows,
        subtotal: sumContributionTotals(rows),
      }
    }
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

function buildChangeProvenanceByKey(
  lines: ProjectRabLine[],
  lineKindByKey: Map<string, ProjectRabLineChangeKind>,
  changeDraft: ProjectRabChangeDraftRef | null,
  lineDiff: ProjectRab['changeDiff'],
): Map<string, ChangeProvenance> {
  const diffByKey = new Map(
    (lineDiff?.lineDiff ?? []).map((d) => [d.key, d] as const),
  )
  const map = new Map<string, ChangeProvenance>()

  for (const [key, kind] of lineKindByKey) {
    const line = lines.find((l) => l.key === key)
    const diff = diffByKey.get(key)
    const fromOpenChange = Boolean(changeDraft)
    map.set(key, {
      kind,
      whenIso: fromOpenChange ? changeDraft!.openedAt : (line?.addedAt ?? null),
      byName: fromOpenChange
        ? changeDraft!.openedBy.name
        : (line?.addedBy?.name ?? null),
      because: fromOpenChange
        ? changeDraft!.reason.trim()
        : (line?.addReason?.trim() ?? ''),
      fromOpenChange,
      oldTotalQty: diff?.oldTotalQty ?? null,
      newTotalQty: diff?.newTotalQty ?? null,
      oldUnitPrice: diff?.oldUnitPrice ?? null,
      newUnitPrice: diff?.newUnitPrice ?? null,
    })
  }

  // Committed appends not in the open-diff map still carry stamps.
  for (const line of lines) {
    if (map.has(line.key)) continue
    if (line.origin !== 'append' && !line.addReason?.trim()) continue
    map.set(line.key, {
      kind: 'added',
      whenIso: line.addedAt,
      byName: line.addedBy?.name ?? null,
      because: line.addReason?.trim() ?? '',
      fromOpenChange: false,
      oldTotalQty: null,
      newTotalQty: line.totalQty,
      oldUnitPrice: null,
      newUnitPrice: line.unitPrice,
    })
  }

  return map
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
    <div className={cn('mt-1 space-y-0.5 text-[11px]', hintClassName)}>
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
      const [rabRes, elabRes, labourRes, materialsRes, categoriesRes] =
        await Promise.all([
          apiFetch<ProjectRab | null>(`/project/${pid}/rab`),
          apiFetch<ProjectRabElaboration>(`/project/${pid}/rab/elaboration`),
          apiFetch<ProjectRabLabourItem[]>(`/project/${pid}/rab/labour-items`),
          apiFetch<ProjectShopDrawingBoqMaterial[]>(
            `/project/${pid}/shop-drawing/boq/materials`,
          ),
          apiFetch<ItemCategoryOut[]>('/item-categories'),
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
    } catch {
      toast.error('Unable to reach the server')
      setRab(null)
      setElaboration(null)
      setLabourItems([])
      setMaterials([])
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setRab(null)
    setElaboration(null)
    setPriceDrafts({})
    setLabourItems([])
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
      labourLines,
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
    labourLines,
    priceDrafts,
    estimateQuery,
    estimateSectionFilter,
  ])
  const changeDraft = rab?.changeDraft ?? null
  const changeProvenanceByKey = useMemo(
    () =>
      buildChangeProvenanceByKey(
        lines,
        lineKindByKey,
        changeDraft,
        rab?.changeDiff ?? null,
      ),
    [lines, lineKindByKey, changeDraft, rab?.changeDiff],
  )
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

  async function addLabourLine() {
    if (!projectId || !canManage) return
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
      setLabourItemId('')
      setLabourUomId('')
      setLabourQty('1')
      setLabourPriceDigits('')
      toast.success('Labour line added')
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
                        className="h-8 gap-1.5 border-sky-200 text-sky-700 hover:bg-sky-50 hover:text-sky-800"
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
                {canManage && hasLines && !isLocked ? (
                  <Button
                    type="button"
                    variant="outline"
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
                    className="h-8 gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900"
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
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={busy}
                      onClick={() => void discardChange()}
                    >
                      <Undo2 className="size-3.5" aria-hidden />
                      Discard
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
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

          <Tabs value={tab} onValueChange={setTab} className="gap-0">
            <TabsList variant="line">
              <TabsTrigger value="estimate">Estimate</TabsTrigger>
              <TabsTrigger value="elaboration">Elaboration</TabsTrigger>
              {isLocked ? (
                <TabsTrigger value="history">Change history</TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="estimate" className="mt-4 space-y-6">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <ListSearchInput
                  value={estimateQuery}
                  onChange={setEstimateQuery}
                  placeholder="Find material…"
                  aria-label="Find material in estimate"
                  className="max-w-sm flex-1"
                />
                <Combobox
                  value={estimateSectionFilter}
                  onValueChange={setEstimateSectionFilter}
                  options={SECTION_FILTER_OPTIONS}
                  placeholder="All sections"
                  searchPlaceholder="Search section…"
                  emptyText="No section found."
                  aria-label="Section filter"
                  className="w-[11rem] shrink-0"
                />
              </div>

              {materialLines.length === 0 && labourLines.length === 0 ? (
                <p className={cn('text-sm', hintClassName)}>
                  {reviewChangesOnly
                    ? 'No lines changed in this draft.'
                    : 'No materials yet. Fill Shop Drawing BOQ first.'}
                </p>
              ) : (
                <>
                {estimateSections.every(
                  (group) =>
                    group.rows.length === 0 &&
                    !(group.section === 'labour' && canManage && canEdit),
                ) ? (
                  <p className={cn('text-sm', hintClassName)}>
                    {estimateQuery.trim()
                      ? `No materials match “${estimateQuery.trim()}”.`
                      : estimateSectionFilter !== 'all'
                        ? 'No materials in this section.'
                        : reviewChangesOnly
                          ? 'No lines changed in this draft.'
                          : 'No materials yet. Fill Shop Drawing BOQ first.'}
                  </p>
                ) : null}
                {estimateSections.map((group) => {
                  const showLabourForm =
                    group.section === 'labour' && canManage && canEdit
                  const isCollapsed = collapsedEstimateSections.has(
                    group.section,
                  )
                  const hideEmpty =
                    group.rows.length === 0 &&
                    !showLabourForm &&
                    (estimateQuery.trim() !== '' ||
                      estimateSectionFilter !== 'all')
                  if (hideEmpty) return null
                  if (
                    group.rows.length === 0 &&
                    !showLabourForm &&
                    estimateSectionFilter === 'all' &&
                    !estimateQuery.trim() &&
                    group.section !== 'labour'
                  ) {
                    return null
                  }
                  return (
                    <section
                      key={group.section}
                      className="space-y-2 border-t border-(--line) pt-4 first:border-t-0 first:pt-0"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 text-left"
                        onClick={() =>
                          setCollapsedEstimateSections((prev) => {
                            const next = new Set(prev)
                            if (next.has(group.section)) next.delete(group.section)
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
                        <h2 className="min-w-0 flex-1 text-sm font-medium">
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
                          <span className="text-sm tabular-nums text-(--muted)">
                            {formatRupiahAmount(group.subtotal)}
                          </span>
                        ) : null}
                      </button>

                      {!isCollapsed ? (
                        <div className="space-y-3">
                          {showLabourForm ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_5rem_8rem_auto] sm:items-end">
                              <div className="space-y-1">
                                <p className={cn('text-xs', hintClassName)}>
                                  Item
                                </p>
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
                                  disabled={busy || labourItems.length === 0}
                                  aria-label="Labour item"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className={cn('text-xs', hintClassName)}>
                                  UOM
                                </p>
                                <Combobox
                                  value={labourUomId}
                                  onValueChange={setLabourUomId}
                                  options={(selectedLabour?.uoms ?? []).map(
                                    (u) => ({
                                      value: u.id,
                                      label: `${u.symbol} — ${u.name}`,
                                    }),
                                  )}
                                  placeholder="UOM…"
                                  searchPlaceholder="Search UOM…"
                                  emptyText="No UOMs."
                                  className="w-full"
                                  disabled={busy || !selectedLabour}
                                  aria-label="Labour UOM"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className={cn('text-xs', hintClassName)}>
                                  Qty
                                </p>
                                <Input
                                  value={labourQty}
                                  onChange={(e) => setLabourQty(e.target.value)}
                                  disabled={busy}
                                  inputMode="decimal"
                                  className="h-9 tabular-nums"
                                  aria-label="Labour quantity"
                                />
                              </div>
                              <div className="space-y-1">
                                <p className={cn('text-xs', hintClassName)}>
                                  Unit price
                                </p>
                                <RupiahInput
                                  value={labourPriceDigits}
                                  onValueChange={setLabourPriceDigits}
                                  disabled={busy}
                                  aria-label="Labour unit price"
                                />
                              </div>
                              <Button
                                type="button"
                                className={cn(buttonClassName, 'h-9')}
                                disabled={
                                  busy || !labourItemId || !labourUomId
                                }
                                onClick={() => void addLabourLine()}
                              >
                                <Plus className="size-3.5" aria-hidden />
                                Add
                              </Button>
                            </div>
                          ) : null}

                          {group.rows.length === 0 ? (
                            <p className={cn('text-sm', hintClassName)}>
                              {group.section === 'labour'
                                ? reviewChangesOnly
                                  ? 'No labour lines changed in this draft.'
                                  : canManage && canEdit
                                    ? 'No labour lines yet. Add a labour item above.'
                                    : 'No labour lines.'
                                : estimateQuery.trim()
                                  ? `No materials match “${estimateQuery.trim()}”.`
                                  : 'No materials in this section.'}
                            </p>
                          ) : (
                            <RabLineList
                              rows={group.rows}
                              section={group.section}
                              lineKindByKey={
                                group.section === 'labour'
                                  ? NO_LINE_KINDS
                                  : lineKindByKey
                              }
                              priceDrafts={priceDrafts}
                              setPriceDrafts={setPriceDrafts}
                              canManage={canManage}
                              busy={busy}
                              query={estimateQuery}
                              onSavePrice={saveUnitPrice}
                              onFillTarif={fillTarif}
                              onRemove={
                                group.section === 'labour' &&
                                canManage &&
                                canEdit
                                  ? removeLabourLine
                                  : undefined
                              }
                            />
                          )}
                        </div>
                      ) : null}
                    </section>
                  )
                })}
                </>
              )}

              {addedAfterLockGroups.length > 0 ? (
                <section className="space-y-4 border-t border-(--line) pt-4">
                  <h2 className="text-sm font-medium">Changes after lock</h2>
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
                                    'inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                                    changeKindBadgeClass('added'),
                                  )}
                                >
                                  Added
                                </span>
                                {line.origin === 'labour' ? (
                                  <span
                                    className={cn('text-[11px]', hintClassName)}
                                  >
                                    labour
                                  </span>
                              ) : null}
                            </p>
                            <p
                              className={cn(
                                'font-mono text-[11px]',
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
                          <p className={cn('text-xs font-medium', hintClassName)}>
                            Shop drawing materials
                          </p>
                          <RabSdMaterialChanges materials={group.materials} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {hasLines ? (
                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-(--line) pt-3 text-sm">
                  {changeDraft && rab?.baselineGrandTotal != null ? (
                    <>
                      <span className="text-(--muted)">
                        Baseline{' '}
                        <span className="tabular-nums text-(--ink)">
                          {formatRupiahAmount(rab.baselineGrandTotal)}
                        </span>
                      </span>
                      <span className="text-(--muted)">
                        Delta{' '}
                        <span className="tabular-nums text-(--ink)">
                          {formatDelta(rab.baselineGrandTotal, rab.grandTotal)}
                        </span>
                      </span>
                    </>
                  ) : null}
                  <span className="text-(--muted)">Grand total</span>
                  <span className="font-medium tabular-nums">
                    {formatRupiahAmount(rab?.grandTotal)}
                  </span>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="elaboration" className="mt-4 space-y-5">
              {!elaboration?.documents.length && labourLines.length === 0 ? (
                <p className={cn('text-sm', hintClassName)}>
                  No BOQ documents or labour lines to elaborate.
                </p>
              ) : (
                <>
                  <p className={hintClassName}>
                    Materials by shop drawing, with qty and RAB estimate. Labour
                    is listed below.
                    {reviewChangesOnly
                      ? ' Showing only materials changed in this draft.'
                      : ''}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={cn('text-xs', hintClassName)}>
                        Find material
                      </p>
                      <ListSearchInput
                        value={elaborationQuery}
                        onChange={setElaborationQuery}
                        placeholder="Find material…"
                        aria-label="Find material in elaboration"
                        className="max-w-sm w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className={cn('text-xs', hintClassName)}>Section</p>
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
                    </div>
                    <div className="space-y-1">
                      <p className={cn('text-xs', hintClassName)}>Category</p>
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
                  </div>
                  {(elaborationSectionFilter === 'all' ||
                    elaborationSectionFilter !== 'labour') &&
                    (elaboration?.documents ?? []).map((doc) => (
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
                      />
                    ))}
                  {labourLines.length > 0 &&
                  (elaborationSectionFilter === 'all' ||
                    elaborationSectionFilter === 'labour') ? (
                    <RabElaborationLabour
                      lines={labourLines}
                      lineKindByKey={lineKindByKey}
                      changeProvenanceByKey={changeProvenanceByKey}
                      query={elaborationQuery}
                      categoryFilter={elaborationCategoryFilter}
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
                  {hasLines ? (
                    <div className="flex justify-end gap-2 border-t border-(--line) pt-3 text-sm">
                      <span className="text-(--muted)">Grand total</span>
                      <span className="font-medium tabular-nums">
                        {formatRupiahAmount(rab?.grandTotal)}
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </TabsContent>

            {isLocked && projectId ? (
              <TabsContent value="history" className="mt-4">
                <ProjectRabChangeHistory
                  projectId={projectId}
                  refreshKey={`${rab?.currentRevision ?? 0}-${changeDraft?.id ?? ''}-${rab?.grandTotal ?? ''}`}
                />
              </TabsContent>
            ) : null}
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
    </div>
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

function RabElaborationLabour({
  lines,
  lineKindByKey,
  changeProvenanceByKey,
  query,
  categoryFilter,
}: {
  lines: ProjectRabLine[]
  lineKindByKey: Map<string, ProjectRabLineChangeKind>
  changeProvenanceByKey: Map<string, ChangeProvenance>
  query: string
  categoryFilter: string
}) {
  if (categoryFilter !== 'all') return null
  const q = query.trim()
  const visible = lines.filter((line) => labourRowMatches(line, q))
  if (visible.length === 0) {
    return q ? (
      <p className={cn('text-sm', hintClassName)}>
        No labour lines match “{q}”.
      </p>
    ) : null
  }

  let sum = 0
  let any = false
  for (const line of visible) {
    const amount =
      line.lineTotal ?? estimateAmount(line.totalQty, line.unitPrice)
    if (amount !== null && amount !== '') {
      const n = Number(rupiahDigits(String(amount).split('.')[0] ?? amount))
      if (Number.isFinite(n)) {
        sum += n
        any = true
      }
    }
  }

  return (
    <section className={cn(cardClassName, 'overflow-hidden p-0')}>
      <header className="space-y-1 border-b border-(--line) px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Labour</p>
          <p className={cn('text-xs', hintClassName)}>Added on RAB Estimate</p>
        </div>
      </header>
      <ul className="divide-y divide-(--line)">
        {visible.map((line) => {
          const amount =
            line.lineTotal ?? estimateAmount(line.totalQty, line.unitPrice)
          const kind = lineKindByKey.get(line.key)
          const provenance = changeProvenanceByKey.get(line.key)
          const matched = q.length > 0 && labourRowMatches(line, q)
          return (
            <li
              key={line.key}
              className={cn(
                'px-3 py-2.5',
                kind === 'added' && 'bg-emerald-50/80',
                kind === 'changed' && 'bg-amber-50/80',
                kind === 'removed' && 'bg-red-50/60',
                matched && !kind && 'bg-[#fff6d6]',
              )}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span>{highlightText(line.materialName, q)}</span>
                    {kind ? (
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                          changeKindBadgeClass(kind),
                        )}
                      >
                        {changeKindLabel(kind)}
                      </span>
                    ) : null}
                  </p>
                  <p className={cn('font-mono text-[11px]', hintClassName)}>
                    {line.materialCode
                      ? highlightText(line.materialCode, q)
                      : '—'}
                    <span className="mx-1.5 text-(--line)">·</span>
                    <span className="tabular-nums">
                      {line.totalQty} {highlightText(line.uomSymbol, q)}
                    </span>
                  </p>
                  {provenance ? (
                    <ChangeProvenanceNote provenance={provenance} />
                  ) : null}
                </div>
                <p className="text-sm tabular-nums text-(--muted)">
                  {formatRupiahAmount(line.unitPrice)}
                </p>
                <p className="text-sm font-medium tabular-nums">
                  {formatRupiahAmount(amount)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      {any ? (
        <div className="flex items-center justify-end gap-2 border-t border-(--line) bg-(--surface) px-3 py-2.5 text-sm">
          <span className="text-xs text-(--muted)">Labour estimate</span>
          <span className="font-medium tabular-nums">
            {formatRupiahAmount(String(sum))}
          </span>
        </div>
      ) : null}
    </section>
  )
}

function formatDelta(
  baseline: string | null | undefined,
  next: string | null | undefined,
): string {
  const b = Number(rupiahDigits((baseline ?? '').split('.')[0] ?? ''))
  const n = Number(rupiahDigits((next ?? '').split('.')[0] ?? ''))
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
    if (
      opts.sectionFilter !== 'all' &&
      opts.sectionFilter !== section
    ) {
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
}) {
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

  if (rows.length === 0 && allRows.length > 0) {
    return null
  }

  let docEstimateSum = 0
  let docEstimateAny = false
  for (const { line } of rows) {
    const est = findEstimateLine(
      estimateLines,
      line.materialCode,
      line.uomSymbol,
    )
    const amount = estimateAmount(line.totalQty, est?.unitPrice ?? null)
    if (amount !== null) {
      docEstimateSum += Number(amount)
      docEstimateAny = true
    }
  }

  return (
    <section className={cn(cardClassName, 'overflow-hidden p-0')}>
      <header className="space-y-1 border-b border-(--line) px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="inline-flex flex-wrap items-center gap-2 text-sm font-medium">
            {highlightText(doc.shopDrawingItemName, q)}
            {addedInChange ? (
              <span
                className={cn(
                  'inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                  changeKindBadgeClass('added'),
                )}
              >
                Added in change
              </span>
            ) : null}
          </p>
          <p className="text-xs tabular-nums text-(--muted)">
            Make qty{' '}
            <span className="font-medium text-(--ink)">{doc.makeQty}</span>{' '}
            units
          </p>
        </div>
        <p className={cn('text-xs', hintClassName)}>
          File v{doc.fileVersion} · {highlightText(doc.originalFilename, q)}
        </p>
        {addedInChange && changeDraft ? (
          <div className={cn('pt-1 text-[11px]', hintClassName)}>
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

      {rows.length === 0 ? (
        <p className={cn('px-4 py-6 text-sm', hintClassName)}>Empty BOQ.</p>
      ) : (
        <ul className="divide-y divide-(--line)">
          {rows.map(({ key, scopeKey, source, line }) => {
            const est = findEstimateLine(
              estimateLines,
              line.materialCode,
              line.uomSymbol,
            )
            const amount = estimateAmount(
              line.totalQty,
              est?.unitPrice ?? null,
            )
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
                            'inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                            changeKindBadgeClass(kind),
                          )}
                        >
                          {changeKindLabel(kind)}
                        </span>
                      ) : null}
                    </p>
                    <p className={cn('font-mono text-[11px]', hintClassName)}>
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
                    <p className={cn('text-[11px]', hintClassName)}>
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
      {docEstimateAny ? (
        <div className="flex items-center justify-end gap-2 border-t border-(--line) bg-(--surface) px-3 py-2.5 text-sm">
          <span className="text-xs text-(--muted)">
            Document estimate (priced lines)
          </span>
          <span className="font-medium tabular-nums">
            {formatRupiahAmount(String(docEstimateSum))}
          </span>
        </div>
      ) : null}
    </section>
  )
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
  onFillTarif: (lineKey: string) => Promise<void>
  onRemove?: (lineKey: string) => Promise<void>
}) {
  const q = query.trim()
  return (
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
        return (
          <li
            key={rowKey}
            className={cn(
              'border-b border-(--line) py-2.5 last:border-b-0',
              kind === 'added' && 'bg-emerald-50/80',
              kind === 'changed' && 'bg-amber-50/80',
              kind === 'removed' && 'bg-red-50/60',
              matched && !kind && 'bg-[#fff6d6]',
            )}
          >
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem_minmax(7rem,auto)_auto] sm:items-center sm:gap-x-3">
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
                        'inline-flex shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                        changeKindBadgeClass(kind),
                      )}
                    >
                      {changeKindLabel(kind)}
                    </span>
                  ) : null}
                </p>
                <p className={cn('font-mono text-[11px]', hintClassName)}>
                  {line.materialCode
                    ? highlightText(line.materialCode, q)
                    : '—'}
                  <span className="mx-1.5 text-(--line)">·</span>
                  <span className="tabular-nums">
                    {contributionQty} {highlightText(line.uomSymbol, q)}
                  </span>
                </p>
                {line.exactQty !== null && line.exactQty !== line.totalQty ? (
                  <p
                    className={cn(
                      'text-[11px]',
                      Number(line.wasteQty) < 0
                        ? 'text-amber-600'
                        : hintClassName,
                    )}
                    title={`BOQ need ${line.exactQty}, bought ${line.totalQty} (${line.rounding?.decimals ?? '—'} dp, ${line.rounding?.mode ?? '—'})`}
                  >
                    RAB total {line.totalQty} · need {line.exactQty}
                    {Number(line.wasteQty) < 0
                      ? ` · short ${line.wasteQty?.replace('-', '')}`
                      : ` · waste ${line.wasteQty}`}
                  </p>
                ) : contributionQty !== line.totalQty ? (
                  <p className={cn('text-[11px]', hintClassName)}>
                    RAB total {line.totalQty} {line.uomSymbol}
                  </p>
                ) : null}
                {alsoIn.length > 0 ? (
                  <p className={cn('text-[11px]', hintClassName)}>
                    Also in {alsoIn.map((s) => SECTION_LABELS[s]).join(', ')}
                  </p>
                ) : null}
                {line.origin === 'append' && line.addedBy && line.addedAt ? (
                  <p className={cn('text-[11px]', hintClassName)}>
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
                    {dirty ? (
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

              <p className="text-sm font-medium tabular-nums sm:text-right">
                {formatRupiahAmount(amount)}
                {hasPrice ? (
                  <span
                    className={cn('mt-0.5 block text-[11px] font-normal', hintClassName)}
                  >
                    {contributionQty} × {formatRupiahDigits(draftDigits)}
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
  )
}
