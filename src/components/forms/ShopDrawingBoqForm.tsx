import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Info,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { changeKindBadgeClass } from '#/components/forms/costingStatus'
import ProjectCostingStatusStrip from '#/components/forms/ProjectCostingStatusStrip'
import TenderProjectPicker from '#/components/forms/TenderProjectPicker'
import ShopDrawingBoqLinesEditor, {
  emptyLine,
  isLineComplete,
  newLineKey,
  type DraftLine,
} from '#/components/forms/ShopDrawingBoqLinesEditor'
import ShopDrawingBoqSandwichPreview from '#/components/forms/ShopDrawingBoqSandwichPreview'
import ShopDrawingBoqStackViewer from '#/components/forms/ShopDrawingBoqStackViewer'
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
import { Checkbox } from '#/components/ui/checkbox'
import { Combobox } from '#/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { apiFetch, apiUpload } from '#/lib/api'
import type {
  ProjectRab,
  ProjectShopDrawingBoq,
  ProjectShopDrawingBoqFinishing,
  ProjectShopDrawingBoqFinishPlacement,
  ProjectShopDrawingBoqItemSummary,
  ProjectShopDrawingBoqLine,
  ProjectShopDrawingBoqMaterial,
  ProjectShopDrawingBoqMountingType,
  ProjectShopDrawingFile,
  ProjectShopDrawingItem,
} from '#/lib/project'
import {
  buttonOutlineClassName,
  hintClassName,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  itemId?: string
  fileId?: string
  onProjectIdChange: (projectId: string | undefined) => void
  onSelectionChange: (next: {
    itemId: string | undefined
    fileId: string | undefined
  }) => void
}

type DraftFinishing = {
  key: string
  finishingOrder: number
  placement: ProjectShopDrawingBoqFinishPlacement
  lines: DraftLine[]
}

type DraftBase = {
  key: string
  line: DraftLine
  finishings: DraftFinishing[]
}

type DraftPart = {
  key: string
  label: string
  bases: DraftBase[]
}

const MOUNTING_TYPES: {
  value: ProjectShopDrawingBoqMountingType
  label: string
}[] = [
  { value: 'mounted', label: 'Mounted' },
  { value: 'hanging', label: 'Hanging' },
  { value: 'pylon', label: 'Pylon' },
  { value: 'blade', label: 'Blade' },
  { value: 'freestanding', label: 'Freestanding' },
  { value: 'other', label: 'Other' },
]

function apiLineToDraft(line: ProjectShopDrawingBoqLine & { spec?: string }): DraftLine {
  return {
    key: newLineKey(),
    materialItemId: line.materialItemId,
    itemUomId: line.itemUomId,
    formula: line.formula || 'v1',
    inputs: line.inputs?.v1
      ? {
          v1: line.inputs.v1,
          ...(line.inputs.v2 !== undefined ? { v2: line.inputs.v2 } : {}),
          ...(line.inputs.v3 !== undefined ? { v3: line.inputs.v3 } : {}),
        }
      : { v1: line.qtyPerUnit },
    ...(line.spec ? { spec: line.spec } : {}),
  }
}

function draftLineToApi(line: DraftLine) {
  return {
    materialItemId: line.materialItemId,
    itemUomId: line.itemUomId,
    formula: line.formula,
    inputs: line.inputs,
    ...(line.spec?.trim() ? { spec: line.spec.trim() } : {}),
  }
}

/** One material per finishing; split legacy multi-line layers into stacked finishings. */
function draftFinishingsFromApi(
  finishings: ProjectShopDrawingBoqFinishing[],
): DraftFinishing[] {
  const result: DraftFinishing[] = []
  for (const placement of ['top', 'bottom'] as const) {
    const group = [...(finishings ?? [])]
      .filter((f) => f.placement === placement)
      .sort((a, b) => a.finishingOrder - b.finishingOrder)
    let order = 0
    for (const f of group) {
      const lines =
        f.lines.length > 0 ? f.lines.map(apiLineToDraft) : [emptyLine()]
      for (const line of lines) {
        order += 1
        result.push({
          key: newLineKey(),
          finishingOrder: order,
          placement,
          lines: [line],
        })
      }
    }
  }
  return result
}

function emptyBase(): DraftBase {
  return {
    key: newLineKey(),
    line: emptyLine(),
    finishings: [],
  }
}

function emptyPart(): DraftPart {
  return {
    key: newLineKey(),
    label: '',
    bases: [emptyBase()],
  }
}

function emptyBoqState() {
  return {
    parts: [] as DraftPart[],
    assemblyLines: [] as DraftLine[],
    lightingLines: [] as DraftLine[],
    mountingType: 'mounted' as ProjectShopDrawingBoqMountingType,
    mountingLines: [] as DraftLine[],
    otherLines: [] as DraftLine[],
  }
}

