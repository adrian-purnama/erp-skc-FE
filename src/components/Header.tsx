import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RootMainMenu from '#/components/RootMainMenu'
import { useAuth } from '#/context/authContext'
import { useBranding } from '#/context/brandingContext'
import { cn } from '#/lib/utils'

const DRAWER_TRANSITION_MS = 300

export default function Header() {
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading, logout } = useAuth()
  const { appName, appLogo, openLogin, openRegister, firstRegister } =
    useBranding()
  const showLogin = openLogin
  const showRegister = openRegister || firstRegister
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const [menuAnimated, setMenuAnimated] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (menuOpen) {
      setMenuVisible(true)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setMenuAnimated(true))
      })
      return () => cancelAnimationFrame(frame)
    }

    setMenuAnimated(false)
    const timer = window.setTimeout(() => setMenuVisible(false), DRAWER_TRANSITION_MS)
    return () => window.clearTimeout(timer)
  }, [menuOpen])

  useEffect(() => {
    if (!menuVisible) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [menuVisible])

  function closeMenu() {
    setMenuOpen(false)
  }

  function openMenu() {
    setMenuOpen(true)
  }

  function handleLogout() {
    logout()
    setMenuOpen(false)
    void navigate({ to: '/login' })
  }

  const ctaOutlineClass =
    'rounded-[var(--radius-sm)] border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)] no-underline transition hover:border-[var(--ink)]'

  const ctaPrimaryClass =
    'rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white no-underline transition hover:opacity-90'

  // Client quotation verification pages are for outsiders: no app chrome.
  if (pathname.startsWith('/q/')) return null

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-white/95 text-[var(--ink)] backdrop-blur-sm">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2">
        <Link
          to="/dashboard"
          className="font-display inline-flex items-center gap-2 text-xl tracking-tight no-underline"
        >
          {appLogo ? (
            <img
              src={appLogo}
              alt={appName}
              className="size-7 origin-left scale-[1.75] object-contain"
            />
          ) : (
            appName
          )}
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          {isLoading ? null : isAuthenticated ? (
            <>
              <span className="max-w-48 truncate text-sm text-[var(--muted)]">
                {user?.email}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex cursor-pointer items-center justify-center bg-transparent px-2 text-[var(--ink)] transition hover:opacity-70"
                aria-label="Log out"
              >
                <LogOut className="size-5" aria-hidden />
              </button>
            </>
          ) : (
            <>
              {showLogin ? (
                <Link
                  to="/login"
                  className={ctaOutlineClass}
                  activeProps={{
                    className: cn(ctaOutlineClass, 'border-[var(--ink)]'),
                  }}
                >
                  Login
                </Link>
              ) : null}
              {showRegister ? (
                <Link
                  to="/register"
                  className={ctaPrimaryClass}
                  activeProps={{
                    className: cn(ctaPrimaryClass, 'opacity-90'),
                  }}
                >
                  Register
                </Link>
              ) : null}
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center text-[var(--ink)] md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={openMenu}
        >
          <Menu className="size-6" aria-hidden />
          <span className="sr-only">Open menu</span>
        </button>
      </nav>

      {mounted &&
        menuVisible &&
        createPortal(
          <div
            className={cn(
              'fixed inset-0 z-[100] md:hidden',
              menuAnimated ? 'pointer-events-auto' : 'pointer-events-none',
            )}
          >
            <button
              type="button"
              className={cn(
                'absolute inset-0 border-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 ease-out',
                menuAnimated ? 'opacity-100' : 'opacity-0',
              )}
              aria-label="Close menu"
              onClick={closeMenu}
            />

            <aside
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Root Main Menu"
              aria-hidden={!menuAnimated}
              className={cn(
                'absolute inset-y-0 right-0 z-10 flex w-[min(20rem,88vw)] flex-col rounded-l-[var(--radius-md)] border-l border-[var(--line)] bg-white text-[var(--ink)] shadow-2xl transition-transform duration-300 ease-out',
                menuAnimated ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xl tracking-tight">
                  {appLogo ? (
                    <img
                      src={appLogo}
                      alt={appName}
                      className="size-15 object-contain"
                    />
                  ) : (
                    appName
                  )}
                </span>
                <button
                  type="button"
                  className="inline-flex size-10 items-center justify-center text-[var(--ink)]"
                  onClick={closeMenu}
                >
                  <X className="size-6" aria-hidden />
                  <span className="sr-only">Close menu</span>
                </button>
              </div>

              <div className="flex flex-1 flex-col overflow-y-auto bg-white px-2 py-3">
                {isAuthenticated ? (
                  <>
                    <p className="mb-2 px-2 text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                      Root Main Menu
                    </p>
                    <RootMainMenu onNavigate={closeMenu} />
                  </>
                ) : null}
              </div>

              <div className="mt-auto border-t border-[var(--line)] bg-white p-4">
                {isLoading ? null : isAuthenticated ? (
                  <>
                    <p className="mb-3 truncate px-1 text-sm text-[var(--muted)]">
                      {user?.email}
                    </p>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="size-4" aria-hidden />
                      Log out
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    {showLogin ? (
                      <Link
                        to="/login"
                        className="block rounded-[var(--radius-sm)] border border-[var(--line)] bg-white px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] no-underline transition hover:border-[var(--ink)]"
                        onClick={closeMenu}
                      >
                        Login
                      </Link>
                    ) : null}
                    {showRegister ? (
                      <Link
                        to="/register"
                        className="block rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-3 text-center text-sm font-semibold text-white no-underline transition hover:opacity-90"
                        onClick={closeMenu}
                      >
                        Register
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </header>
  )
}
