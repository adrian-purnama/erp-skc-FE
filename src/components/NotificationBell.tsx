import { useRouter } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '#/lib/notifications'

const POLL_MS = 45_000

type NotificationBellProps = {
  className?: string
  /** Called after a notification with a link is activated (e.g. close mobile drawer). */
  onNavigate?: () => void
}

export default function NotificationBell({
  className,
  onNavigate,
}: NotificationBellProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loadingList, setLoadingList] = useState(false)

  const refreshUnread = useCallback(async () => {
    const res = await fetchUnreadNotificationCount()
    if (res.success && res.data) {
      setUnreadCount(res.data.unreadCount)
    }
  }, [])

  const refreshList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetchNotifications(20)
      if (res.success && res.data) {
        setItems(res.data.items)
        setUnreadCount(res.data.unreadCount)
      }
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void refreshUnread()
    const timer = window.setInterval(() => {
      void refreshUnread()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [refreshUnread])

  useEffect(() => {
    if (!open) return
    void refreshList()
  }, [open, refreshList])

  async function handleMarkAll() {
    const res = await markAllNotificationsRead()
    if (!res.success) return
    setUnreadCount(0)
    setItems((prev) =>
      prev.map((item) =>
        item.readAt
          ? item
          : { ...item, readAt: new Date().toISOString() },
      ),
    )
  }

  async function handleItemActivate(item: NotificationItem) {
    if (!item.readAt) {
      const res = await markNotificationRead(item.id)
      if (res.success) {
        const readAt = res.data?.readAt ?? new Date().toISOString()
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, readAt } : row,
          ),
        )
        setUnreadCount((n) => Math.max(0, n - 1))
      }
    }
    if (item.link) {
      setOpen(false)
      onNavigate?.()
      router.history.push(item.link)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative inline-flex cursor-pointer items-center justify-center bg-transparent text-[var(--muted)] transition hover:text-[var(--ink)]',
            className,
          )}
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          title="Notifications"
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className="absolute top-0 right-0 size-2 rounded-full bg-red-500 ring-2 ring-white"
              aria-hidden
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Notifications
          </p>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              className="cursor-pointer bg-transparent text-xs font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              Mark all as read
            </button>
          ) : null}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loadingList && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
              No notifications yet
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {items.map((item) => {
                const unread = !item.readAt
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleItemActivate(item)}
                      className={cn(
                        'block w-full cursor-pointer bg-transparent px-3 py-2.5 text-left transition hover:bg-[var(--surface)]',
                        unread && 'bg-[var(--surface)]/60',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            'text-sm text-[var(--ink)]',
                            unread ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {item.title}
                        </p>
                        {unread ? (
                          <span
                            className="mt-1 size-1.5 shrink-0 rounded-full bg-red-500"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
                        {item.body}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {formatNotificationTime(item.createdAt)}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
