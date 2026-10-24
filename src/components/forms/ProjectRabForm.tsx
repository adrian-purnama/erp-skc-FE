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
  Download,
  LoaderCircle,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  changeKindBadgeClass,
  changeKindLabel,
  formatCostingWhen,
} from '#/components/forms/costingStatus'
import ProjectCostingStatusStrip from '#/components/forms/ProjectCostingStatusStrip'
import ProjectRabChangeHistory from '#/components/forms/ProjectRabChangeHistory'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiDownload, apiFetch } from '#/lib/api'
import type {
  ProjectRab,
  ProjectRabChangeDraftRef,
  ProjectRabChangeSummary,
  ProjectRabElaboration,
  ProjectRabElaborationDoc,
  ProjectRabLabourItem,
  ProjectRabLine,
  ProjectRabLineChangeKind,
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

/** Digits only (integer rupiah). */
function rupiahDigits(raw: string): string {
  return raw.replace(/\D/g, '')
}

function formatRupiahDigits(digits: string): string {
  if (!digits) return ''
  const n = Number(digits)
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('id-ID').format(n)
}

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

function elaborationLineKey(materialItemId: string, itemUomId: string): string {
  return `${materialItemId}:${itemUomId}`
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
  const [elaborationQuery, setElaborationQuery] = useState('')
  const [exportBusy, setExportBusy] = useState(false)

  const loadAll = useCallback(async (pid: string) => {
    setLoading(true)
    try {
      const [rabRes, elabRes, labourRes] = await Promise.all([
        apiFetch<ProjectRab | null>(`/project/${pid}/rab`),
        apiFetch<ProjectRabElaboration>(`/project/${pid}/rab/elaboration`),
        apiFetch<ProjectRabLabourItem[]>(`/project/${pid}/rab/labour-items`),
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
    } catch {
      toast.error('Unable to reach the server')
      setRab(null)
      setElaboration(null)
      setLabourItems([])
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
    // One section per change: who / when / because once, items listed under it.
    if (rab?.status !== 'locked') return []
    type Group = {
      key: string
      whenIso: string | null
      byName: string | null
      because: string
      lines: ProjectRabLine[]
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
        group = { key, whenIso, byName, because, lines: [] }
        map.set(key, group)
      }
      group.lines.push(line)
    }
    return [...map.values()].sort((a, b) => {
      const ta = a.whenIso ? new Date(a.whenIso).getTime() : 0
      const tb = b.whenIso ? new Date(b.whenIso).getTime() : 0
      return tb - ta
    })
  }, [lines, rab?.status, lineKindByKey, changeDraft])

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
                    className="h-8"
                    disabled={busy}
                    onClick={() => {
                      setChangeReason('')
                      setChangeOpen(true)
                    }}
                  >
                    Open change
                  </Button>
                ) : null}
                {canManage && changeDraft ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={() => void discardChange()}
                    >
                      Discard
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={busy}
                      onClick={() => void commitChange()}
                    >
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
              <section className="space-y-3">
                <h2 className="text-sm font-medium">Materials</h2>
                {materialLines.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>
                    {reviewChangesOnly
                      ? 'No material lines changed in this draft.'
                      : 'No materials yet. Fill Shop Drawing BOQ first.'}
                  </p>
                ) : (
                  <RabLineList
                    lines={materialLines}
                    lineKindByKey={lineKindByKey}
                    priceDrafts={priceDrafts}
                    setPriceDrafts={setPriceDrafts}
                    canManage={canManage}
                    busy={busy}
                    onSavePrice={saveUnitPrice}
                    onFillTarif={fillTarif}
                  />
                )}
              </section>

              <section className="space-y-3 border-t border-(--line) pt-4">
                <h2 className="text-sm font-medium">Labour</h2>
                {canManage && canEdit ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_5rem_8rem_auto] sm:items-end">
                    <div className="space-y-1">
                      <p className={cn('text-xs', hintClassName)}>Item</p>
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
                    <div className="space-y-1">
                      <p className={cn('text-xs', hintClassName)}>Qty</p>
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
                      <p className={cn('text-xs', hintClassName)}>Unit price</p>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-xs', hintClassName)}>Rp</span>
                        <Input
                          value={formatRupiahDigits(labourPriceDigits)}
                          onChange={(e) =>
                            setLabourPriceDigits(rupiahDigits(e.target.value))
                          }
                          disabled={busy}
                          inputMode="numeric"
                          placeholder="0"
                          className="h-9 min-w-0 flex-1 tabular-nums"
                          aria-label="Labour unit price"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className={cn(buttonClassName, 'h-9')}
                      disabled={busy || !labourItemId || !labourUomId}
                      onClick={() => void addLabourLine()}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Add
                    </Button>
                  </div>
                ) : null}
                {labourLines.length === 0 ? (
                  <p className={cn('text-sm', hintClassName)}>
                    {reviewChangesOnly
                      ? 'No labour lines changed in this draft.'
                      : canManage && canEdit
                        ? 'No labour lines yet. Add a labour item above.'
                        : 'No labour lines.'}
                  </p>
                ) : (
                  <RabLineList
                    lines={labourLines}
                    lineKindByKey={NO_LINE_KINDS}
                    priceDrafts={priceDrafts}
                    setPriceDrafts={setPriceDrafts}
                    canManage={canManage}
                    busy={busy}
                    onSavePrice={saveUnitPrice}
                    onFillTarif={fillTarif}
                    onRemove={
                      canManage && canEdit ? removeLabourLine : undefined
                    }
                  />
                )}
              </section>

              {addedAfterLockGroups.length > 0 ? (
                <section className="space-y-4 border-t border-(--line) pt-4">
                  <h2 className="text-sm font-medium">Added after lock</h2>
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
                    Materials by shop drawing, with qty and RAB estimate.
                    Labour is listed below.
                    {reviewChangesOnly
                      ? ' Showing only materials changed in this draft.'
                      : ''}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <ListSearchInput
                      value={elaborationQuery}
                      onChange={setElaborationQuery}
                      placeholder="Find material…"
                      aria-label="Find material in elaboration"
                      className="max-w-sm flex-1"
                    />
                    {elaborationQuery.trim() ? (
                      <p
                        className={cn('text-xs tabular-nums', hintClassName)}
                        aria-live="polite"
                      >
                        Search highlights where an item is used
                      </p>
                    ) : (
                      <p className={cn('text-xs', hintClassName)}>
                        Search highlights where a material is used
                      </p>
                    )}
                  </div>
                  {(elaboration?.documents ?? []).map((doc) => (
                    <RabElaborationDoc
                      key={`${doc.shopDrawingFileId}-${doc.fileVersion}-${doc.originalFilename}`}
                      doc={doc}
                      estimateLines={lines.filter((l) => l.origin !== 'labour')}
                      addedInChange={addedBoqNames.includes(
                        doc.shopDrawingItemName,
                      )}
                      reviewChangesOnly={reviewChangesOnly}
                      elaborationProvenanceByFile={elaborationProvenanceByFile}
                      changeDraft={changeDraft}
                      query={elaborationQuery}
                    />
                  ))}
                  {labourLines.length > 0 ? (
                    <RabElaborationLabour
                      lines={labourLines}
                      lineKindByKey={lineKindByKey}
                      changeProvenanceByKey={changeProvenanceByKey}
                      query={elaborationQuery}
                    />
                  ) : null}
                  {elaborationQuery.trim() || reviewChangesOnly ? (
                    <ElaborationEmptyHint
                      documents={elaboration?.documents ?? []}
                      labourLines={labourLines}
                      addedBoqNames={addedBoqNames}
                      reviewChangesOnly={reviewChangesOnly}
                      elaborationProvenanceByFile={elaborationProvenanceByFile}
                      query={elaborationQuery}
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

function RabElaborationLabour({
  lines,
  lineKindByKey,
  changeProvenanceByKey,
  query,
}: {
  lines: ProjectRabLine[]
  lineKindByKey: Map<string, ProjectRabLineChangeKind>
  changeProvenanceByKey: Map<string, ChangeProvenance>
  query: string
}) {
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-(--line) bg-(--surface) text-[11px] tracking-wide text-(--muted)">
              <th className="px-3 py-2 font-medium">Labour</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Unit price</th>
              <th className="px-3 py-2 text-right font-medium">Est. amount</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((line) => {
              const amount =
                line.lineTotal ?? estimateAmount(line.totalQty, line.unitPrice)
              const kind = lineKindByKey.get(line.key)
              const provenance = changeProvenanceByKey.get(line.key)
              const matched = q.length > 0 && labourRowMatches(line, q)
              return (
                <tr
                  key={line.key}
                  className={cn(
                    'border-b border-(--line) last:border-b-0',
                    kind === 'added' && 'bg-emerald-50/80',
                    kind === 'changed' && 'bg-amber-50/80',
                    kind === 'removed' && 'bg-red-50/60',
                    matched && !kind && 'bg-[#fff6d6]',
                  )}
                >
                  <td className="min-w-40 px-3 py-2.5 align-top">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
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
                    {line.materialCode ? (
                      <p className={cn('font-mono text-[11px]', hintClassName)}>
                        {highlightText(line.materialCode, q)}
                      </p>
                    ) : null}
                    {provenance ? (
                      <ChangeProvenanceNote provenance={provenance} />
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {line.totalQty}{' '}
                    <span className="text-(--muted)">
                      {highlightText(line.uomSymbol, q)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-(--muted)">
                    {formatRupiahAmount(line.unitPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums">
                    {formatRupiahAmount(amount)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {any ? (
            <tfoot>
              <tr className="border-t border-(--line) bg-(--surface)">
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-right text-xs text-(--muted)"
                >
                  Labour estimate
                </td>
                <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">
                  {formatRupiahAmount(String(sum))}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
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
  },
): number {
  const q = opts.query.trim()
  const docNameHit =
    q.length > 0 &&
    (textMatches(doc.shopDrawingItemName, q) ||
      textMatches(doc.originalFilename, q))
  let count = 0
  for (const block of doc.blocks) {
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
}: {
  documents: ProjectRabElaborationDoc[]
  labourLines: ProjectRabLine[]
  addedBoqNames: string[]
  reviewChangesOnly: boolean
  elaborationProvenanceByFile: Map<string, ChangeProvenance>
  query: string
}) {
  const q = query.trim()
  const docHits = documents.reduce(
    (sum, doc) =>
      sum +
      countVisibleElaborationRows(doc, {
        addedInChange: addedBoqNames.includes(doc.shopDrawingItemName),
        reviewChangesOnly,
        elaborationProvenanceByFile,
        query: q,
      }),
    0,
  )
  const labourHits = labourLines.filter((line) =>
    labourRowMatches(line, q),
  ).length
  if (docHits > 0 || labourHits > 0) return null
  return (
    <p className={cn('text-sm', hintClassName)}>
      {q
        ? `No materials match “${q}”.`
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
}: {
  doc: ProjectRabElaborationDoc
  estimateLines: ProjectRabLine[]
  addedInChange?: boolean
  reviewChangesOnly: boolean
  elaborationProvenanceByFile: Map<string, ChangeProvenance>
  changeDraft: ProjectRabChangeDraftRef | null
  query: string
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
      line,
    })),
  )

  const rows = allRows.filter((row) => {
    if (reviewChangesOnly && !addedInChange) {
      if (!elaborationProvenanceByFile.has(row.scopeKey)) return false
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-(--line) bg-(--surface) text-[11px] tracking-wide text-(--muted)">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Material</th>
                <th className="px-3 py-2 text-right font-medium">Per unit</th>
                <th className="px-3 py-2 text-right font-medium">× Units</th>
                <th className="px-3 py-2 text-right font-medium">= Total</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">
                  Est. amount
                </th>
              </tr>
            </thead>
            <tbody>
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
                  <tr
                    key={key}
                    className={cn(
                      'border-b border-(--line) last:border-b-0',
                      kind === 'added' && 'bg-emerald-50/80',
                      kind === 'changed' && 'bg-amber-50/80',
                      kind === 'removed' && 'bg-red-50/60',
                      matched && !kind && 'bg-[#fff6d6]',
                    )}
                    data-find-hit={matched || undefined}
                  >
                    <td className="max-w-[10rem] px-3 py-2.5 align-top text-xs text-(--muted)">
                      {highlightText(source, q)}
                    </td>
                    <td className="min-w-[10rem] px-3 py-2.5 align-top">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
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
                      {line.materialCode ? (
                        <p
                          className={cn('font-mono text-[11px]', hintClassName)}
                        >
                          {highlightText(line.materialCode, q)}
                        </p>
                      ) : null}
                      {provenance ? (
                        <ChangeProvenanceNote provenance={provenance} />
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      {line.qtyPerUnit}{' '}
                      <span className="text-(--muted)">
                        {highlightText(line.uomSymbol, q)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-(--muted)">
                      × {line.makeQty}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums">
                      {line.totalQty}{' '}
                      <span className="font-normal text-(--muted)">
                        {highlightText(line.uomSymbol, q)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-(--muted)">
                      {formatRupiahAmount(est?.unitPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-medium tabular-nums">
                      {amount === null ? '—' : formatRupiahAmount(amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {docEstimateAny ? (
              <tfoot>
                <tr className="border-t border-(--line) bg-(--surface)">
                  <td
                    colSpan={6}
                    className="px-3 py-2.5 text-right text-xs text-(--muted)"
                  >
                    Document estimate (priced lines)
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-medium tabular-nums">
                    {formatRupiahAmount(String(docEstimateSum))}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </section>
  )
}

function RabLineList({
  lines,
  lineKindByKey,
  priceDrafts,
  setPriceDrafts,
  canManage,
  busy,
  onSavePrice,
  onFillTarif,
  onRemove,
}: {
  lines: ProjectRabLine[]
  lineKindByKey: Map<string, ProjectRabLineChangeKind>
  priceDrafts: Record<string, string>
  setPriceDrafts: Dispatch<SetStateAction<Record<string, string>>>
  canManage: boolean
  busy: boolean
  onSavePrice: (lineKey: string) => Promise<void>
  onFillTarif: (lineKey: string) => Promise<void>
  onRemove?: (lineKey: string) => Promise<void>
}) {
  return (
    <ul className="space-y-0">
      {lines.map((line) => {
        const savedDigits = plainFromSaved(line.unitPrice)
        const draftDigits =
          priceDrafts[line.key] !== undefined
            ? rupiahDigits(priceDrafts[line.key]!)
            : savedDigits
        const draftDisplay = formatRupiahDigits(draftDigits)
        const dirty =
          priceDrafts[line.key] !== undefined && draftDigits !== savedDigits
        const editable = canManage && line.priceEditable
        const hasPrice = draftDigits !== ''
        const showTarif = editable && line.hasTarif && !hasPrice
        const kind = lineKindByKey.get(line.key)
        return (
          <li
            key={line.key}
            className={cn(
              'border-b border-(--line) py-2.5 last:border-b-0',
              kind === 'added' && 'bg-emerald-50/80',
              kind === 'changed' && 'bg-amber-50/80',
              kind === 'removed' && 'bg-red-50/60',
            )}
          >
            <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_10.5rem_minmax(11rem,auto)_auto] sm:gap-x-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                  <span
                    className={cn(
                      kind === 'removed' && 'line-through opacity-80',
                    )}
                  >
                    {line.materialName}
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
                <p
                  className={cn(
                    'truncate font-mono text-[11px]',
                    hintClassName,
                  )}
                >
                  {line.materialCode}
                  {line.origin === 'append' && line.addedBy && line.addedAt
                    ? ` · added ${line.addedBy.name} ${formatWhen(line.addedAt)}`
                    : ''}
                  {line.addReason?.trim() ? ` · ${line.addReason.trim()}` : ''}
                  {line.origin === 'labour' ? ' · labour' : ''}
                </p>
              </div>

              <p className="text-sm tabular-nums text-(--muted) sm:text-right">
                {line.totalQty} {line.uomSymbol}
              </p>

              <div className="flex items-center gap-1.5">
                {editable ? (
                  <>
                    <span className={cn('text-xs', hintClassName)}>Rp</span>
                    <Input
                      value={draftDisplay}
                      onChange={(e) =>
                        setPriceDrafts((prev) => ({
                          ...prev,
                          [line.key]: rupiahDigits(e.target.value),
                        }))
                      }
                      disabled={busy}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-8 min-w-0 flex-1 tabular-nums"
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

              <p className="text-sm tabular-nums text-(--muted) sm:text-right">
                {line.totalQty} ×{' '}
                {hasPrice ? formatRupiahDigits(draftDigits) : '—'}
                {line.lineTotal ? (
                  <span className="ml-2 font-medium text-(--ink)">
                    {formatRupiahAmount(line.lineTotal)}
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
                <span />
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
