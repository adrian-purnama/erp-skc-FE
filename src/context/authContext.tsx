import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { API_BASE_URL, type ApiResponseDto } from '#/lib/api'

const TOKEN_KEY = 'sapai_token'

export interface AuthUser {
  email: string
  roles: string[]
  permissions: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  can: (key: string) => boolean
  canAny: (keys: string[]) => boolean
  login: (jwt: string) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

let cachedUser: AuthUser | null | undefined
let bootstrapPromise: Promise<AuthUser | null> | null = null

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

function setToken(jwt: string): void {
  localStorage.setItem(TOKEN_KEY, jwt)
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  invalidateAuthCache()
}

function invalidateAuthCache(): void {
  cachedUser = undefined
  bootstrapPromise = null
}

function setCachedUser(user: AuthUser | null): void {
  cachedUser = user
}

function canFromUser(user: AuthUser | null | undefined, key: string): boolean {
  if (!user) return false
  return user.permissions.includes('*') || user.permissions.includes(key)
}

function canAnyFromUser(
  user: AuthUser | null | undefined,
  keys: string[],
): boolean {
  return keys.some((key) => canFromUser(user, key))
}

async function fetchValidatedUser(): Promise<AuthUser | null> {
  const token = getToken()
  if (!token) return null

  try {
    const response = await fetch(`${API_BASE_URL}/auth/validate`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    const body = (await response.json()) as ApiResponseDto<AuthUser>

    if (!response.ok || !body.success || !body.data?.email) {
      clearToken()
      return null
    }

    return {
      email: body.data.email,
      roles: body.data.roles ?? [],
      permissions: body.data.permissions ?? [],
    }
  } catch {
    return null
  }
}

export async function bootstrapAuth(): Promise<AuthUser | null> {
  if (cachedUser !== undefined) return cachedUser

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const user = await fetchValidatedUser()
      setCachedUser(user)
      return user
    })().finally(() => {
      bootstrapPromise = null
    })
  }

  return bootstrapPromise
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshAuth = useCallback(async () => {
    invalidateAuthCache()
    const validatedUser = await bootstrapAuth()
    setUser(validatedUser)
    return validatedUser
  }, [])

  useEffect(() => {
    let cancelled = false

    void bootstrapAuth().then((result) => {
      if (!cancelled) {
        setUser(result)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function login(jwt: string) {
    setToken(jwt)
    invalidateAuthCache()
    const validatedUser = await bootstrapAuth()
    setUser(validatedUser)
  }

  function logout() {
    clearToken()
    setCachedUser(null)
    setUser(null)
  }

  const can = useCallback((key: string) => canFromUser(user, key), [user])

  const canAny = useCallback(
    (keys: string[]) => canAnyFromUser(user, keys),
    [user],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        can,
        canAny,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export { canFromUser, canAnyFromUser }
