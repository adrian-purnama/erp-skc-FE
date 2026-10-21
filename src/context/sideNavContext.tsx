import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type SideNavMode = 'menu' | 'details'

type SideNavContextValue = {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  mode: SideNavMode
  setMode: (mode: SideNavMode) => void
  detailsSlot: ReactNode | null
  setDetailsSlot: (slot: ReactNode | null) => void
  hasDetails: boolean
}

const SideNavContext = createContext<SideNavContextValue | null>(null)

const COLLAPSED_KEY = 'side-nav-collapsed'

function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function SideNavProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const [mode, setMode] = useState<SideNavMode>('menu')
  const [detailsSlot, setDetailsSlot] = useState<ReactNode | null>(null)

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next)
    try {
      sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!detailsSlot) setMode('menu')
  }, [detailsSlot])

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      mode,
      setMode,
      detailsSlot,
      setDetailsSlot,
      hasDetails: detailsSlot !== null,
    }),
    [collapsed, setCollapsed, mode, detailsSlot],
  )

  return (
    <SideNavContext.Provider value={value}>{children}</SideNavContext.Provider>
  )
}

export function useSideNav(): SideNavContextValue {
  const ctx = useContext(SideNavContext)
  if (!ctx) {
    throw new Error('useSideNav must be used within SideNavProvider')
  }
  return ctx
}
