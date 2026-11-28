import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { TranslateParams } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import type { UUID } from '../types'
import {
  OFFLINE_ERROR_MESSAGE,
  isNetworkError,
  isOfflineError,
} from '../lib/network'
import { NotificationCenter } from '../components/NotificationCenter'
import { Toaster } from '../components/Toaster'

export type NotificationKind = 'success' | 'error' | 'info'

/**
 * Một thông báo trong ngăn thông báo.
 *
 * Tiêu đề lưu dạng khoá + tham số, dịch lúc hiển thị: đổi ngôn ngữ thì cả
 * thông báo cũ cũng đổi theo. `body` là chuỗi thô (câu lỗi của máy chủ, hay
 * ngày giờ của ca) nên giữ nguyên.
 */
export interface AppNotification {
  id: string
  kind: NotificationKind
  title: TranslationKey
  params?: TranslateParams
  body: string | null
  /**
   * Thân thông báo dạng khoá, dịch lúc hiển thị — cho câu do chính app viết
   * (ví dụ "đang offline"), khác với `body` là chữ thô của máy chủ.
   */
  bodyKey?: TranslationKey
  /** ISO timestamp */
  createdAt: string
  read: boolean
}

export interface NotifyInput {
  kind: NotificationKind
  title: TranslationKey
  params?: TranslateParams
  body?: string | null
  bodyKey?: TranslationKey
}

interface NotificationContextValue {
  items: AppNotification[]
  unreadCount: number
  /** Ids đang hiện popup ở góc, mới nhất cuối. */
  toasts: string[]
  notify: (input: NotifyInput) => void
  setRead: (id: string, read: boolean) => void
  markAllRead: () => void
  remove: (id: string) => void
  clearAll: () => void
  dismissToast: (id: string) => void
  centerOpen: boolean
  setCenterOpen: (open: boolean) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

/** Giữ ngần này thông báo gần nhất; cũ hơn thì bỏ để localStorage không phình. */
const MAX_ITEMS = 200
/** Popup chồng quá nhiều thì che mất trang — giữ mấy cái mới nhất. */
const MAX_TOASTS = 3

/**
 * Khoá theo người dùng: hai tài khoản dùng chung trình duyệt không thấy
 * thông báo của nhau. Chỉ nằm trên máy này, không đồng bộ đi đâu.
 */
function storageKey(userId: UUID): string {
  return `scheduler.notifications.${userId}`
}

/**
 * Xoá thông báo đã lưu của một người — thông báo có tên ca, ngày giờ, nên
 * người đã nghỉ việc (016) không được giữ lại trên máy.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function clearStoredNotifications(userId: UUID) {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    // Không có gì để xoá.
  }
}

function readStored(userId: UUID): AppNotification[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as AppNotification[]) : []
  } catch {
    return []
  }
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // randomUUID chỉ có trong secure context (https, localhost).
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export function NotificationProvider({
  userId,
  ephemeral = false,
  children,
}: {
  userId: UUID
  /**
   * Không đọc / ghi localStorage: chỉ popup trong phiên này. Cho người đã
   * nghỉ việc (016) — thông báo cũ có tên ca, giờ ca; đọc lên rồi ghi lại là
   * dựng lại thứ FormerStaffLayout vừa xoá.
   */
  ephemeral?: boolean
  children: ReactNode
}) {
  // Provider được mount lại theo `key={userId}`, nên đọc một lần là đủ.
  const [items, setItems] = useState<AppNotification[]>(() =>
    ephemeral ? [] : readStored(userId),
  )
  const [toasts, setToasts] = useState<string[]>([])
  const [centerOpen, setCenterOpen] = useState(false)

  useEffect(() => {
    if (ephemeral) return
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(items))
    } catch {
      // Đầy hoặc bị chặn: thông báo vẫn dùng được tới khi tải lại trang.
    }
  }, [userId, items, ephemeral])

  // Tab khác của cùng tài khoản vừa đổi danh sách: đọc lại cho khớp.
  useEffect(() => {
    if (ephemeral) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) setItems(readStored(userId))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [userId, ephemeral])

  const notify = useCallback((input: NotifyInput) => {
    const item: AppNotification = {
      id: newId(),
      kind: input.kind,
      title: input.title,
      params: input.params,
      body: input.body ?? null,
      bodyKey: input.bodyKey,
      createdAt: new Date().toISOString(),
      read: false,
    }
    setItems((prev) => [item, ...prev].slice(0, MAX_ITEMS))
    setToasts((prev) => [...prev, item.id].slice(-MAX_TOASTS))
  }, [])

  const setRead = useCallback((id: string, read: boolean) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)))
  }, [])

  const markAllRead = useCallback(() => {
    setItems((prev) =>
      prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev,
    )
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t !== id))
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id))
    setToasts((prev) => prev.filter((t) => t !== id))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
    setToasts([])
  }, [])

  const unreadCount = useMemo(
    () => items.reduce((n, item) => n + (item.read ? 0 : 1), 0),
    [items],
  )

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      toasts,
      notify,
      setRead,
      markAllRead,
      remove,
      clearAll,
      dismissToast,
      centerOpen,
      setCenterOpen,
    }),
    [
      items,
      unreadCount,
      toasts,
      notify,
      setRead,
      markAllRead,
      remove,
      clearAll,
      dismissToast,
      centerOpen,
    ],
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Mở ngăn thông báo thì popup thừa: mọi thứ đã nằm trong ngăn. */}
      {!centerOpen && <Toaster />}
      {centerOpen && <NotificationCenter onClose={() => setCenterOpen(false)} />}
    </NotificationContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx)
    throw new Error('useNotifications must be used inside <NotificationProvider>')
  return ctx
}

/**
 * Thân của thông báo lỗi. Lỗi mạng là câu của app (đã dịch): chưa gửi đi vì
 * offline, hay mất mạng giữa chừng (có thể đã lưu, có thể chưa). Còn lại là
 * câu nguyên văn của máy chủ.
 */
function errorBody(err: unknown): Pick<NotifyInput, 'body' | 'bodyKey'> {
  if (isOfflineError(err) || err === OFFLINE_ERROR_MESSAGE) {
    return { body: null, bodyKey: 'offline.notSent' }
  }
  if (err && isNetworkError(err)) {
    return { body: null, bodyKey: 'offline.lostConnection' }
  }
  return { body: err instanceof Error ? err.message : err ? String(err) : null }
}

/**
 * Báo kết quả một thao tác. Lỗi thì `body` là câu nguyên văn của máy chủ —
 * database là nơi quyết định, người dùng cần thấy đúng lý do nó từ chối.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useNotify() {
  const { notify } = useNotifications()
  return useMemo(
    () => ({
      notify,
      success: (title: TranslationKey, params?: TranslateParams, body?: string | null) =>
        notify({ kind: 'success', title, params, body }),
      error: (title: TranslationKey, err: unknown, params?: TranslateParams) =>
        notify({
          kind: 'error',
          title,
          params,
          ...errorBody(err),
        }),
    }),
    [notify],
  )
}
