import { apiFetch, apiUploadWithProgress, toAbsoluteMediaUrl } from '#/lib/api'
import type { ApiResponseDto } from '#/lib/api'

export type LandingImage = {
  id: string
  url: string
  width: number
  height: number
}

export type LandingCategory = {
  id: string
  slug: string
  label: string
  sortOrder: number
  postCount: number
}

export type LandingPost = {
  id: string
  categoryId: string
  slug: string
  title: string
  place: string
  featured: boolean
  published: boolean
  cover: LandingImage | null
  logo: LandingImage | null
  gallery: LandingImage[]
  updatedAt: string | null
}

export type LandingPostInput = {
  categoryId: string
  title: string
  place: string
  slug: string
  featured: boolean
  published: boolean
}

/** Biggest file the server accepts; it converts everything to WebP. */
export const LANDING_MAX_UPLOAD_MB = 40

export function landingImageSrc(image: LandingImage | null): string | null {
  return image ? toAbsoluteMediaUrl(image.url) : null
}

/** "Bali International Hospital" → "bali-international-hospital". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const landingApi = {
  listCategories: () => apiFetch<LandingCategory[]>('/landing/categories'),
  createCategory: (body: { label: string; slug: string }) =>
    apiFetch<LandingCategory>('/landing/categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (id: string, body: { label?: string; slug?: string }) =>
    apiFetch<null>(`/landing/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteCategory: (id: string) =>
    apiFetch<null>(`/landing/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids: string[]) =>
    apiFetch<null>('/landing/categories/order', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),

  listPosts: () => apiFetch<LandingPost[]>('/landing/posts'),
  getPost: (id: string) => apiFetch<LandingPost>(`/landing/posts/${id}`),
  createPost: (body: LandingPostInput) =>
    apiFetch<LandingPost>('/landing/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePost: (id: string, body: Partial<LandingPostInput>) =>
    apiFetch<LandingPost>(`/landing/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePost: (id: string) =>
    apiFetch<null>(`/landing/posts/${id}`, { method: 'DELETE' }),

  removeLogo: (id: string) =>
    apiFetch<LandingPost>(`/landing/posts/${id}/logo`, { method: 'DELETE' }),
  removeGalleryImage: (id: string, imageId: string) =>
    apiFetch<null>(`/landing/posts/${id}/gallery/${imageId}`, {
      method: 'DELETE',
    }),
  reorderGallery: (id: string, ids: string[]) =>
    apiFetch<LandingPost>(`/landing/posts/${id}/gallery/order`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }),
}

/** Upload one file to a post image slot, reporting 0–100 while bytes are sent. */
export function uploadLandingImage<T>(
  postId: string,
  slot: 'cover' | 'logo' | 'gallery',
  file: File,
  onProgress: (percent: number) => void,
): Promise<ApiResponseDto<T>> {
  const form = new FormData()
  form.append('file', file)
  return apiUploadWithProgress<T>(`/landing/posts/${postId}/${slot}`, form, {
    onProgress,
  })
}

/** Run `work` over `items` with at most `limit` running at once. */
export async function runLimited<T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await work(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
}

/** Move the item at `from` to `to`, returning a new array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(Math.min(to, copy.length), 0, item)
  return copy
}
