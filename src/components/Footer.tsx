import { Link } from '@tanstack/react-router'
import { useBranding } from '#/context/brandingContext'

export default function Footer() {
  const year = new Date().getFullYear()
  const { appName } = useBranding()

  return (
    <footer className="border-t border-[var(--line)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap gap-6">
          <Link
            to="/login"
            className="text-sm text-[var(--muted)] no-underline transition hover:text-[var(--ink)]"
          >
            Login
          </Link>
          <Link
            to="/register"
            className="text-sm text-[var(--muted)] no-underline transition hover:text-[var(--ink)]"
          >
            Register
          </Link>
        </div>
        <p className="text-sm text-[var(--muted)]">
          &copy; {year} {appName}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
