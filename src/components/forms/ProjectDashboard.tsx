import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { Info, LoaderCircle, Lock } from 'lucide-react'
import ProjectCalendarPanel from '#/components/forms/ProjectCalendarPanel'
import ProjectDocumentsPanel from '#/components/forms/ProjectDocumentsPanel'
import ProjectPhaseSteps from '#/components/forms/ProjectPhaseSteps'
import ProjectPipelineHeader from '#/components/forms/ProjectPipelineHeader'
import ProjectProductionPanel from '#/components/forms/production/ProjectProductionPanel'
import ProjectProductionReleaseButton from '#/components/forms/production/ProjectProductionReleaseButton'
import ProjectQuotationForm from '#/components/forms/ProjectQuotationForm'
import ProjectRabForm from '#/components/forms/ProjectRabForm'
import ProjectShopDrawingPanel from '#/components/forms/ProjectShopDrawingPanel'
import ProjectSideNavPanel from '#/components/forms/ProjectSideNavPanel'
import ProjectHeader from '#/components/forms/ProjectHeader'
import { Tabs, TabsContent } from '#/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { useAuth } from '#/context/authContext'
import { useSideNav } from '#/context/sideNavContext'
import { apiFetch } from '#/lib/api'
import {
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
        setActivePhase(
          phaseForStatus(
            response.data.status,
            response.data.productionReleasedAt,
          ),
        )
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
          setActivePhase(
            phaseForStatus(
              response.data.status,
              response.data.productionReleasedAt,
            ),
          )
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

  const reloadAfterRelease = useCallback(async () => {
    try {
      const response = await apiFetch<ProjectDetail>(`/project/${projectId}`)
      if (response.success && response.data) {
        setProject(response.data)
        setActivePhase('production')
      }
    } catch {
      toast.error('Unable to reach the server')
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

  const statusPhase = phaseForStatus(
    project.status,
    project.productionReleasedAt,
  )

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <ProjectHeader
          project={project}
          canManage={canManage}
          refreshKey={pipelineKey}
        />
        <ProjectPhaseSteps
          value={activePhase}
          onValueChange={setActivePhase}
          statusPhase={statusPhase}
        />
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
          <div className="space-y-6">
            {project.productionReleasedAt ? (
              <p
                className={cn(
                  'inline-flex items-center gap-1.5 text-sm',
                  hintClassName,
                )}
              >
                <Lock className="size-4" aria-hidden />
                Released to production{' '}
                {new Date(project.productionReleasedAt).toLocaleDateString(
                  'en-GB',
                  {
                    timeZone: 'Asia/Jakarta',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  },
                )}
                {' · RAB and quotation locked'}
              </p>
            ) : can('production.manage') ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-(--surface) px-4 py-3">
                <p className="inline-flex items-center gap-1.5 text-sm">
                  Ready for production?
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-(--muted) hover:text-(--ink)"
                          aria-label="What is needed to release"
                        >
                          <Info className="size-4" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Needs a won quotation, a locked RAB, and a shop drawing,
                        BOQ and File Produksi on every item.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <ProjectProductionReleaseButton
                  projectId={project.id}
                  onReleased={() => void reloadAfterRelease()}
                />
              </div>
            ) : null}
            <ProjectPipelineHeader
              projectId={project.id}
              refreshKey={pipelineKey}
              active={internalTab}
              onSelect={setInternalTab}
              released={Boolean(project.productionReleasedAt)}
            />
            <Tabs
              value={internalTab}
              onValueChange={(v) => setInternalTab(v as PipelineStage)}
            >
              <TabsContent value="boq">
                <ProjectShopDrawingPanel
                  projectId={project.id}
                  canManage={canManage}
                  onChanged={bumpPipeline}
                />
              </TabsContent>
              <TabsContent value="rab">
                <ProjectRabForm
                  projectId={project.id}
                  embedded
                  onChanged={bumpPipeline}
                />
              </TabsContent>
              {can('quotation.view') ? (
                <TabsContent value="quotation">
                  <ProjectQuotationForm
                    projectId={project.id}
                    embedded
                    onChanged={bumpPipeline}
                  />
                </TabsContent>
              ) : null}
            </Tabs>
          </div>
        ) : activePhase === 'production' ? (
          !project.productionReleasedAt ? (
            <div className="rounded-md border border-(--line) px-4 py-10 text-center">
              <p className="text-sm font-medium">Not in production yet</p>
              <p className={cn('mt-1 text-sm', hintClassName)}>
                Release the project from the Internal phase.
              </p>
            </div>
          ) : can('production.view') ? (
            <ProjectProductionPanel projectId={project.id} />
          ) : (
            <p className={cn('text-sm', hintClassName)}>
              You do not have access to production.
            </p>
          )
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
