import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { LoaderCircle } from 'lucide-react'
import { Combobox } from '#/components/ui/combobox'
import { apiFetch } from '#/lib/api'
import type { ProjectListItem } from '#/lib/project'
import { hintClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  onProjectIdChange: (projectId: string) => void
  ariaLabel?: string
}

export default function TenderProjectPicker({
  projectId,
  onProjectIdChange,
  ariaLabel = 'Select project',
}: Props) {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<ProjectListItem[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const response = await apiFetch<ProjectListItem[]>('/project')
        if (!response.success || !response.data) {
          if (!cancelled) {
            toast.error(response.message || 'Failed to load projects')
          }
          return
        }
        if (!cancelled) setProjects(response.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const options = useMemo(
    () =>
      projects.map((project) => ({
        value: project.id,
        label: `${project.projectNumber} · ${project.name}`,
      })),
    [projects],
  )

  if (loading) {
    return (
      <p className={cn('inline-flex items-center gap-1.5 text-sm', hintClassName)}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Loading projects…
      </p>
    )
  }

  return (
    <Combobox
      value={projectId}
      onValueChange={onProjectIdChange}
      options={options}
      placeholder="Select project…"
      searchPlaceholder="Search project…"
      emptyText="No projects found."
      aria-label={ariaLabel}
      className="sm:w-full sm:max-w-md"
    />
  )
}
