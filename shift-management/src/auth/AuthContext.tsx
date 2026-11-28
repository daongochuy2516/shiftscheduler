import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Account } from '../types'
import { clearOfflineData, setOfflineOwner } from '../data/offlineCache'
import { auth } from './index'

interface AuthContextValue {
  user: Account | null
  /** True until the initial session check finishes. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<string | null>
  /** Đọc lại hồ sơ của mình từ máy chủ (ngày nghỉ, tên…). */
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Ngồi yên trong tab thì đọc lại hồ sơ sau ngần này (một RPC nhỏ). */
const PROFILE_RECHECK_MS = 2 * 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // Chủ bản lưu offline phải có trước khi màn hình đầu tiên đọc dữ liệu,
    // nên đặt ngay ở đây chứ không trong effect của component con.
    auth.getSession().then((session) => {
      if (!active) return
      setOfflineOwner(session?.id ?? null)
      setUser(session)
      setLoading(false)
    })

    const unsubscribe = auth.onAuthChange((next) => {
      if (!active) return
      // Bị đăng xuất (tab khác, phiên bị thu hồi): không để lịch của người
      // đó nằm lại trên máy.
      if (next) setOfflineOwner(next.id)
      else void clearOfflineData()
      setUser(next)
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  /**
   * Đọc lại hồ sơ của mình: admin vừa đặt ngày nghỉ (016) hay đổi tên thì
   * giao diện theo kịp mà không phải đăng nhập lại. Chỉ nhận kết quả có
   * người — mất phiên thật thì onAuthChange đã lo, còn null ở đây có thể chỉ
   * là mạng chập chờn. Giữ nguyên object khi không đổi gì để không vẽ lại cả
   * app mỗi lần chuyển tab.
   */
  const refreshUser = useCallback(async () => {
    const next = await auth.getSession()
    if (!next) return
    setUser((prev) => {
      // Đã đăng xuất / đổi tài khoản: việc của onAuthChange.
      if (!prev || prev.id !== next.id) return prev
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    })
  }, [])

  // Quay lại tab là lúc dễ có thay đổi từ người khác nhất. Ngồi yên trong tab
  // thì cũng đọc lại định kỳ: ngày nghỉ đặt trong Supabase không đi qua
  // Realtime, không có vòng này thì người vừa nghỉ vẫn thấy giao diện cũ
  // (dù database đã trả rỗng và từ chối mọi thao tác) tới khi đổi tab.
  const signedIn = user !== null
  useEffect(() => {
    if (!signedIn) return
    const recheck = () => {
      if (document.visibilityState === 'visible') void refreshUser()
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    const id = window.setInterval(recheck, PROFILE_RECHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
      window.clearInterval(id)
    }
  }, [refreshUser, signedIn])

  const signIn = useCallback(
    (email: string, password: string) => auth.signIn(email, password),
    [],
  )

  const signOut = useCallback(async () => {
    await auth.signOut()
    await clearOfflineData()
    setUser(null)
  }, [])

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      auth.changePassword(currentPassword, newPassword),
    [],
  )

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, changePassword, refreshUser }),
    [user, loading, signIn, signOut, changePassword, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
