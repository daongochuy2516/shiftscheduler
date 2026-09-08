import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Profile } from '../types'
import { auth } from './index'

interface AuthContextValue {
  user: Profile | null
  /** True until the initial session check finishes. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    auth.getSession().then((session) => {
      if (!active) return
      setUser(session)
      setLoading(false)
    })

    const unsubscribe = auth.onAuthChange((next) => {
      if (!active) return
      setUser(next)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(
    (email: string, password: string) => auth.signIn(email, password),
    [],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
    setUser(null)
  }, [])

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      auth.changePassword(currentPassword, newPassword),
    [],
  )

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, changePassword }),
    [user, loading, signIn, signOut, changePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
