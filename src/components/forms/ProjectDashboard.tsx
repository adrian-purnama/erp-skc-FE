import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import ProjectCalendarPanel from '#/components/forms/ProjectCalendarPanel'
import ProjectDocumentsPanel from '#/components/forms/ProjectDocumentsPanel'
import ProjectPhaseSteps from '#/components/forms/ProjectPhaseSteps'
import ProjectPipelineHeader from '#/components/forms/ProjectPipelineHeader'
import ProjectQuotationForm from '#/components/forms/ProjectQuotationForm'
import ProjectRabForm from '#/components/forms/ProjectRabForm'
import ProjectShopDrawingPanel from '#/components/forms/ProjectShopDrawingPanel'
import ProjectSideNavPanel from '#/components/forms/ProjectSideNavPanel'
import ProjectStatusChip from '#/components/forms/ProjectStatusChip'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import { useSideNav } from '#/context/sideNavContext'
import { apiFetch } from '#/lib/api'
import {
  PROJECT_CLOSE_REASON_LABELS,
  PROJECT_LOSE_REASON_LABELS,
  PROJECT_PHASE_LABELS,
  phaseForStatus,
  type ProjectCloseReason,
  type ProjectDetail,
  type ProjectLoseReason,
  type ProjectPhase,
  type ProjectStatus,
} from '#/lib/project'
import {
  buttonOutlineClassName,
  hintClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import type { PipelineStage } from '#/lib/projectPipeline'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
}

export default function ProjectDashboard({ projectId }: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')
  const { setDetailsSlot, setMode } = useSideNav()
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [activePhase, setActivePhase] = useState<ProjectPhase>('tender')
  const [internalTab, setInternalTab] = useState<PipelineStage>('boq')
  const [pipelineKey, setPipelineKey] = useState(0)
  const bumpPipeline = useCallback(() => setPipelineKey((k) => k + 1), [])

  const saveStatus = useCallback(
    async (patch: {
      status: ProjectStatus
      loseReason: ProjectLoseReason | null
      closeReason: ProjectCloseReason | null
    }) => {
      if (!project || !canManage || statusSaving) return
      setStatusSaving(true)
      try {
        const response = await apiFetch<ProjectDetail>(
          `/project/${project.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(patch),
          },
        )
        if (!response.success || !response.data) {
          toast.error(response.message || 'Failed to update status')
          return
        }
        setProject(response.data)
        setActivePhase(phaseForStatus(response.data.status))
        toast.success('Status updated')
      } catch {
        toast.error('Unable to reach the server')
      } finally {
        setStatusSaving(false)
      }
    },
    [project, canManage, statusSaving],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const response = await apiFetch<ProjectDetail>(`/project/${projectId}`)
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Project not found')
            setProject(null)
          }
          return
        }
        if (!cancelled) {
          setProject(response.data)
          setActivePhase(phaseForStatus(response.data.status))
        }
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!project) {
      setDetailsSlot(null)
      return
    }

    setDetailsSlot(
      <ProjectSideNavPanel
        project={project}
        canManage={canManage}
        statusSaving={statusSaving}
        onSaveStatus={(patch) => {
          void saveStatus(patch)
        }}
      />,
    )

    return () => {
      setDetailsSlot(null)
    }
  }, [project, canManage, statusSaving, saveStatus, setDetailsSlot])

  useEffect(() => {
    if (!project) return
    setMode('details')
    return () => {
      setMode('menu')
    }
  }, [project?.id, setMode])

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm', hintClassName)}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Loading project…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <p className={hintClassName}>Project not found.</p>
        <Link
          to="/dashboard/projects"
          className={cn(buttonOutlineClassName, 'inline-flex no-underline')}
        >
          Back to Project Dashboard
        </Link>
      </div>
    )
  }

  const statusPhase = phaseForStatus(project.status)

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <p className={cn('text-sm', hintClassName)}>
          <Link
            to="/dashboard/projects"
            className="underline-offset-4 hover:underline"
          >
            Project Dashboard
          </Link>
          {' / '}
          <span className="tabular-nums">{project.projectNumber}</span>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <ProjectPhaseSteps
            value={activePhase}
            onValueChange={setActivePhase}
            statusPhase={statusPhase}
          />
          <ProjectStatusChip status={project.status} />
        </div>

        {project.status === 'lose' && project.loseReason ? (
          <p className={cn('text-sm', hintClassName)}>
            Lose reason:{' '}
            {PROJECT_LOSE_REASON_LABELS[project.loseReason] ??
              project.loseReason}
          </p>
        ) : null}
        {project.status === 'close' && project.closeReason ? (
          <p className={cn('text-sm', hintClassName)}>
            Close reason:{' '}
            {PROJECT_CLOSE_REASON_LABELS[project.closeReason] ??
              project.closeReason}
          </p>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id={`project-phase-panel-${activePhase}`}
        aria-labelledby={`project-phase-tab-${activePhase}`}
        className="space-y-4"
      >
        {activePhase === 'tender' ? (
          <div className="space-y-10">
            <section className="space-y-3">
              <h2 className={sectionTitleClassName}>Documents</h2>
              <ProjectDocumentsPanel
                projectId={project.id}
                canManage={canManage}
              />
            </section>
            <section className="space-y-3">
              <h2 className={sectionTitleClassName}>Calendar</h2>
              <ProjectCalendarPanel
                projectId={project.id}
                canManage={canManage}
              />
            </section>
          </div>
        ) : activePhase === 'internal' ? (
          <div className="space-y-5">
            <ProjectPipelineHeader
              projectId={project.id}
              refreshKey={pipelineKey}
              active={internalTab}
              onSelect={setInternalTab}
            />
            <Tabs
              value={internalTab}
              onValueChange={(v) => setInternalTab(v as PipelineStage)}
            >
              <TabsList>
                <TabsTrigger value="boq">Shop Drawing &amp; BOQ</TabsTrigger>
                <TabsTrigger value="rab">RAB</TabsTrigger>
                {can('quotation.view') ? (
                  <TabsTrigger value="quotation">Quotation</TabsTrigger>
                ) : null}
              </TabsList>
              <TabsContent value="boq" className="pt-3">
                <ProjectShopDrawingPanel
                  projectId={project.id}
                  canManage={canManage}
                  onChanged={bumpPipeline}
                />
              </TabsContent>
              <TabsContent value="rab" className="pt-3">
                <ProjectRabForm
                  projectId={project.id}
                  embedded
                  onChanged={bumpPipeline}
                />
              </TabsContent>
              {can('quotation.view') ? (
                <TabsContent value="quotation" className="pt-3">
                  <ProjectQuotationForm
                    projectId={project.id}
                    embedded
                    onChanged={bumpPipeline}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        ) : (
          <div className="rounded-md border border-(--line) px-4 py-10 text-center">
            <p className="text-sm font-medium">
              {PROJECT_PHASE_LABELS[activePhase]}
            </p>
            <p className={cn('mt-1 text-sm', hintClassName)}>
              Content for this phase will be added later.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
