import {
  useCallback,
  useEffect,
  useRef,
  useState
  
  
} from 'react'
import type {DragEvent, FormEvent} from 'react';
import { Link, useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import ConfirmDeleteDialog from '#/components/forms/website/ConfirmDeleteDialog'
import { ListChip } from '#/components/forms/shared/ListTable'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { useAuth } from '#/context/authContext'
import {
  LANDING_MAX_UPLOAD_MB,
  landingApi,
  landingImageSrc,
  moveItem,
  runLimited,
  slugify,
  uploadLandingImage
  
  
  
} from '#/lib/landing'
import type {LandingCategory, LandingImage, LandingPost} from '#/lib/landing';
import {
  cardClassName,
  hintClassName,
  inputClassName,
  pageTitleClassName,
  sectionTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const PARALLEL_UPLOADS = 3

type QueueItem = {
  key: string
  name: string
  preview: string
  percent: number
  error: string | null
  file: File
}

/** Keep images under the server limit; report what was skipped. */
function acceptImages(files: FileList | File[]): File[] {
  const ok: File[] = []
  const skipped: string[] = []
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) skipped.push(`${file.name} is not an image`)
    else if (file.size > LANDING_MAX_UPLOAD_MB * 1024 * 1024)
      skipped.push(`${file.name} is over ${LANDING_MAX_UPLOAD_MB} MB`)
    else ok.push(file)
  }
  if (skipped.length > 0) toast.error(skipped.join('\n'))
  return ok
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export default function WebsitePostEditor({ postId }: { postId: string }) {
  const { can } = useAuth()
  const canManage = can('landing.manage')
  const navigate = useNavigate()

  const [post, setPost] = useState<LandingPost | null>(null)
  const [categories, setCategories] = useState<LandingCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    place: '',
    categoryId: '',
    slug: '',
    featured: false,
    published: false,
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const applyPost = useCallback((next: LandingPost) => {
    setPost(next)
    setForm({
      title: next.title,
      place: next.place,
      categoryId: next.categoryId,
      slug: next.slug,
      featured: next.featured,
      published: next.published,
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [postRes, catRes] = await Promise.all([
          landingApi.getPost(postId),
          landingApi.listCategories(),
        ])
        if (cancelled) return
        if (!postRes.success) {
          toast.error(postRes.message || 'Post not found')
          return
        }
        applyPost(postRes.data)
        if (catRes.success) setCategories(catRes.data)
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [postId, applyPost])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.place.trim()) {
      toast.error('Title and place are required')
      return
    }
    setSaving(true)
    try {
      const res = await landingApi.updatePost(postId, {
        ...form,
        title: form.title.trim(),
        place: form.place.trim(),
        slug: form.slug.trim(),
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      applyPost(res.data)
      toast.success('Saved')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    setDeleting(true)
    try {
      const res = await landingApi.deletePost(postId)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Post deleted')
      void navigate({ to: '/dashboard/website' })
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <p className={cn('flex items-center gap-2', hintClassName)}>
        <LoaderCircle className="size-4 animate-spin" /> Loading post…
      </p>
    )
  }
  if (!post) {
    return (
      <div className="space-y-3">
        <p>This post does not exist anymore.</p>
        <Link to="/dashboard/website" className="underline">
          Back to website content
        </Link>
      </div>
    )
  }

  const live = post.published && post.cover !== null
  const category = categories.find((c) => c.id === post.categoryId)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link
          to="/dashboard/website"
          className="inline-flex items-center gap-1 text-sm text-(--muted) hover:text-(--ink)"
        >
          <ChevronLeft className="size-4" /> Website content
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={pageTitleClassName}>{post.title}</h1>
          {live ? (
            <ListChip tone="success">On website</ListChip>
          ) : (
            <ListChip tone="neutral">Draft</ListChip>
          )}
        </div>
        <p className={hintClassName}>
          {category ? `/projects/${category.slug}/${post.slug}` : post.slug}
          {!post.cover ? ' · Needs a cover before it can go on the website.' : ''}
        </p>
      </div>

      <form onSubmit={onSave} className={cn(cardClassName, 'space-y-4 p-5')} noValidate>
        <h2 className={sectionTitleClassName}>Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Title</span>
            <Input
              className={inputClassName}
              value={form.title}
              disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Place</span>
            <Input
              className={inputClassName}
              value={form.place}
              disabled={!canManage}
              onChange={(e) => setForm((f) => ({ ...f, place: e.target.value }))}
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Category</span>
            <Select
              value={form.categoryId}
              disabled={!canManage}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Link name</span>
            <Input
              className={cn(inputClassName, 'font-mono')}
              value={form.slug}
              disabled={!canManage}
              placeholder={slugify(form.title)}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.published}
              disabled={!canManage || (!post.cover && !form.published)}
              onCheckedChange={(v) => setForm((f) => ({ ...f, published: v === true }))}
            />
            Show on website
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.featured}
              disabled={!canManage}
              onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v === true }))}
            />
            Featured on the home page
          </label>
        </div>
        {canManage ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        ) : null}
      </form>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SingleImageSlot
          title="Cover"
          hint="Large photo for the project card and page header."
          postId={postId}
          slot="cover"
          image={post.cover}
          canManage={canManage}
          aspectClassName="aspect-[16/10]"
          onUpdated={applyPost}
        />
        <SingleImageSlot
          title="Client logo"
          hint="Optional. Shown next to the title. Transparent PNG or SVG works best."
          postId={postId}
          slot="logo"
          image={post.logo}
          canManage={canManage}
          aspectClassName="aspect-[16/10]"
          contain
          onUpdated={applyPost}
          onRemove={async () => {
            const res = await landingApi.removeLogo(postId)
            if (!res.success) throw new Error(res.message)
            applyPost(res.data)
          }}
        />
      </div>

      <GallerySection
        postId={postId}
        gallery={post.gallery}
        canManage={canManage}
        onGalleryChange={(gallery) => setPost((p) => (p ? { ...p, gallery } : p))}
      />

      {canManage ? (
        <div className={cn(cardClassName, 'flex flex-wrap items-center justify-between gap-3 p-5')}>
          <div>
            <h2 className={sectionTitleClassName}>Delete post</h2>
            <p className={`mt-1 ${hintClassName}`}>
              Removes the post and all its photos.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 />
            Delete post
          </Button>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={confirmDelete}
        title={`Delete ${post.title}?`}
        description={`The post and its ${post.gallery.length} photos are removed for good.`}
        busy={deleting}
        onOpenChange={setConfirmDelete}
        onConfirm={() => void onDelete()}
      />
    </div>
  )
}

