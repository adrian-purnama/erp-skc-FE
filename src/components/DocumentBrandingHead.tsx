import { useEffect } from 'react'
import { useBranding } from '#/context/brandingContext'

function upsertMeta(
  attr: 'name' | 'property',
  key: string,
  content: string | null,
): void {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector) as HTMLMetaElement | null

  if (!content) {
    el?.remove()
    return
  }

  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertFavicon(href: string | null): void {
  let el = document.head.querySelector(
    'link[rel="icon"]',
  ) as HTMLLinkElement | null

  if (!href) {
    el?.remove()
    return
  }

  if (!el) {
    el = document.createElement('link')
    el.rel = 'icon'
    document.head.appendChild(el)
  }
  el.href = href
}

/** Syncs document title, meta description, favicon, and Open Graph tags from branding. */
export function DocumentBrandingHead() {
  const { ready, appName, description, appLogo } = useBranding()

  useEffect(() => {
    if (!ready) return

    document.title = appName
    upsertMeta('name', 'description', description || null)
    upsertMeta('property', 'og:title', appName)
    upsertMeta('property', 'og:description', description || null)
    upsertMeta('property', 'og:image', appLogo)
    upsertFavicon(appLogo)
  }, [ready, appName, description, appLogo])

  return null
}
