import { apiFetch } from '#/lib/api'

export interface NotificationItem {
  id: string
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationListData {
  items: NotificationItem[]
  unreadCount: number
}

export interface NotificationUnreadCountData {
  unreadCount: number
}

export async function fetchNotifications(limit = 20) {
  return apiFetch<NotificationListData>(`/notifications?limit=${limit}`)
}

export async function fetchUnreadNotificationCount() {
  return apiFetch<NotificationUnreadCountData>('/notifications/unread-count')
}

export async function markNotificationRead(id: string) {
  return apiFetch<{ id: string; readAt: string }>(
    `/notifications/${id}/read`,
    { method: 'PATCH' },
  )
}

export async function markAllNotificationsRead() {
  return apiFetch<{ updated: number }>('/notifications/read-all', {
    method: 'POST',
  })
}

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) {
    const n = Math.floor(diffMs / minute)
    return `${n}m ago`
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour)
    return `${n}h ago`
  }
  if (diffMs < 7 * day) {
    const n = Math.floor(diffMs / day)
    return `${n}d ago`
  }
  return date.toLocaleDateString()
}
