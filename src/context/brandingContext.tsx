import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { apiFetch, toAbsoluteMediaUrl } from '#/lib/api'

const DEFAULT_APP_NAME = 'Enterprise Resource Management'

export interface Branding {
  appName: string
  /** Absolute URL to the logo image, or null if none */
  appLogo: string | null
  openLogin: boolean
  openRegister: boolean
  firstRegister: boolean
}

interface BrandingContextValue extends Branding {
  ready: boolean
  refreshBranding: () => Promise<void>
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

const DEFAULT_BRANDING: Branding = {
  appName: DEFAULT_APP_NAME,
  appLogo: null,
  openLogin: true,
  openRegister: true,
  firstRegister: false,
}

async function fetchBranding(): Promise<Branding> {
  try {
    const body = await apiFetch<{
      appName: string
      appLogo: string | null
      openLogin: boolean
      openRegister: boolean
      firstRegister: boolean
    }>('/app-config/branding')

    if (!body.success || !body.data) {
      return DEFAULT_BRANDING
    }

    return {
      appName: body.data.appName || DEFAULT_APP_NAME,
      appLogo: toAbsoluteMediaUrl(body.data.appLogo),
      openLogin: body.data.openLogin ?? true,
      openRegister: body.data.openRegister ?? true,
      firstRegister: body.data.firstRegister ?? false,
    }
  } catch {
    return DEFAULT_BRANDING
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)
  const [ready, setReady] = useState(false)

  const refreshBranding = useCallback(async () => {
    const result = await fetchBranding()
    setBranding(result)
    setReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchBranding().then((result) => {
      if (!cancelled) {
        setBranding(result)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <BrandingContext.Provider value={{ ...branding, ready, refreshBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding(): BrandingContextValue {
  const context = useContext(BrandingContext)
  if (!context) {
    throw new Error('useBranding must be used within BrandingProvider')
  }
  return context
}
