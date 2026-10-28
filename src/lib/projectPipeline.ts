import type { ProjectRab, ProjectShopDrawingItem } from '#/lib/project'
import type { QuotationOverview, QuotationSummary } from '#/lib/quotation'

export type PipelineStage = 'boq' | 'rab' | 'quotation'
export type PipelineTone = 'idle' | 'progress' | 'ok' | 'warn' | 'locked'

export type BoqInsight = {
  tone: PipelineTone
  label: string
  items: number
  withFile: number
  withBoq: number
  /** Items with a current file but no BOQ. */
  missing: number
  frozen: boolean
  /** BOQ files added / removed in the open RAB change. */
  changeAdded: number
  changeRemoved: number
}

export type RabInsight = {
  tone: PipelineTone
  label: string
  status: 'none' | 'draft' | 'locked' | 'change'
  lines: number
  unpriced: number
  grandTotal: string | null
  revision: number
  changeReason: string | null
  changeAdded: number
  changeChanged: number
  changeRemoved: number
  /** grandTotal − baselineGrandTotal while a change is open. */
  changeDelta: number | null
}

export type QuotationInsight = {
  tone: PipelineTone
  label: string
  latest: QuotationSummary | null
  latestIssued: QuotationSummary | null
  /** The revision the client accepted; quotations are locked once set. */
  won: QuotationSummary | null
  draft: QuotationSummary | null
  revisions: number
  /** Latest issued (or the draft) is based on an older RAB revision. */
  outdated: boolean
  currentRabRevision: number
}

export type NextStep = {
  tone: PipelineTone
  stage: PipelineStage
  text: string
}

export type PipelineInsight = {
  boq: BoqInsight
  rab: RabInsight
  quotation: QuotationInsight | null
  next: NextStep
}

