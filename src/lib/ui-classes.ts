export const inputClassName = 'app-input px-2.5 py-1.5 text-sm'

/**
 * Inputs inside Dialog / AlertDialog: those portal outside the app theme
 * wrapper, so `.app-input` styles do not reach them.
 */
export const dialogInputClassName =
  'w-full rounded-md border border-(--line) bg-transparent px-3 py-2 text-sm'

export const inputClassNameCompact = 'app-input px-2 py-1 text-sm'

export const buttonClassName = 'app-button px-3.5 py-1.5 text-sm'

export const buttonClassNameFull = 'app-button w-full px-3 py-1.5 text-sm'

export const buttonOutlineClassName = 'app-button-outline px-3 py-1.5 text-sm'

export const cardClassName = 'app-card'

/** Page h1 — one per view. */
export const pageTitleClassName = 'text-page-title'

/** Section h2/h3 under the page title. */
export const sectionTitleClassName = 'text-section-title'

/** Normal body / field-label rhythm. */
export const bodyTextClassName = 'text-body'

/** Secondary helper under a title or field (one short sentence). */
export const hintClassName = 'text-hint'

/** Tiny meta: dates, version tags, uppercase eyebrows. */
export const metaTextClassName = 'text-meta'

/**
 * Shared content width for dashboard and admin Outlets.
 * Layout `main` owns horizontal padding; forms must not set competing mx-auto/max-w on their root.
 */
export const dashboardPageClassName =
  'w-full min-w-0 max-w-full space-y-8 text-(--ink)'

/** Alias — same shell as dashboard (admin + any authenticated app page). */
export const appPageClassName = dashboardPageClassName
