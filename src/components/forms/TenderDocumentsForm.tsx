import ProjectDocumentsPanel from '#/components/forms/ProjectDocumentsPanel'
import TenderProjectPicker from '#/components/forms/TenderProjectPicker'
import { useAuth } from '#/context/authContext'
import {
  hintClassName,
  metaTextClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId?: string
  onProjectIdChange: (projectId: string | undefined) => void
}

export default function TenderDocumentsForm({
  projectId,
  onProjectIdChange,
}: Props) {
  const { can } = useAuth()
  const canManage = can('project.manage')

  return (
    <div className="space-y-8">
      <div>
        <h1 className={pageTitleClassName}>Tender Document</h1>
        <p className={cn('mt-2', hintClassName)}>
          Select a project to manage its tender documents.
        </p>
      </div>

      <div className="max-w-md space-y-2">
        <p className={metaTextClassName}>
          Project
        </p>
        <TenderProjectPicker
          projectId={projectId ?? ''}
          onProjectIdChange={(next) => onProjectIdChange(next || undefined)}
          ariaLabel="Tender document project"
        />
      </div>

      {projectId ? (
        <ProjectDocumentsPanel projectId={projectId} canManage={canManage} />
      ) : (
        <p className={hintClassName}>Choose a project to view documents.</p>
      )}
    </div>
  )
}