function toNumber(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function buildPipelineInsight(input: {
  items: ProjectShopDrawingItem[]
  rab: ProjectRab | null
  quotation: QuotationOverview | null
}): PipelineInsight {
  const { items, rab, quotation } = input

  const rabStatus: RabInsight['status'] = !rab
    ? 'none'
    : rab.status === 'locked'
      ? rab.changeDraft
        ? 'change'
        : 'locked'
      : 'draft'
  const frozen = rabStatus === 'locked'

  // BOQ
  const withFile = items.filter((i) => i.current).length
  const withBoq = items.filter((i) => i.current?.hasBoq).length
  const missing = withFile - withBoq
  const boqDiff = rab?.changeDiff?.boqDiff ?? []
  const boq: BoqInsight = {
    tone: 'idle',
    label: 'Not started',
    items: items.length,
    withFile,
    withBoq,
    missing,
    frozen,
    changeAdded: boqDiff.filter((d) => d.kind === 'added').length,
    changeRemoved: boqDiff.filter((d) => d.kind === 'removed').length,
  }
  if (frozen) {
    boq.tone = 'locked'
    boq.label = 'Frozen'
  } else if (rabStatus === 'change') {
    boq.tone = 'warn'
    boq.label = 'Editing in change'
  } else if (items.length === 0) {
    boq.tone = 'idle'
    boq.label = 'Not started'
  } else if (missing > 0 || withFile < items.length) {
    boq.tone = 'progress'
    boq.label = 'Partial'
  } else {
    boq.tone = 'ok'
    boq.label = 'Complete'
  }

  // RAB
  const lines = rab?.groups.flatMap((g) => g.lines) ?? []
  const unpriced = lines.filter((l) => !l.unitPrice).length
  const lineDiff = rab?.changeDiff?.lineDiff ?? []
  const total = toNumber(rab?.grandTotal)
  const baseline = toNumber(rab?.baselineGrandTotal)
  const rabInsight: RabInsight = {
    tone: 'idle',
    label: 'Not started',
    status: rabStatus,
    lines: lines.length,
    unpriced,
    grandTotal: rab?.grandTotal ?? null,
    revision: rab?.currentRevision ?? 0,
    changeReason: rab?.changeDraft?.reason ?? null,
    changeAdded: lineDiff.filter((d) => d.kind === 'added').length,
    changeChanged: lineDiff.filter((d) => d.kind === 'changed').length,
    changeRemoved: lineDiff.filter((d) => d.kind === 'removed').length,
    changeDelta:
      rabStatus === 'change' && total !== null && baseline !== null
        ? total - baseline
        : null,
  }
  if (rabStatus === 'change') {
    rabInsight.tone = 'warn'
    rabInsight.label = `Change open · rev ${rabInsight.revision}`
  } else if (rabStatus === 'locked') {
    rabInsight.tone = 'locked'
    rabInsight.label = `Locked · rev ${rabInsight.revision}`
  } else if (lines.length > 0) {
    rabInsight.tone = unpriced > 0 ? 'progress' : 'ok'
    rabInsight.label =
      unpriced > 0 ? 'Draft · pricing' : 'Draft · ready to lock'
  }

  // Quotation
  let quotationInsight: QuotationInsight | null = null
  if (quotation) {
    const revs = quotation.revisions
    const latest = revs[0] ?? null
    const draft = revs.find((r) => r.status === 'draft') ?? null
    const won = revs.find((r) => r.status === 'won') ?? null
    const latestIssued =
      won ?? revs.find((r) => r.status === 'issued') ?? null
    const current = quotation.currentRabRevision
    const basis = draft ?? latestIssued
    const outdated =
      quotation.rabStatus === 'locked' &&
      basis !== null &&
      basis.rabRevision < current
    quotationInsight = {
      tone: 'idle',
      label: 'None yet',
      latest,
      latestIssued,
      won,
      draft,
      revisions: revs.length,
      outdated,
      currentRabRevision: current,
    }
    if (won) {
      quotationInsight.tone = 'locked'
      quotationInsight.label = `R${won.revision} won`
    } else if (draft) {
      quotationInsight.tone = outdated ? 'warn' : 'progress'
      quotationInsight.label = `R${draft.revision} draft`
    } else if (latestIssued) {
      quotationInsight.tone = outdated ? 'warn' : 'ok'
      quotationInsight.label = `R${latestIssued.revision} issued`
    }
  }

  return {
    boq,
    rab: rabInsight,
    quotation: quotationInsight,
    next: nextStep(boq, rabInsight, quotationInsight),
  }
}

function nextStep(
  boq: BoqInsight,
  rab: RabInsight,
  q: QuotationInsight | null,
): NextStep {
  if (rab.status === 'change') {
    return {
      tone: 'warn',
      stage: 'rab',
      text: 'RAB change is open: edit BOQ / prices, then commit or discard it on RAB.',
    }
  }
  if (rab.status !== 'locked') {
    if (boq.items === 0) {
      return {
        tone: 'idle',
        stage: 'boq',
        text: 'Add shop drawing items and upload their files.',
      }
    }
    if (boq.withFile < boq.items) {
      return {
        tone: 'progress',
        stage: 'boq',
        text: `Upload files for ${plural(boq.items - boq.withFile, 'item')}.`,
      }
    }
    if (boq.missing > 0) {
      return {
        tone: 'progress',
        stage: 'boq',
        text: `Add BOQ for ${plural(boq.missing, 'item')} (${boq.withBoq}/${boq.withFile} done).`,
      }
    }
    if (rab.lines === 0) {
      return {
        tone: 'progress',
        stage: 'rab',
        text: 'Open RAB to build lines from the BOQ.',
      }
    }
    if (rab.unpriced > 0) {
      return {
        tone: 'progress',
        stage: 'rab',
        text: `Price ${plural(rab.unpriced, 'RAB line')}, then lock the RAB.`,
      }
    }
    return {
      tone: 'progress',
      stage: 'rab',
      text: 'All lines priced: lock the RAB.',
    }
  }

  // RAB locked from here on.
  if (!q) {
    return { tone: 'ok', stage: 'rab', text: 'RAB is locked.' }
  }
  if (q.won) {
    return {
      tone: 'ok',
      stage: 'quotation',
      text: `Quotation R${q.won.revision} is won: upload File Produksi for every item, then release to production.`,
    }
  }
  if (q.draft) {
    if (q.outdated) {
      return {
        tone: 'warn',
        stage: 'quotation',
        text: `RAB is now rev ${q.currentRabRevision}: resync draft R${q.draft.revision}, then issue.`,
      }
    }
    return {
      tone: 'progress',
      stage: 'quotation',
      text: `Review and issue quotation R${q.draft.revision}.`,
    }
  }
  if (!q.latestIssued) {
    return {
      tone: 'progress',
      stage: 'quotation',
      text: 'Create quotation R1 from the locked RAB.',
    }
  }
  if (q.outdated) {
    return {
      tone: 'warn',
      stage: 'quotation',
      text: `RAB rev ${q.currentRabRevision} was committed after R${q.latestIssued.revision}: create a new revision.`,
    }
  }
  return {
    tone: 'ok',
    stage: 'quotation',
    text: `Quotation R${q.latestIssued.revision} issued and matches the current RAB. Mark it as won when the client accepts.`,
  }
}
