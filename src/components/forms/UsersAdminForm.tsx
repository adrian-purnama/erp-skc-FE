import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import toast from 'react-hot-toast'
import { LoaderCircle, Search } from 'lucide-react'
import ListPagination from '#/components/forms/shared/ListPagination'
import type { AdminUser } from '#/lib/adminUser'
import { apiFetch } from '#/lib/api'
import { DEFAULT_PAGE_SIZE, paginate } from '#/lib/pagination'
import { useDebouncedValue } from '#/lib/useDebouncedValue'
import {
  cardClassName,
  hintClassName,
  inputClassName,
} from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

export default function UsersAdminForm() {
  const [emailQuery, setEmailQuery] = useState('')
  const debouncedQuery = useDebouncedValue(emailQuery, 250)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const params = new URLSearchParams()
        const q = debouncedQuery.trim()
        if (q) params.set('email', q)
        const path = params.size
          ? `/admin/users?${params.toString()}`
          : '/admin/users'
        const response = await apiFetch<AdminUser[]>(path)
        if (!response.success || !response.data) {
          if (!cancelled) toast.error(response.message || 'Failed to load users')
          return
        }
        if (!cancelled) {
          setResults(response.data)
          setPage(1)
        }
      } catch {
        if (!cancelled) toast.error('Unable to reach the server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const { pageItems, totalPages, page: safePage } = useMemo(
    () => paginate(results, page, DEFAULT_PAGE_SIZE),
    [results, page],
  )

  useEffect(() => {
    if (safePage !== page) setPage(safePage)
  }, [safePage, page])

  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={emailQuery}
            onChange={(event) => setEmailQuery(event.target.value)}
            placeholder="Search email…"
            className={cn(inputClassName, 'pl-10')}
            autoComplete="off"
          />
        </div>

        {loading ? (
          <div className={`flex items-center gap-2 py-4 ${hintClassName}`}>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading users…
          </div>
        ) : results.length === 0 ? (
          <p className={`${cardClassName} px-4 py-8 text-center ${hintClassName}`}>
            {debouncedQuery.trim()
              ? `No users found for “${debouncedQuery.trim()}”.`
              : 'No users yet.'}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {pageItems.map((user) => (
                <li key={user.id}>
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: user.id }}
                    className={cn(
                      cardClassName,
                      'block w-full px-4 py-3 text-left no-underline transition hover:border-[var(--ink)]',
                    )}
                  >
                    <p className="font-medium text-[var(--ink)]">{user.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(user.roles ?? []).length === 0 ? (
                        <span className={hintClassName}>No roles</span>
                      ) : (
                        (user.roles ?? []).map((role) => (
                          <span
                            key={role}
                            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-xs text-[var(--ink)]"
                          >
                            {role}
                          </span>
                        ))
                      )}
                      {user.isBlocked ? (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          Blocked
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <ListPagination
              page={safePage}
              totalPages={totalPages}
              totalItems={results.length}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
    </div>
  )
}