export default function ShopDrawingBoqForm({
  projectId,
  itemId: itemIdProp,
  fileId: fileIdProp,
  onProjectIdChange,
  onSelectionChange,
}: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')

  const [summary, setSummary] = useState<ProjectShopDrawingBoqItemSummary[]>([])
  const [overview, setOverview] = useState<ProjectShopDrawingBoq[]>([])
  const [materials, setMaterials] = useState<ProjectShopDrawingBoqMaterial[]>([])
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [loadingBoq, setLoadingBoq] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [itemId, setItemId] = useState(itemIdProp ?? '')
  const [fileId, setFileId] = useState(fileIdProp ?? '')
  const [boqId, setBoqId] = useState<string | null>(null)
  const [makeQty, setMakeQty] = useState('1')
  const [section, setSection] = useState('main')
  const [contentFrozen, setContentFrozen] = useState(false)
  const [rab, setRab] = useState<ProjectRab | null>(null)

  const [parts, setParts] = useState<DraftPart[]>([])
  const [activeBaseKey, setActiveBaseKey] = useState<string | null>(null)
  const [assemblyLines, setAssemblyLines] = useState<DraftLine[]>([])
  const [lightingLines, setLightingLines] = useState<DraftLine[]>([])
  const [mountingType, setMountingType] =
    useState<ProjectShopDrawingBoqMountingType>('mounted')
  const [mountingLines, setMountingLines] = useState<DraftLine[]>([])
  const [otherLines, setOtherLines] = useState<DraftLine[]>([])

  const [addItemOpen, setAddItemOpen] = useState(false)
  const [itemNameDraft, setItemNameDraft] = useState('')
  const [itemNameBusy, setItemNameBusy] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [forceDifferent, setForceDifferent] = useState(false)
  const [showHashInfo, setShowHashInfo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  function resetBoqDraft() {
    const empty = emptyBoqState()
    setBoqId(null)
    setMakeQty('1')
    setContentFrozen(false)
    setParts(empty.parts)
    setActiveBaseKey(null)
    setAssemblyLines(empty.assemblyLines)
    setLightingLines(empty.lightingLines)
    setMountingType(empty.mountingType)
    setMountingLines(empty.mountingLines)
    setOtherLines(empty.otherLines)
  }


  const flatBases = useMemo(() => {
    const list: { partKey: string; base: DraftBase }[] = []
    for (const part of parts) {
      for (const base of part.bases) {
        list.push({ partKey: part.key, base })
      }
    }
    return list
  }, [parts])

  useEffect(() => {
    if (flatBases.length === 0) {
      setActiveBaseKey(null)
      return
    }
    setActiveBaseKey((prev) =>
      prev && flatBases.some((b) => b.base.key === prev)
        ? prev
        : flatBases[0]!.base.key,
    )
  }, [flatBases])

  useEffect(() => {
    setSummary([])
    setMaterials([])
    resetBoqDraft()
    setItemId(itemIdProp ?? '')
    setFileId(fileIdProp ?? '')
    setAddItemOpen(false)
    setUploadOpen(false)
    setPendingFile(null)
  }, [projectId])

  useEffect(() => {
    if (itemIdProp && itemIdProp !== itemId) setItemId(itemIdProp)
  }, [itemIdProp])

  useEffect(() => {
    if (fileIdProp && fileIdProp !== fileId) setFileId(fileIdProp)
  }, [fileIdProp])

  const reloadSummary = useCallback(async () => {
    if (!projectId) return [] as ProjectShopDrawingBoqItemSummary[]
    const summaryRes = await apiFetch<ProjectShopDrawingBoqItemSummary[]>(
      `/project/${projectId}/shop-drawing/boq/summary`,
    )
    if (!summaryRes.success) {
      toast.error(summaryRes.message || 'Failed to load Shop Drawing items')
      setSummary([])
      return []
    }
    const next = summaryRes.data ?? []
    setSummary(next)
    return next
  }, [projectId])

  const reloadOverview = useCallback(async () => {
    if (!projectId) {
      setOverview([])
      return
    }
    const overviewRes = await apiFetch<ProjectShopDrawingBoq[]>(
      `/project/${projectId}/shop-drawing/boq/overview`,
    )
    if (!overviewRes.success) {
      toast.error(overviewRes.message || 'Failed to load BOQ overview')
      setOverview([])
      return
    }
    setOverview(overviewRes.data ?? [])
  }, [projectId])

  const reloadRab = useCallback(async () => {
    if (!projectId) {
      setRab(null)
      return
    }
    try {
      const rabRes = await apiFetch<ProjectRab | null>(
        `/project/${projectId}/rab`,
      )
      if (rabRes.success) setRab(rabRes.data ?? null)
      else setRab(null)
    } catch {
      setRab(null)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      setSummary([])
      setOverview([])
      setMaterials([])
      setRab(null)
      return
    }
    let cancelled = false
    async function load() {
      setLoadingSummary(true)
      try {
        const [summaryRes, materialsRes, overviewRes, rabRes] =
          await Promise.all([
            apiFetch<ProjectShopDrawingBoqItemSummary[]>(
              `/project/${projectId}/shop-drawing/boq/summary`,
            ),
            apiFetch<ProjectShopDrawingBoqMaterial[]>(
              `/project/${projectId}/shop-drawing/boq/materials`,
            ),
            apiFetch<ProjectShopDrawingBoq[]>(
              `/project/${projectId}/shop-drawing/boq/overview`,
            ),
            apiFetch<ProjectRab | null>(`/project/${projectId}/rab`),
          ])
        if (cancelled) return
        if (!summaryRes.success) {
          toast.error(summaryRes.message || 'Failed to load Shop Drawing items')
          setSummary([])
        } else {
          setSummary(summaryRes.data ?? [])
        }
        if (!materialsRes.success) {
          toast.error(materialsRes.message || 'Failed to load materials')
          setMaterials([])
        } else {
          setMaterials(materialsRes.data ?? [])
        }
        if (!overviewRes.success) {
          toast.error(overviewRes.message || 'Failed to load BOQ overview')
          setOverview([])
        } else {
          setOverview(overviewRes.data ?? [])
        }
        if (rabRes.success) setRab(rabRes.data ?? null)
        else setRab(null)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoadingSummary(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const selectedItem = useMemo(
    () => summary.find((i) => i.itemId === itemId) ?? null,
    [summary, itemId],
  )
  const versions = selectedItem?.versions ?? []
  const selectedVersion = versions.find((v) => v.fileId === fileId) ?? null

  useEffect(() => {
    if (!summary.length) return

    let nextItem = itemId
    if (nextItem && !summary.some((i) => i.itemId === nextItem)) {
      nextItem =
        itemIdProp && summary.some((i) => i.itemId === itemIdProp)
          ? itemIdProp
          : ''
      if (nextItem !== itemId) setItemId(nextItem)
    }

    if (!nextItem) {
      if (itemIdProp || fileIdProp) {
        onSelectionChangeRef.current({
          itemId: undefined,
          fileId: undefined,
        })
      }
      return
    }

    const itemVersions =
      summary.find((i) => i.itemId === nextItem)?.versions ?? []
    let nextFile = fileId
    if (!itemVersions.some((v) => v.fileId === nextFile)) {
      const current = itemVersions.find((v) => v.isCurrent)
      nextFile = current?.fileId ?? itemVersions[0]?.fileId ?? ''
      if (nextFile !== fileId) setFileId(nextFile)
    }

    if (nextItem !== (itemIdProp ?? '') || nextFile !== (fileIdProp ?? '')) {
      onSelectionChangeRef.current({
        itemId: nextItem || undefined,
        fileId: nextFile || undefined,
      })
    }
  }, [summary, itemId, fileId, itemIdProp, fileIdProp])

  useEffect(() => {
    if (!projectId || !itemId || !fileId) {
      resetBoqDraft()
      return
    }
    let cancelled = false
    async function loadBoq() {
      setLoadingBoq(true)
      try {
        const response = await apiFetch<ProjectShopDrawingBoq | null>(
          `/project/${projectId}/shop-drawing/boq?itemId=${encodeURIComponent(itemId)}&fileId=${encodeURIComponent(fileId)}`,
        )
        if (cancelled) return
        if (!response.success) {
          toast.error(response.message || 'Failed to load BOQ')
          return
        }
        const data = response.data
        if (!data) {
          resetBoqDraft()
          try {
            const rabRes = await apiFetch<ProjectRab | null>(
              `/project/${projectId}/rab`,
            )
            if (!cancelled && rabRes.success) {
              setRab(rabRes.data ?? null)
              if (
                rabRes.data?.status === 'locked' &&
                !rabRes.data.changeDraft
              ) {
                setContentFrozen(true)
              }
            }
          } catch {
            /* ignore */
          }
          return
        }
        setBoqId(data.id)
        setMakeQty(data.makeQty)
        setContentFrozen(Boolean(data.contentFrozen))
        setParts(
          (data.main?.parts ?? []).map((part) => ({
            key: part.key,
            label: part.label ?? '',
            bases:
              (part.bases ?? []).length > 0
                ? part.bases.map((base) => ({
                    key: base.key,
                    line: apiLineToDraft(base),
                    finishings: draftFinishingsFromApi(base.finishings ?? []),
                  }))
                : [emptyBase()],
          })),
        )
        setAssemblyLines(
          (data.main?.assembly?.lines ?? []).map(apiLineToDraft),
        )
        setLightingLines((data.lighting?.lines ?? []).map(apiLineToDraft))
        setMountingType(data.mounting?.type ?? 'mounted')
        setMountingLines((data.mounting?.lines ?? []).map(apiLineToDraft))
        setOtherLines((data.other?.lines ?? []).map(apiLineToDraft))
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoadingBoq(false)
      }
    }
    void loadBoq()
    return () => {
      cancelled = true
    }
  }, [projectId, itemId, fileId])

  const addedFileIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of rab?.changeDiff?.boqDiff ?? []) {
      if (b.kind === 'added') set.add(b.shopDrawingFileId)
    }
    return set
  }, [rab?.changeDiff])

  const addedItemIds = useMemo(() => {
    const set = new Set<string>()
    for (const b of rab?.changeDiff?.boqDiff ?? []) {
      if (b.kind === 'added') set.add(b.shopDrawingItemId)
    }
    return set
  }, [rab?.changeDiff])

  const itemOptions = summary.map((i) => ({
    value: i.itemId,
    label: addedItemIds.has(i.itemId) ? `${i.name} · Added` : i.name,
  }))

  const versionOptions = versions.map((v) => ({
    value: v.fileId,
    label: `v${v.version}${v.isCurrent ? ' · current' : ''}${v.hasBoq ? ' · BOQ' : ''}${addedFileIds.has(v.fileId) ? ' · Added' : ''} · ${v.originalFilename}`,
  }))

  const selectedAddedInChange = Boolean(fileId && addedFileIds.has(fileId))

  function selectItem(next: string) {
    setItemId(next)
    setFileId('')
    onSelectionChange({
      itemId: next || undefined,
      fileId: undefined,
    })
  }

  function selectFile(next: string) {
    setFileId(next)
    onSelectionChange({
      itemId: itemId || undefined,
      fileId: next || undefined,
    })
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  function openAddItem() {
    setItemNameDraft('')
    setAddItemOpen(true)
  }

  function openUpload() {
    if (!itemId) return
    setPendingFile(null)
    setForceDifferent(false)
    setShowHashInfo(false)
    setUploadOpen(true)
  }

  async function confirmAddItem() {
    if (!canManage || !projectId) return
    const name = itemNameDraft.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    setItemNameBusy(true)
    try {
      const response = await apiFetch<ProjectShopDrawingItem>(
        `/project/${projectId}/shop-drawing/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to create item')
        return
      }
      toast.success('Item created')
      setAddItemOpen(false)
      await reloadSummary()
      selectItem(response.data.id)
      setPendingFile(null)
      setForceDifferent(false)
      setShowHashInfo(false)
      setUploadOpen(true)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setItemNameBusy(false)
    }
  }

  async function confirmUpload() {
    if (!canManage || !projectId || !itemId || !pendingFile) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const qs = forceDifferent ? '?force=true' : ''
      const response = await apiUpload<ProjectShopDrawingFile>(
        `/project/${projectId}/shop-drawing/items/${itemId}/files${qs}`,
        form,
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Upload failed')
        return
      }
      toast.success(
        response.data.linked ? 'Linked to existing file' : 'File uploaded',
      )
      setUploadOpen(false)
      setPendingFile(null)
      setForceDifferent(false)
      await Promise.all([reloadSummary(), reloadOverview()])
      selectFile(response.data.id)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setUploading(false)
    }
  }

  function validateBeforeSave(): string | null {
    let baseIndex = 0
    for (const part of parts) {
      for (const base of part.bases) {
        baseIndex += 1
        if (!isLineComplete(base.line)) {
          return `Base ${baseIndex} needs a complete core material`
        }
        for (const finishing of base.finishings) {
          const line = finishing.lines[0]
          if (!line || !isLineComplete(line)) {
            return `Base ${baseIndex}: finishing on ${finishing.placement} needs a complete material`
          }
        }
      }
    }
    return null
  }

  async function onSave() {
    if (!canManage || !projectId || !itemId || !fileId) return
    const error = validateBeforeSave()
    if (error) {
      toast.error(error)
      return
    }
    if (contentFrozen) {
      toast.error('RAB is locked — open a change on RAB, then edit BOQ')
      return
    }
    setSaving(true)
    try {
      const response = await apiFetch<ProjectShopDrawingBoq>(
        `/project/${projectId}/shop-drawing/boq`,
        {
          method: 'PUT',
          body: JSON.stringify({
            shopDrawingItemId: itemId,
            shopDrawingFileId: fileId,
            makeQty,
            main: {
              parts: parts.map((part) => ({
                key: part.key,
                ...(part.label.trim() ? { label: part.label.trim() } : {}),
                bases: part.bases
                  .filter((b) => isLineComplete(b.line))
                  .map((base) => ({
                    key: base.key,
                    ...draftLineToApi(base.line),
                    finishings: base.finishings.map((f) => ({
                      finishingOrder: f.finishingOrder,
                      placement: f.placement,
                      lines: f.lines.filter(isLineComplete).map(draftLineToApi),
                    })),
                  })),
              })),
              assembly: {
                lines: assemblyLines
                  .filter(isLineComplete)
                  .map(draftLineToApi),
              },
            },
            lighting: {
              lines: lightingLines.filter(isLineComplete).map(draftLineToApi),
            },
            mounting: {
              type: mountingType,
              lines: mountingLines.filter(isLineComplete).map(draftLineToApi),
            },
            other: {
              lines: otherLines.filter(isLineComplete).map(draftLineToApi),
            },
          }),
        },
      )
      if (!response.success || !response.data) {
        toast.error(response.message || 'Failed to save BOQ')
        return
      }
      toast.success(
        rab?.changeDraft
          ? 'BOQ saved to change draft — open RAB to price / commit when ready'
          : 'BOQ saved',
      )
      setBoqId(response.data.id)
      setContentFrozen(Boolean(response.data.contentFrozen))
      void reloadRab()
      setParts(
        (response.data.main?.parts ?? []).map((part) => ({
          key: part.key,
          label: part.label ?? '',
          bases:
            (part.bases ?? []).length > 0
              ? part.bases.map((base) => ({
                  key: base.key,
                  line: apiLineToDraft(base),
                  finishings: draftFinishingsFromApi(base.finishings ?? []),
                }))
              : [emptyBase()],
        })),
      )
      setAssemblyLines(
        (response.data.main?.assembly?.lines ?? []).map(apiLineToDraft),
      )
      setLightingLines(
        (response.data.lighting?.lines ?? []).map(apiLineToDraft),
      )
      setMountingType(response.data.mounting?.type ?? 'mounted')
      setMountingLines(
        (response.data.mounting?.lines ?? []).map(apiLineToDraft),
      )
      setOtherLines((response.data.other?.lines ?? []).map(apiLineToDraft))
      await Promise.all([reloadSummary(), reloadOverview()])
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!canManage || !projectId || !boqId) return
    setDeleting(true)
    try {
      const response = await apiFetch(
        `/project/${projectId}/shop-drawing/boq/${boqId}`,
        { method: 'DELETE' },
      )
      if (!response.success) {
        toast.error(response.message || 'Failed to delete BOQ')
        return
      }
      toast.success('BOQ deleted')
      setDeleteOpen(false)
      resetBoqDraft()
      await Promise.all([reloadSummary(), reloadOverview()])
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeleting(false)
    }
  }

  function updateBase(
    partKey: string,
    baseKey: string,
    patch: Partial<DraftBase>,
  ) {
    setParts((prev) =>
      prev.map((p) =>
        p.key === partKey
          ? {
              ...p,
              bases: p.bases.map((b) =>
                b.key === baseKey ? { ...b, ...patch } : b,
              ),
            }
          : p,
      ),
    )
  }

  function addFinishing(
    partKey: string,
    baseKey: string,
    placement: ProjectShopDrawingBoqFinishPlacement,
  ) {
    setParts((prev) =>
      prev.map((p) => {
        if (p.key !== partKey) return p
        return {
          ...p,
          bases: p.bases.map((b) => {
            if (b.key !== baseKey) return b
            const nextOrder =
              b.finishings
                .filter((f) => f.placement === placement)
                .reduce((max, f) => Math.max(max, f.finishingOrder), 0) + 1
            return {
              ...b,
              finishings: [
                ...b.finishings,
                {
                  key: newLineKey(),
                  finishingOrder: nextOrder,
                  placement,
                  lines: [emptyLine()],
                },
              ],
            }
          }),
        }
      }),
    )
  }

  const activeBaseEntry =
    flatBases.find((b) => b.base.key === activeBaseKey) ?? null
  const activeSandwich = activeBaseEntry
    ? {
        partKey: activeBaseEntry.partKey,
        base: activeBaseEntry.base,
        topFinishings: [...activeBaseEntry.base.finishings]
          .filter((f) => f.placement === 'top')
          .sort((a, b) => b.finishingOrder - a.finishingOrder),
        bottomFinishings: [...activeBaseEntry.base.finishings]
          .filter((f) => f.placement === 'bottom')
          .sort((a, b) => a.finishingOrder - b.finishingOrder),
      }
    : null

  function addBase() {
    const next = emptyPart()
    const baseKey = next.bases[0]!.key
    setParts((prev) => [next, ...prev])
    setActiveBaseKey(baseKey)
  }

  function removeBase(partKey: string, baseKey: string) {
    setParts((prev) =>
      prev
        .map((p) =>
          p.key === partKey
            ? { ...p, bases: p.bases.filter((b) => b.key !== baseKey) }
            : p,
        )
        .filter((p) => p.bases.length > 0),
    )
  }

  function baseListLabel(base: DraftBase, index: number): string {
    const material = materials.find((m) => m.id === base.line.materialItemId)
    return material?.name?.trim() || `Core ${index + 1}`
  }

  function renderFinishingRow(
    partKey: string,
    base: DraftBase,
    finishing: DraftFinishing,
    zoneLabel: string,
    removeLabel: string,
  ) {
    return (
      <div
        key={finishing.key}
        className="space-y-1 rounded-sm border border-(--line)/80 bg-(--surface) p-2"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-(--muted)">{zoneLabel}</p>
          {canManage && !contentFrozen ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-1.5"
              disabled={loadingBoq}
              aria-label={removeLabel}
              onClick={() =>
                updateBase(partKey, base.key, {
                  finishings: base.finishings.filter(
                    (f) => f.key !== finishing.key,
                  ),
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
        <ShopDrawingBoqLinesEditor
          lines={finishing.lines}
          onChange={(lines) =>
            updateBase(partKey, base.key, {
              finishings: base.finishings.map((f) =>
                f.key === finishing.key ? { ...f, lines } : f,
              ),
            })
          }
          materials={materials}
          makeQty={makeQty}
          canManage={canManage && !contentFrozen}
          disabled={loadingBoq}
          allowEmpty={false}
          maxLines={1}
          compact
        />
      </div>
    )
  }

  const sheetTitle = selectedItem
    ? selectedVersion
      ? `${selectedItem.name} · v${selectedVersion.version} · ${selectedVersion.originalFilename}`
      : selectedItem.name
    : 'Select a Shop Drawing item and file version'

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className={pageTitleClassName}>
            Shop Drawing BOQ
          </h1>
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
        <div className="min-w-[16rem] flex-1 max-w-md">
          <TenderProjectPicker
            projectId={projectId ?? ''}
            onProjectIdChange={(next) => onProjectIdChange(next || undefined)}
            ariaLabel="Shop Drawing BOQ project"
          />
        </div>
      </div>

      {projectId ? (
        <ProjectCostingStatusStrip
          projectId={projectId}
          rab={rab}
          surface="boq"
        />
      ) : null}

      {!projectId ? (
        <p className={hintClassName}>
          Choose a project to edit Shop Drawing BOQs.
        </p>
      ) : loadingSummary ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading Shop Drawing items…
        </p>
      ) : summary.length === 0 ? (
        <div className="space-y-3">
          <p className={hintClassName}>
            No Shop Drawing items yet.
            {canManage
              ? ' Add an item, then upload a file to start a BOQ.'
              : ''}
          </p>
          {canManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={openAddItem}
            >
              <Plus className="size-3.5" aria-hidden />
              Add item
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid w-full min-w-0 overflow-hidden border border-(--line)">
          <div className="space-y-3 border-b border-(--line) px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                className={cn(
                  'min-w-0 inline-flex flex-wrap items-center gap-2',
                  sectionTitleClassName,
                )}
              >
                <span>{sheetTitle}</span>
                {selectedAddedInChange ? (
                  <span
                    className={cn(
                      'inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                      changeKindBadgeClass('added'),
                    )}
                  >
                    Added in change
                  </span>
                ) : null}
              </h2>
              {loadingBoq ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    hintClassName,
                  )}
                >
                  <LoaderCircle
                    className="size-3 animate-spin"
                    aria-hidden
                  />
                  Loading…
                </span>
              ) : boqId ? (
                <span className="text-xs text-(--muted)">Saved BOQ</span>
              ) : itemId && fileId ? (
                <span className="text-xs text-(--muted)">Draft · not saved</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <p className="text-[11px] text-(--muted)">Item</p>
                <Combobox
                  value={itemId}
                  onValueChange={selectItem}
                  options={itemOptions}
                  placeholder="Select item"
                  searchPlaceholder="Search items…"
                  emptyText="No items."
                  className="w-full sm:w-full"
                  aria-label="Shop Drawing item"
                />
              </div>
              <div className="min-w-[14rem] flex-1 space-y-1">
                <p className="text-[11px] text-(--muted)">Version</p>
                <Combobox
                  value={fileId}
                  onValueChange={selectFile}
                  options={versionOptions}
                  placeholder={
                    itemId ? 'Select version' : 'Select an item first'
                  }
                  searchPlaceholder="Search versions…"
                  emptyText="No versions."
                  className="w-full sm:w-full"
                  aria-label="Shop Drawing file version"
                />
              </div>
              <div className="w-28 space-y-1">
                <p className="text-[11px] text-(--muted)">Make qty</p>
                <Input
                  id="shop-drawing-boq-make-qty"
                  value={makeQty}
                  onChange={(e) => setMakeQty(e.target.value)}
                  disabled={
                    !canManage || loadingBoq || !fileId || contentFrozen
                  }
                  inputMode="decimal"
                  placeholder="1"
                  className="h-9"
                />
              </div>
              {canManage ? (
                <div className="flex flex-wrap items-center gap-2 pb-0.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={openAddItem}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add item
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={!itemId || uploading}
                    onClick={openUpload}
                  >
                    <Upload className="size-3.5" aria-hidden />
                    Upload
                  </Button>
                </div>
              ) : null}
            </div>
            {contentFrozen ? (
              <p className={cn('text-xs', hintClassName)}>
                Frozen while RAB is locked. Use Open RAB above to start a change,
                then return here to edit. New shop drawing uploads are still
                allowed (empty BOQ).
              </p>
            ) : rab?.changeDraft ? (
              <p className={cn('text-xs', hintClassName)}>
                Change in progress — edits save into the draft. When materials
                need prices, open RAB to price and commit.
              </p>
            ) : null}
          </div>

          <Tabs
            value={section}
            onValueChange={setSection}
            className="min-w-0 max-w-full gap-0"
          >
            <div className="border-b border-(--line) px-4 py-2">
              <TabsList variant="line">
                <TabsTrigger value="main">Main</TabsTrigger>
                <TabsTrigger value="lighting">Lighting</TabsTrigger>
                <TabsTrigger value="mounting">Mounting</TabsTrigger>
                <TabsTrigger value="other">Other</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="main" className="mt-0 space-y-4 p-4">
              {itemId && versions.length === 0 ? (
                <div className="space-y-3">
                  <p className={cn('text-sm', hintClassName)}>
                    This item has no file versions yet.
                    {canManage ? ' Upload a file to open its BOQ.' : ''}
                  </p>
                  {canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={openUpload}
                    >
                      <Upload className="size-3.5" aria-hidden />
                      Upload
                    </Button>
                  ) : null}
                </div>
              ) : !fileId ? (
                <p className={cn('text-sm', hintClassName)}>
                  Select a file version to edit its BOQ.
                </p>
              ) : (
                <>
                  <div className="grid gap-6 lg:grid-cols-[11rem_minmax(0,1fr)_minmax(12rem,16rem)]">
                    <aside className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <p className="text-sm font-medium">Cores</p>
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2"
                            disabled={loadingBoq || contentFrozen}
                            onClick={addBase}
                          >
                            <Plus className="size-3.5" aria-hidden />
                            Add
                          </Button>
                        ) : null}
                      </div>
                      {flatBases.length === 0 ? (
                        <div className="space-y-2">
                          <p className={cn('text-sm', hintClassName)}>
                            No cores yet
                          </p>
                          {canManage ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              disabled={loadingBoq || contentFrozen}
                              onClick={addBase}
                            >
                              <Plus className="size-3.5" aria-hidden />
                              Add core
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <ul className="space-y-0.5">
                          {flatBases.map(({ base }, index) => {
                            const selected = base.key === activeBaseKey
                            const layerCount = base.finishings.length
                            return (
                              <li key={base.key}>
                                <button
                                  type="button"
                                  className={cn(
                                    'w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                                    selected
                                      ? 'bg-(--ink)/8 font-medium'
                                      : 'hover:bg-(--ink)/4',
                                  )}
                                  onClick={() => setActiveBaseKey(base.key)}
                                >
                                  <span className="block truncate">
                                    {baseListLabel(base, index)}
                                  </span>
                                  <span
                                    className={cn(
                                      'block text-[11px]',
                                      hintClassName,
                                    )}
                                  >
                                    {layerCount}{' '}
                                    {layerCount === 1 ? 'layer' : 'layers'}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {canManage &&
                      activeBaseEntry &&
                      !contentFrozen ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-full justify-start gap-1.5 px-2 text-(--muted)"
                          disabled={loadingBoq}
                          onClick={() =>
                            removeBase(
                              activeBaseEntry.partKey,
                              activeBaseEntry.base.key,
                            )
                          }
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Delete selected
                        </Button>
                      ) : null}
                    </aside>

                    <div className="min-w-0">
                      {!activeSandwich ? (
                        <p className={cn('text-sm', hintClassName)}>
                          {flatBases.length === 0
                            ? 'Add a core to start the sandwich.'
                            : 'Select a core'}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <p className={cn('text-sm', hintClassName)}>
                            Stack reads outside → core → outside (matches
                            preview).
                          </p>

                          <div className="space-y-2 rounded-sm border border-(--line) p-3">
                            <p className="text-[11px] font-medium tracking-wide text-(--muted)">
                              Above core
                            </p>
                            {canManage ? (
                              <button
                                type="button"
                                className="text-xs text-(--muted) hover:text-(--ink)"
                                disabled={loadingBoq}
                                onClick={() =>
                                  addFinishing(
                                    activeSandwich.partKey,
                                    activeSandwich.base.key,
                                    'top',
                                  )
                                }
                              >
                                + Add layer above
                              </button>
                            ) : null}
                            {activeSandwich.topFinishings.map((finishing) =>
                              renderFinishingRow(
                                activeSandwich.partKey,
                                activeSandwich.base,
                                finishing,
                                `Layer above · ${finishing.finishingOrder}`,
                                'Remove layer above',
                              ),
                            )}
                            {activeSandwich.topFinishings.length === 0 ? (
                              <p className={cn('text-xs', hintClassName)}>
                                No layers above this core.
                              </p>
                            ) : null}
                          </div>

                          <div className="space-y-1 rounded-sm border border-(--ink)/20 bg-(--surface) p-3">
                            <p className="text-[11px] font-medium tracking-wide text-(--muted)">
                              Core material
                            </p>
                            <ShopDrawingBoqLinesEditor
                              lines={[activeSandwich.base.line]}
                              onChange={(lines) =>
                                updateBase(
                                  activeSandwich.partKey,
                                  activeSandwich.base.key,
                                  { line: lines[0] ?? emptyLine() },
                                )
                              }
                              materials={materials}
                              makeQty={makeQty}
                              canManage={canManage}
                              disabled={loadingBoq}
                              allowEmpty={false}
                              maxLines={1}
                              compact
                            />
                          </div>

                          <div className="space-y-2 rounded-sm border border-(--line) p-3">
                            <p className="text-[11px] font-medium tracking-wide text-(--muted)">
                              Below core
                            </p>
                            {activeSandwich.bottomFinishings.map((finishing) =>
                              renderFinishingRow(
                                activeSandwich.partKey,
                                activeSandwich.base,
                                finishing,
                                `Layer below · ${finishing.finishingOrder}`,
                                'Remove layer below',
                              ),
                            )}
                            {activeSandwich.bottomFinishings.length === 0 ? (
                              <p className={cn('text-xs', hintClassName)}>
                                No layers below this core.
                              </p>
                            ) : null}
                            {canManage ? (
                              <button
                                type="button"
                                className="text-xs text-(--muted) hover:text-(--ink)"
                                disabled={loadingBoq}
                                onClick={() =>
                                  addFinishing(
                                    activeSandwich.partKey,
                                    activeSandwich.base.key,
                                    'bottom',
                                  )
                                }
                              >
                                + Add layer below
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>

                    <aside className="h-fit border border-(--line) p-3 lg:sticky lg:top-4">
                      <ShopDrawingBoqSandwichPreview
                        parts={parts}
                        materials={materials}
                        activeBaseKey={activeBaseKey}
                      />
                    </aside>
                  </div>

                  <div className="space-y-2 border-t border-(--line) pt-4">
                    <p className="text-sm font-medium">Assembly materials</p>
                    <ShopDrawingBoqLinesEditor
                      lines={assemblyLines}
                      onChange={setAssemblyLines}
                      materials={materials}
                      makeQty={makeQty}
                      canManage={canManage && !contentFrozen}
                      disabled={loadingBoq}
                    />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="lighting" className="mt-0 p-4">
              {!fileId ? (
                <p className={cn('text-sm', hintClassName)}>
                  Select a file version to edit its BOQ.
                </p>
              ) : (
                <ShopDrawingBoqLinesEditor
                  lines={lightingLines}
                  onChange={setLightingLines}
                  materials={materials}
                  makeQty={makeQty}
                  canManage={canManage && !contentFrozen}
                  disabled={loadingBoq}
                />
              )}
            </TabsContent>

            <TabsContent value="mounting" className="mt-0 space-y-3 p-4">
              {!fileId ? (
                <p className={cn('text-sm', hintClassName)}>
                  Select a file version to edit its BOQ.
                </p>
              ) : (
                <>
                  <div className="max-w-xs space-y-1">
                    <p className="text-[11px] text-(--muted)">How mounted</p>
                    <Combobox
                      value={mountingType}
                      onValueChange={(value) =>
                        setMountingType(
                          value as ProjectShopDrawingBoqMountingType,
                        )
                      }
                      options={MOUNTING_TYPES}
                      placeholder="Type"
                      searchPlaceholder="Type…"
                      emptyText="No types."
                      className="w-full sm:w-full"
                      disabled={!canManage || loadingBoq || contentFrozen}
                    />
                  </div>
                  <ShopDrawingBoqLinesEditor
                    lines={mountingLines}
                    onChange={setMountingLines}
                    materials={materials}
                    makeQty={makeQty}
                    canManage={canManage}
                    disabled={loadingBoq}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="other" className="mt-0 p-4">
              {!fileId ? (
                <p className={cn('text-sm', hintClassName)}>
                  Select a file version to edit its BOQ.
                </p>
              ) : (
                <ShopDrawingBoqLinesEditor
                  lines={otherLines}
                  onChange={setOtherLines}
                  materials={materials}
                  makeQty={makeQty}
                  canManage={canManage && !contentFrozen}
                  disabled={loadingBoq}
                />
              )}
            </TabsContent>

            <TabsContent
              value="overview"
              className="mt-0 grid w-full min-w-0 p-4"
            >
              <ShopDrawingBoqStackViewer
                summary={summary}
                overview={overview}
              />
            </TabsContent>
          </Tabs>

          {fileId && section !== 'overview' ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--line) px-4 py-2.5">
              {canManage ? (
                <>
                  <p className={cn('text-xs', hintClassName)}>
                    Totals = qty/unit × make qty · save writes all sections
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {boqId && !contentFrozen ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        disabled={deleting || loadingBoq}
                        onClick={() => setDeleteOpen(true)}
                      >
                        Delete BOQ
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="h-8"
                      disabled={saving || loadingBoq || contentFrozen}
                      onClick={() => void onSave()}
                    >
                      {saving ? (
                        <LoaderCircle
                          className="size-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      Save BOQ
                    </Button>
                  </div>
                </>
              ) : (
                <p className={cn('text-sm', hintClassName)}>
                  View only — project.manage required to edit.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BOQ?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete this BOQ for the selected file version? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={addItemOpen}
        onOpenChange={(next) => {
          if (!next && !itemNameBusy) setAddItemOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>
              Give this Shop Drawing item a short name (e.g. item1).
            </DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={itemNameDraft}
              maxLength={120}
              disabled={itemNameBusy}
              className="w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm"
              onChange={(e) => setItemNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void confirmAddItem()
                }
              }}
            />
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={itemNameBusy}
              onClick={() => setAddItemOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={itemNameBusy || !itemNameDraft.trim()}
              onClick={() => void confirmAddItem()}
            >
              {itemNameBusy ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (!next && !uploading) {
            setUploadOpen(false)
            setPendingFile(null)
            setForceDifferent(false)
            setShowHashInfo(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Upload
              {selectedItem ? ` · ${selectedItem.name}` : ''}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Any file type up to 20MB. Identical files are reused instead of
              stored twice.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">File</span>
              <input
                type="file"
                disabled={uploading}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-(--line) file:bg-transparent file:px-2 file:py-1"
                onChange={(e) => {
                  setPendingFile(e.target.files?.[0] ?? null)
                }}
              />
            </label>
            {pendingFile ? (
              <p className={cn('text-xs', hintClassName)}>
                Selected: {pendingFile.name} ({formatBytes(pendingFile.size)})
              </p>
            ) : null}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="shop-drawing-boq-force-different"
                  checked={forceDifferent}
                  disabled={uploading}
                  onCheckedChange={(checked) =>
                    setForceDifferent(checked === true)
                  }
                />
                <label
                  htmlFor="shop-drawing-boq-force-different"
                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                >
                  Save as a new file even if content matches
                </label>
                <button
                  type="button"
                  aria-expanded={showHashInfo}
                  aria-controls="shop-drawing-boq-force-different-info"
                  aria-label="How file hashing works"
                  disabled={uploading}
                  onClick={() => setShowHashInfo((v) => !v)}
                  className={cn(
                    'rounded-sm p-0.5 text-(--muted) hover:text-(--ink)',
                    showHashInfo && 'text-(--ink)',
                  )}
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </div>
              {showHashInfo ? (
                <p
                  id="shop-drawing-boq-force-different-info"
                  className={cn('text-xs leading-relaxed', hintClassName)}
                >
                  We skip saving a duplicate when the file content already
                  exists. Check this to always keep a separate copy.
                </p>
              ) : null}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingFile || uploading}
              onClick={(event) => {
                event.preventDefault()
                void confirmUpload()
              }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