function SingleImageSlot({
  title,
  hint,
  postId,
  slot,
  image,
  canManage,
  aspectClassName,
  contain = false,
  onUpdated,
  onRemove,
}: {
  title: string
  hint: string
  postId: string
  slot: 'cover' | 'logo'
  image: LandingImage | null
  canManage: boolean
  aspectClassName: string
  contain?: boolean
  onUpdated: (post: LandingPost) => void
  onRemove?: () => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [removing, setRemoving] = useState(false)
  const src = landingImageSrc(image)

  async function upload(files: FileList | File[]) {
    const file = acceptImages(files).at(0)
    if (!file) return
    setPercent(0)
    try {
      const res = await uploadLandingImage<LandingPost>(postId, slot, file, setPercent)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      onUpdated(res.data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setPercent(null)
    }
  }

  return (
    <section className={cn(cardClassName, 'space-y-3 p-5')}>
      <div>
        <h2 className={sectionTitleClassName}>{title}</h2>
        <p className={`mt-1 ${hintClassName}`}>{hint}</p>
      </div>
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-dashed border-(--line) bg-(--surface)',
          aspectClassName,
          dragOver && 'border-(--ink) ring-2 ring-(--ink)/20',
        )}
        onDragOver={(e) => {
          if (!canManage || !hasFiles(e)) return
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (canManage && percent === null) void upload(e.dataTransfer.files)
        }}
      >
        {src ? (
          <img
            src={src}
            alt=""
            className={cn('size-full', contain ? 'object-contain p-6' : 'object-cover')}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-(--muted)">
            <ImagePlus className="size-8" aria-hidden />
            <span className="text-sm">
              {canManage ? 'Drop an image here' : 'No image'}
            </span>
          </div>
        )}
        {percent !== null ? (
          <div className="absolute inset-x-3 bottom-3 rounded-md bg-white/95 p-2 shadow">
            <ProgressBar percent={percent} label={percent >= 100 ? 'Converting…' : 'Uploading…'} />
          </div>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={percent !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />
            {image ? 'Replace' : 'Choose image'}
          </Button>
          {image && onRemove ? (
            <Button
              variant="outline"
              size="sm"
              disabled={removing || percent !== null}
              onClick={async () => {
                setRemoving(true)
                try {
                  await onRemove()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to remove')
                } finally {
                  setRemoving(false)
                }
              }}
            >
              <X />
              Remove
            </Button>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-(--line)"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={cn(
            'h-full bg-(--ink) transition-[width] duration-150',
            percent >= 100 && 'animate-pulse',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function GallerySection({
  postId,
  gallery,
  canManage,
  onGalleryChange,
}: {
  postId: string
  gallery: LandingImage[]
  canManage: boolean
  onGalleryChange: (gallery: LandingImage[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef(gallery)
  galleryRef.current = gallery
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [batch, setBatch] = useState<{ total: number; done: number } | null>(null)
  const [fileOver, setFileOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const queueRef = useRef(queue)
  queueRef.current = queue
  // Free preview blobs of anything still queued when the page closes.
  useEffect(
    () => () => {
      for (const item of queueRef.current) URL.revokeObjectURL(item.preview)
    },
    [],
  )

  /** Update the ref at once so parallel uploads never append to a stale list. */
  const setGallery = (next: LandingImage[]) => {
    galleryRef.current = next
    onGalleryChange(next)
  }

  const patchItem = (key: string, patch: Partial<QueueItem>) =>
    setQueue((q) => q.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  async function saveOrder(next: LandingImage[]) {
    const before = galleryRef.current
    setGallery(next)
    try {
      const res = await landingApi.reorderGallery(postId, next.map((g) => g.id))
      if (!res.success) {
        toast.error(res.message)
        setGallery(before)
      }
    } catch {
      toast.error('Unable to reach the server')
      setGallery(before)
    }
  }

  async function uploadItems(items: QueueItem[]) {
    setBatch((b) => ({ total: (b?.total ?? 0) + items.length, done: b?.done ?? 0 }))
    const added: (LandingImage | null)[] = items.map(() => null)
    await runLimited(items, PARALLEL_UPLOADS, async (item, index) => {
      patchItem(item.key, { percent: 0, error: null })
      try {
        const res = await uploadLandingImage<LandingImage>(postId, 'gallery', item.file, (percent) =>
          patchItem(item.key, { percent }),
        )
        if (!res.success) {
          patchItem(item.key, { error: res.message || 'Upload failed' })
          return
        }
        added[index] = res.data
        setGallery([...galleryRef.current, res.data])
        URL.revokeObjectURL(item.preview)
        setQueue((q) => q.filter((x) => x.key !== item.key))
      } catch (error) {
        patchItem(item.key, {
          error: error instanceof Error ? error.message : 'Upload failed',
        })
      } finally {
        setBatch((b) => (b ? { ...b, done: b.done + 1 } : b))
      }
    })

    // Uploads finish in any order; put this batch back in the order it was picked.
    const newIds = new Set(added.filter((g) => g !== null).map((g) => g.id))
    const current = galleryRef.current
    const wanted = [
      ...current.filter((g) => !newIds.has(g.id)),
      ...added.filter((g): g is LandingImage => g !== null),
    ]
    if (wanted.some((g, i) => current[i]?.id !== g.id)) await saveOrder(wanted)
    setBatch((b) => (b && b.done >= b.total ? null : b))
  }

  function addFiles(files: FileList | File[]) {
    const accepted = acceptImages(files)
    if (accepted.length === 0) return
    const items = accepted.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      preview: URL.createObjectURL(file),
      percent: 0,
      error: null,
      file,
    }))
    setQueue((q) => [...q, ...items])
    void uploadItems(items)
  }

  async function removeImage(image: LandingImage) {
    setRemovingId(image.id)
    try {
      const res = await landingApi.removeGalleryImage(postId, image.id)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setGallery(galleryRef.current.filter((g) => g.id !== image.id))
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setRemovingId(null)
    }
  }

  const failed = queue.filter((q) => q.error)

  return (
    <section
      className={cn(
        cardClassName,
        'space-y-4 p-5',
        fileOver && 'ring-2 ring-(--ink)/30',
      )}
      onDragOver={(e) => {
        if (!canManage || !hasFiles(e)) return
        e.preventDefault()
        setFileOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setFileOver(false)
        if (canManage) addFiles(e.dataTransfer.files)
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={sectionTitleClassName}>Gallery · {gallery.length} photos</h2>
          <p className={`mt-1 ${hintClassName}`}>
            {canManage
              ? 'Drop or choose many photos at once. They are converted to WebP and compressed. Drag to reorder.'
              : 'Photos in website order.'}
          </p>
        </div>
        {canManage ? (
          <>
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <ImagePlus />
              Add photos
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </>
        ) : null}
      </div>

      {batch ? (
        <div className="rounded-md border border-(--line) p-3" aria-live="polite">
          <ProgressBar
            percent={Math.round((batch.done / batch.total) * 100)}
            label={`Uploaded ${batch.done} of ${batch.total}`}
          />
        </div>
      ) : null}

      {failed.length > 0 && !batch ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <CircleAlert className="size-4" />
          {failed.length} photo{failed.length === 1 ? '' : 's'} did not upload.
          <Button size="sm" variant="outline" onClick={() => void uploadItems(failed)}>
            <RotateCcw />
            Retry all
          </Button>
        </div>
      ) : null}

      {gallery.length === 0 && queue.length === 0 ? (
        <button
          type="button"
          disabled={!canManage}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-(--line) py-14 text-(--muted) hover:bg-(--surface) disabled:hover:bg-transparent"
        >
          <ImagePlus className="size-8" aria-hidden />
          <span className="text-sm">
            {canManage ? 'Drop photos here, or click to choose' : 'No photos yet'}
          </span>
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {gallery.map((image, index) => (
            <li
              key={image.id}
              draggable={canManage}
              onDragStart={(e) => {
                setDragIndex(index)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', image.id)
              }}
              onDragOver={(e) => {
                if (dragIndex === null || hasFiles(e)) return
                e.preventDefault()
                setOverIndex(index)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDrop={(e) => {
                if (dragIndex === null || hasFiles(e)) return
                e.preventDefault()
                e.stopPropagation()
                void saveOrder(moveItem(galleryRef.current, dragIndex, index))
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-md border border-(--line) bg-(--surface)',
                canManage && 'cursor-grab active:cursor-grabbing',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== index && 'ring-2 ring-(--ink)',
              )}
            >
              <img
                src={landingImageSrc(image) ?? ''}
                alt=""
                loading="lazy"
                draggable={false}
                className="size-full object-cover"
              />
              <span className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1.5 text-sm text-white tabular-nums">
                {index + 1}
              </span>
              {canManage ? (
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <div className="flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Move earlier"
                      disabled={index === 0}
                      onClick={() => void saveOrder(moveItem(gallery, index, index - 1))}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Move later"
                      disabled={index === gallery.length - 1}
                      onClick={() => void saveOrder(moveItem(gallery, index, index + 1))}
                    >
                      <ArrowRight />
                    </Button>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Remove photo"
                    disabled={removingId === image.id}
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void removeImage(image)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
          {queue.map((item) => (
            <li
              key={item.key}
              className="relative aspect-square overflow-hidden rounded-md border border-(--line)"
            >
              <img src={item.preview} alt="" className="size-full object-cover opacity-50" />
              <div className="absolute inset-x-1.5 bottom-1.5 rounded bg-white/95 p-1.5 shadow">
                {item.error ? (
                  <div className="flex items-center justify-between gap-1 text-sm text-red-700">
                    <span className="truncate" title={item.error}>
                      {item.error}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Dismiss ${item.name}`}
                      onClick={() => {
                        URL.revokeObjectURL(item.preview)
                        setQueue((q) => q.filter((x) => x.key !== item.key))
                      }}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <ProgressBar
                    percent={item.percent}
                    label={item.percent >= 100 ? 'Converting…' : item.name}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
