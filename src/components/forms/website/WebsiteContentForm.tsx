import { useCallback, useEffect, useMemo, useState  } from 'react'
import type {FormEvent} from 'react';
import { useNavigate } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import {
  Check,
  FolderTree,
  GripVertical,
  Image as ImageIcon,
  Images,
  MapPin,
  Pencil,
  Plus,
  Star,
  Tag,
  ToggleRight,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import ConfirmDeleteDialog from '#/components/forms/website/ConfirmDeleteDialog'
import ListTable, {
  ListChip
  
} from '#/components/forms/shared/ListTable'
import type {ListTableColumn} from '#/components/forms/shared/ListTable';
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useAuth } from '#/context/authContext'
import {
  landingApi,
  landingImageSrc,
  moveItem,
  slugify
  
  
} from '#/lib/landing'
import type {LandingCategory, LandingPost} from '#/lib/landing';
import {
  hintClassName,
  inputClassName,
  pageTitleClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

const emptyPost = { title: '', place: '', categoryId: '', slug: '' }

export default function WebsiteContentForm() {
  const { can } = useAuth()
  const canManage = can('landing.manage')
  const navigate = useNavigate()

  const [tab, setTab] = useState<'posts' | 'categories'>('posts')
  const [posts, setPosts] = useState<LandingPost[]>([])
  const [categories, setCategories] = useState<LandingCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const [creating, setCreating] = useState(false)
  const [postForm, setPostForm] = useState(emptyPost)
  const [postErrors, setPostErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [postRes, catRes] = await Promise.all([
        landingApi.listPosts(),
        landingApi.listCategories(),
      ])
      if (!postRes.success || !catRes.success) {
        toast.error(postRes.message || catRes.message || 'Failed to load')
        return
      }
      setPosts(postRes.data)
      setCategories(catRes.data)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const order = new Map(categories.map((c, i) => [c.id, i]))
    return posts
      .filter((p) => categoryFilter === 'all' || p.categoryId === categoryFilter)
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.place.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          (order.get(a.categoryId) ?? 99) - (order.get(b.categoryId) ?? 99) ||
          a.title.localeCompare(b.title),
      )
  }, [posts, categories, query, categoryFilter])

  function openCreate() {
    if (categories.length === 0) {
      toast.error('Add a category first')
      setTab('categories')
      return
    }
    setPostForm({
      ...emptyPost,
      categoryId:
        categoryFilter !== 'all' ? categoryFilter : (categories[0]?.id ?? ''),
    })
    setPostErrors({})
    setCreating(true)
  }

  async function onCreatePost(event: FormEvent) {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (!postForm.title.trim()) errors.title = 'Title is required'
    if (!postForm.place.trim()) errors.place = 'Place is required'
    if (!postForm.categoryId) errors.categoryId = 'Pick a category'
    setPostErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    try {
      const res = await landingApi.createPost({
        categoryId: postForm.categoryId,
        title: postForm.title.trim(),
        place: postForm.place.trim(),
        slug: postForm.slug.trim(),
        featured: false,
        published: false,
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Post created. Add its cover and photos.')
      setCreating(false)
      void navigate({
        to: '/dashboard/website/$postId',
        params: { postId: res.data.id },
      })
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setSaving(false)
    }
  }

  const columns = useMemo<ListTableColumn<LandingPost>[]>(
    () => [
      {
        header: 'Cover',
        icon: ImageIcon,
        widthClassName: 'w-24',
        cellClassName: 'py-1.5',
        cell: (post) => {
          const src = landingImageSrc(post.cover)
          return src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              className="h-12 w-18 rounded object-cover"
            />
          ) : (
            <span className="text-sm text-amber-700">No cover</span>
          )
        },
      },
      {
        header: 'Title',
        icon: Type,
        widthClassName: 'min-w-[14rem]',
        cell: (post) => (
          <span className="font-medium">
            {post.title}
            {post.featured ? (
              <Star
                className="ml-1.5 inline size-3.5 fill-amber-400 text-amber-500"
                aria-label="Featured"
              />
            ) : null}
          </span>
        ),
      },
      {
        header: 'Place',
        icon: MapPin,
        widthClassName: 'min-w-[10rem]',
        cell: (post) => post.place,
      },
      {
        header: 'Category',
        icon: Tag,
        widthClassName: 'w-48',
        cell: (post) => categoryById.get(post.categoryId)?.label ?? '—',
      },
      {
        header: 'Photos',
        icon: Images,
        align: 'right',
        widthClassName: 'w-24',
        cellClassName: 'tabular-nums',
        cell: (post) => post.gallery.length,
      },
      {
        header: 'Status',
        icon: ToggleRight,
        widthClassName: 'w-32',
        cell: (post) =>
          post.published && post.cover ? (
            <ListChip tone="success">On website</ListChip>
          ) : (
            <ListChip tone="neutral">Draft</ListChip>
          ),
      },
    ],
    [categoryById],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className={pageTitleClassName}>Website content</h1>
        <p className={`mt-2 ${hintClassName}`}>
          Projects on the public website. Changes show after the website
          rebuilds.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'posts' | 'categories')}
      >
        <TabsList>
          <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="categories">
            Categories ({categories.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <ListTable
            loading={loading}
            loadingLabel="Loading posts…"
            search={{
              value: query,
              onChange: setQuery,
              placeholder: 'Search title or place',
            }}
            toolbarStart={
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger size="sm" className="w-56" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            addAction={
              canManage ? { label: 'New post', onClick: openCreate } : undefined
            }
            empty={
              posts.length === 0
                ? 'No posts yet. Create one to put a project on the website.'
                : 'No posts match.'
            }
            columns={columns}
            rows={filtered}
            rowKey={(post) => post.id}
            minWidthClassName="min-w-[760px]"
            isRowMuted={(post) => !post.published || !post.cover}
            onRowClick={(post) =>
              void navigate({
                to: '/dashboard/website/$postId',
                params: { postId: post.id },
              })
            }
          />
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager
            categories={categories}
            canManage={canManage}
            onChange={setCategories}
            onReload={load}
          />
        </TabsContent>
      </Tabs>

      <Sheet open={creating} onOpenChange={(open) => !saving && setCreating(open)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>New post</SheetTitle>
            <SheetDescription>
              You add the cover and photos on the next screen.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onCreatePost} className="space-y-4 px-4 pb-4" noValidate>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Title</span>
              <Input
                className={cn(inputClassName, postErrors.title && 'border-red-500')}
                value={postForm.title}
                onChange={(e) =>
                  setPostForm((p) => ({ ...p, title: e.target.value }))
                }
                placeholder="e.g. Bali International Hospital"
                autoFocus
              />
              {postErrors.title ? (
                <span className="text-sm text-red-600">{postErrors.title}</span>
              ) : null}
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Place</span>
              <Input
                className={cn(inputClassName, postErrors.place && 'border-red-500')}
                value={postForm.place}
                onChange={(e) =>
                  setPostForm((p) => ({ ...p, place: e.target.value }))
                }
                placeholder="e.g. Denpasar, Bali"
              />
              {postErrors.place ? (
                <span className="text-sm text-red-600">{postErrors.place}</span>
              ) : null}
            </label>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Category</span>
              <Select
                value={postForm.categoryId}
                onValueChange={(v) => setPostForm((p) => ({ ...p, categoryId: v }))}
              >
                <SelectTrigger className="w-full" aria-label="Category">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {postErrors.categoryId ? (
                <span className="text-sm text-red-600">
                  {postErrors.categoryId}
                </span>
              ) : null}
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Link name</span>
              <Input
                className={inputClassName}
                value={postForm.slug}
                onChange={(e) =>
                  setPostForm((p) => ({ ...p, slug: e.target.value }))
                }
                placeholder={slugify(postForm.title) || 'made from the title'}
              />
              <span className={hintClassName}>
                Leave blank to make it from the title.
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create post'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function CategoryManager({
  categories,
  canManage,
  onChange,
  onReload,
}: {
  categories: LandingCategory[]
  canManage: boolean
  onChange: (next: LandingCategory[]) => void
  onReload: () => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ id: string; label: string; slug: string } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LandingCategory | null>(null)
  const [busy, setBusy] = useState(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!label.trim()) return
    setAdding(true)
    try {
      const res = await landingApi.createCategory({ label: label.trim(), slug: '' })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      onChange([...categories, res.data])
      setLabel('')
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setAdding(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    setBusy(true)
    try {
      const res = await landingApi.updateCategory(editing.id, {
        label: editing.label,
        slug: editing.slug,
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      onChange(
        categories.map((c) =>
          c.id === editing.id
            ? { ...c, label: editing.label.trim(), slug: editing.slug.trim() || slugify(editing.label) }
            : c,
        ),
      )
      setEditing(null)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  async function reorder(from: number, to: number) {
    const next = moveItem(categories, from, to)
    if (next === categories) return
    onChange(next)
    try {
      const res = await landingApi.reorderCategories(next.map((c) => c.id))
      if (!res.success) {
        toast.error(res.message)
        await onReload()
      }
    } catch {
      toast.error('Unable to reach the server')
      await onReload()
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    try {
      const res = await landingApi.deleteCategory(pendingDelete.id)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      onChange(categories.filter((c) => c.id !== pendingDelete.id))
      setPendingDelete(null)
    } catch {
      toast.error('Unable to reach the server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className={hintClassName}>
        The website shows category filters in this order. Drag to reorder.
      </p>

      {canManage ? (
        <form onSubmit={add} className="flex max-w-lg gap-2">
          <Input
            className={inputClassName}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New category, e.g. Healthcare"
            aria-label="New category name"
          />
          <Button type="submit" disabled={adding || !label.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      ) : null}

      {categories.length === 0 ? (
        <p className={hintClassName}>No categories yet.</p>
      ) : (
        <ul className="max-w-3xl divide-y divide-(--line) rounded-md border border-(--line)">
          {categories.map((category, index) => {
            const isEditing = editing?.id === category.id
            return (
              <li
                key={category.id}
                draggable={canManage && !isEditing}
                onDragStart={(e) => {
                  setDragIndex(index)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (dragIndex === null) return
                  e.preventDefault()
                  setOverIndex(index)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) void reorder(dragIndex, index)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5',
                  dragIndex === index && 'opacity-40',
                  overIndex === index && dragIndex !== index && 'bg-(--surface)',
                )}
              >
                {canManage ? (
                  <GripVertical
                    className="size-4 shrink-0 cursor-grab text-(--muted)"
                    aria-hidden
                  />
                ) : (
                  <FolderTree className="size-4 shrink-0 text-(--muted)" aria-hidden />
                )}
                {isEditing ? (
                  <div className="flex flex-1 flex-wrap gap-2">
                    <Input
                      className={cn(inputClassName, 'min-w-48 flex-1')}
                      value={editing.label}
                      onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                      aria-label="Category name"
                      autoFocus
                    />
                    <Input
                      className={cn(inputClassName, 'w-56 font-mono')}
                      value={editing.slug}
                      onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                      aria-label="Link name"
                    />
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{category.label}</p>
                    <p className="text-sm text-(--muted)">
                      /projects/{category.slug} · {category.postCount} post
                      {category.postCount === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
                {canManage ? (
                  <div className="flex shrink-0 gap-1.5">
                    {isEditing ? (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => void saveEdit()}>
                          <Check />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditing(null)}
                        >
                          <X />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditing({
                              id: category.id,
                              label: category.label,
                              slug: category.slug,
                            })
                          }
                        >
                          <Pencil />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setPendingDelete(category)}
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDeleteDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.label ?? 'category'}?`}
        description={
          pendingDelete && pendingDelete.postCount > 0
            ? `It still has ${pendingDelete.postCount} post${pendingDelete.postCount === 1 ? '' : 's'}. Move or delete them first.`
            : 'The category disappears from the website filters.'
        }
        busy={busy}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
