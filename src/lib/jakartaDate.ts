/** Jakarta calendar date YYYY-MM-DD for grouping post-lock adds. */
export function jakartaDateKey(when: Date | string): string {
  const d = typeof when === 'string' ? new Date(when) : when
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** e.g. "23 Oct 2026" from a YYYY-MM-DD (or any parseable) stamp. */
export function formatJakartaDateLabel(when: Date | string): string {
  const d = typeof when === 'string' ? new Date(when) : when
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}
