import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { apiDownload } from '#/lib/api'
import { hintClassName, pageTitleClassName } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

type Props = {
  projectId: string
  kind: 'sd' | 'production'
  fileId: string
  name: string
}

/** Landing page for the file links printed on an SPK PDF: downloads with the signed-in user. */
export default function ProductionFileDownload({
  projectId,
  kind,
  fileId,
  name,
}: Props) {
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState('')
  const started = useRef(false)

  const download = useCallback(async () => {
    setState('loading')
    try {
      const base =
        kind === 'sd'
          ? `/project/${projectId}/shop-drawing/files`
          : `/project/${projectId}/shop-drawing/production-files`
      await apiDownload(`${base}/${fileId}/download`, name || 'file')
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
      setState('error')
    }
  }, [projectId, kind, fileId, name])

  useEffect(() => {
    // Strict mode mounts twice; download once.
    if (started.current) return
    started.current = true
    void download()
  }, [download])

  return (
    <div className="space-y-4">
      <h1 className={pageTitleClassName}>
        {kind === 'sd' ? 'Shop drawing' : 'File Produksi'}
      </h1>
      <p className="text-sm break-all">{name}</p>
      {state === 'loading' ? (
        <p className={cn('flex items-center gap-2 text-sm', hintClassName)}>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Downloading…
        </p>
      ) : state === 'done' ? (
        <p className={cn('text-sm', hintClassName)}>
          Download started. You can close this tab.
        </p>
      ) : (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {state !== 'loading' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => void download()}
        >
          <Download className="size-3.5" aria-hidden />
          Download again
        </Button>
      ) : null}
    </div>
  )
}
