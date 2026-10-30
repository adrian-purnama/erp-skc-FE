import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, LoaderCircle, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { apiBlobUrl } from '#/lib/api'

/** One proof file: image thumbnail or a PDF card; opens full size in a new tab. */
export default function ProofFile({
  path,
  photo,
  onRemove,
  disabled,
}: {
  /** API path that streams the file. */
  path: string
  photo: { originalFilename: string; contentType: string }
  onRemove?: () => void
  disabled?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const isImage = photo.contentType.startsWith('image/')

  useEffect(() => {
    if (!isImage) return
    let revoked = false
    let made: string | null = null
    void apiBlobUrl(path)
      .then((u) => {
        made = u
        if (revoked) URL.revokeObjectURL(u)
        else setUrl(u)
      })
      .catch(() => undefined)
    return () => {
      revoked = true
      if (made) URL.revokeObjectURL(made)
    }
  }, [path, isImage])

  async function open() {
    try {
      const u = url ?? (await apiBlobUrl(path))
      window.open(u, '_blank', 'noopener')
    } catch {
      toast.error('Could not open the file')
    }
  }

  return (
    <div className="group relative overflow-hidden rounded-md border border-(--line) bg-(--surface)">
      <button
        type="button"
        onClick={() => void open()}
        className="block aspect-[4/3] w-full focus-visible:ring-2 focus-visible:ring-(--ink) focus-visible:outline-none"
        aria-label={`Open ${photo.originalFilename}`}
      >
        {isImage ? (
          url ? (
            <img
              src={url}
              alt={photo.originalFilename}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center">
              <LoaderCircle
                className="size-4 animate-spin text-(--muted)"
                aria-hidden
              />
            </span>
          )
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-1 text-(--muted)">
            <FileText className="size-6" aria-hidden />
            <span className="text-xs">PDF</span>
          </span>
        )}
      </button>
      <p className="truncate px-2 py-1 text-xs" title={photo.originalFilename}>
        {photo.originalFilename}
      </p>
      {onRemove ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          className="absolute top-1 right-1 opacity-90"
          aria-label={`Remove ${photo.originalFilename}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
