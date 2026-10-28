import { useCallback, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import ProjectProductionPanel from '#/components/forms/production/ProjectProductionPanel'
import ProjectProductionReleaseButton from '#/components/forms/production/ProjectProductionReleaseButton'
import TenderProjectPicker from '#/components/forms/TenderProjectPicker'
import { useAuth } from '#/context/authContext'
import { apiFetch } from '#/lib/api'
import type { ProjectDetail } from '#/lib/project'
import {
  buttonOutlineClassName,
  hintClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  onProjectIdChange: (projectId: string | undefined) => void
}

/** Production for one project: pick it, then release it or follow its SPK. */
export default function ProjectProductionPage({
  projectId,
  onProjectIdChange,
}: Props) {
  const { can } = useAuth()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const response = await apiFetch<ProjectDetail>(`/project/${id}`)
      if (!response.success) {
        toast.error(response.message || 'Project not found')
        setProject(null)
        return
      }
      setProject(response.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (projectId) void load(projectId)
    else setProject(null)
  }, [projectId, load])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className={pageTitleClassName}>Production Status</h1>
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
        <div className="max-w-md min-w-[16rem] flex-1">
          <TenderProjectPicker
            projectId={projectId ?? ''}
            onProjectIdChange={(next) => onProjectIdChange(next || undefined)}
            ariaLabel="Production project"
          />
        </div>
      </div>

      {!projectId ? (
        <p className={hintClassName}>
          Choose a project to view its production.
        </p>
      ) : loading && !project ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : !project ? null : project.productionReleasedAt ? (
        <ProjectProductionPanel projectId={project.id} />
      ) : (
        <div className="space-y-3 rounded-md border border-(--line) px-4 py-8 text-center">
          <p className="text-sm font-medium">Not in production yet</p>
          <p className={cn('text-sm', hintClassName)}>
            Needs a won quotation, locked RAB, and shop drawing, BOQ and File
            Produksi on every item.
          </p>
          {can('production.manage') ? (
            <div className="flex justify-center">
              <ProjectProductionReleaseButton
                projectId={project.id}
                onReleased={() => void load(project.id)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
