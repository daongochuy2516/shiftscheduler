import { useEffect, useMemo, useRef, useState } from 'react'
import {
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from 'date-fns'
import {
  BellOff,
  CheckCheck,
  CheckCircle2,
  Info,
  Mail,
  MailOpen,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { scrollRoot } from '../lib/scrollRoot'
import { toDateKey } from '../lib/time'
import { useExitAnimation } from './useExitAnimation'
import {
  useNotifications,
  type AppNotification,
  type NotificationKind,
} from '../notifications/NotificationContext'

const ICONS: Record<
  NotificationKind,
  { Icon: typeof Info; className: string }
> = {
  success: { Icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  error: { Icon: XCircle, className: 'bg-rose-50 text-rose-600' },
  info: { Icon: Info, className: 'bg-sky-50 text-sky-600' },
}

// eslint-disable-next-line react-refresh/only-export-components
export function NotificationIcon({ kind }: { kind: NotificationKind }) {
  const { Icon, className } = ICONS[kind]
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${className}`}
    >
      <Icon className="h-4.5 w-4.5" />
    </span>
  )
}

/**
 * Ngăn thông báo, kiểu Action Center của Windows: trượt ra từ mép phải, liệt
 * kê mọi kết quả thao tác đã nhận, xem lại / đánh dấu đã đọc / xoá được.
 *
 * Mobile: chiếm cả màn hình. Từ 640px: một cột rộng 24rem bên phải.
 */
export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const { t, dateLocale } = useI18n()
  const { items, unreadCount, setRead, markAllRead, remove, clearAll } =
    useNotifications()

  const rootRef = useRef<HTMLDivElement>(null)
  useExitAnimation(rootRef, 260)

  // Giờ tương đối ("5 phút trước") phải tự nhích khi ngăn đang mở.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Như Modal: Esc để đóng, khoá cuộn trang phía sau.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const locked = [document.documentElement, scrollRoot()].filter(
      (el): el is HTMLElement => el !== null,
    )
    const previous = locked.map((el) => el.style.overflow)
    locked.forEach((el) => (el.style.overflow = 'hidden'))
    return () => {
      document.removeEventListener('keydown', onKey)
      locked.forEach((el, i) => (el.style.overflow = previous[i]))
    }
  }, [onClose])

  const groups = useMemo(() => {
    const byDay = new Map<string, AppNotification[]>()
    for (const item of items) {
      const key = toDateKey(new Date(item.createdAt))
      const list = byDay.get(key) ?? []
      list.push(item)
      byDay.set(key, list)
    }
    return [...byDay.entries()]
  }, [items])

  function dayHeading(createdAt: string): string {
    const d = new Date(createdAt)
    if (isToday(d)) return t('list.today')
    if (isYesterday(d)) return t('list.yesterday')
    return format(d, 'EEEE, d/M/yyyy', { locale: dateLocale })
  }

  function relativeTime(createdAt: string): string {
    const d = new Date(createdAt)
    if (differenceInMinutes(now, d) < 1) return t('notif.justNow')
    return formatDistanceToNowStrict(d, { addSuffix: true, locale: dateLocale })
  }

  const toolButton =
    'inline-flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40 sm:min-h-0 sm:py-1.5'

  return (
    <div ref={rootRef} className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onMouseDown={onClose}
        className="modal-backdrop absolute inset-0 bg-slate-900/30 backdrop-blur-[1px] dark:bg-black/50"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('notif.title')}
        className="drawer-panel absolute inset-y-0 right-0 flex w-full flex-col bg-slate-50 shadow-2xl ring-1 ring-slate-900/10 sm:w-[24rem]"
      >
        <header
          className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {t('notif.title')}
            </h2>
            <p className="text-sm text-slate-500">
              {unreadCount > 0
                ? t('notif.unread', { count: unreadCount })
                : t('notif.allRead')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:h-9 sm:w-9"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-1">
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className={toolButton}
          >
            <CheckCheck className="h-4 w-4" />
            {t('notif.markAllRead')}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={items.length === 0}
            className={`${toolButton} ml-auto`}
          >
            <Trash2 className="h-4 w-4" />
            {t('notif.clearAll')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <BellOff className="h-7 w-7 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">
                {t('notif.empty')}
              </p>
              <p className="text-sm text-slate-500">{t('notif.emptyHint')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(([day, list]) => (
                <section key={day}>
                  {/* Chỉ viết hoa chữ đầu: "capitalize" sẽ ra "Hôm Nay". */}
                  <h3 className="mb-1.5 px-1 text-xs font-semibold text-slate-500 first-letter:uppercase">
                    {dayHeading(list[0].createdAt)}
                  </h3>
                  <ul className="space-y-2">
                    {list.map((item) => (
                      <li
                        key={item.id}
                        className={`group flex items-start gap-3 rounded-lg p-3 shadow-xs ring-1 transition ${
                          item.read
                            ? 'bg-white ring-slate-200'
                            : 'bg-indigo-50 ring-indigo-200'
                        }`}
                      >
                        <NotificationIcon kind={item.kind} />
                        <button
                          type="button"
                          onClick={() => setRead(item.id, true)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p
                            className={`text-sm text-slate-900 ${
                              item.read ? 'font-medium' : 'font-semibold'
                            }`}
                          >
                            {t(item.title, item.params)}
                          </p>
                          {item.body && (
                            <p
                              className={`mt-0.5 text-sm break-words whitespace-pre-line ${
                                item.kind === 'error'
                                  ? 'text-rose-700'
                                  : 'text-slate-600'
                              }`}
                            >
                              {item.body}
                            </p>
                          )}
                          <p
                            className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"
                            title={format(
                              new Date(item.createdAt),
                              'HH:mm:ss d/M/yyyy',
                            )}
                          >
                            {!item.read && (
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                            )}
                            {relativeTime(item.createdAt)}
                          </p>
                        </button>

                        {/* Chuột: hiện khi rê vào. Màn cảm ứng không có rê
                            chuột nên luôn hiện. */}
                        <div className="-my-1 -mr-1 flex shrink-0 flex-col transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setRead(item.id, !item.read)}
                            aria-label={t(
                              item.read ? 'notif.markUnread' : 'notif.markRead',
                            )}
                            title={t(
                              item.read ? 'notif.markUnread' : 'notif.markRead',
                            )}
                            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:h-8 sm:w-8"
                          >
                            {item.read ? (
                              <Mail className="h-4 w-4" />
                            ) : (
                              <MailOpen className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:h-8 sm:w-8"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer
          className="border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-400"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {t('notif.localOnly')}
        </footer>
      </aside>
    </div>
  )
}
