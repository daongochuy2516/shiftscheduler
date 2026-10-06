import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import {
  useNotifications,
  type AppNotification,
} from '../notifications/NotificationContext'
import { NotificationIcon } from './NotificationCenter'

/** Lỗi ở lâu hơn: người dùng cần đọc kịp lý do máy chủ từ chối. */
const TOAST_MS: Record<AppNotification['kind'], number> = {
  success: 5000,
  info: 5000,
  error: 10000,
}

/**
 * Popup ở góc khi có kết quả từ máy chủ. Đóng popup không xoá thông báo — nó
 * vẫn nằm (chưa đọc) trong ngăn thông báo, giống Action Center của Windows.
 *
 * Mobile: hiện ở trên, vì đáy màn hình đã là thanh điều hướng và nút nổi.
 * Từ 640px: góc trên bên phải, ngay dưới header (`--app-header-h`, AppLayout
 * đo) để không che nút chuông và tài khoản.
 * Mới nhất nằm trên cùng. z-[60] để nổi trên cả hộp thoại (z-50) — lỗi lưu
 * ca phải thấy được khi form còn mở.
 */
export function Toaster() {
  const { items, toasts } = useNotifications()
  const visible = toasts
    .map((id) => items.find((n) => n.id === id))
    .filter((n): n is AppNotification => n !== undefined)
    .reverse()

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-0 sm:items-end sm:px-5 sm:pt-[calc(var(--app-header-h,4rem)+0.75rem)]"
    >
      {visible.map((n) => (
        <Toast key={n.id} item={n} />
      ))}
    </div>
  )
}

function Toast({ item }: { item: AppNotification }) {
  const { t } = useI18n()
  const { dismissToast, setRead, setCenterOpen } = useNotifications()
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const id = setTimeout(() => dismissToast(item.id), TOAST_MS[item.kind])
    return () => clearTimeout(id)
  }, [paused, item.id, item.kind, dismissToast])

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-slate-900/10"
    >
      <NotificationIcon kind={item.kind} />
      {/* Bấm vào nội dung: mở ngăn thông báo và coi như đã xem. */}
      <button
        type="button"
        onClick={() => {
          setRead(item.id, true)
          setCenterOpen(true)
        }}
        className="min-w-0 flex-1 text-left"
      >
        <p className="text-sm font-semibold text-slate-900">
          {t(item.title, item.params)}
        </p>
        {item.body && (
          <p
            className={`mt-0.5 line-clamp-3 text-sm break-words ${
              item.kind === 'error' ? 'text-rose-700' : 'text-slate-600'
            }`}
          >
            {item.body}
          </p>
        )}
      </button>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label={t('notif.dismiss')}
        className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
