import { useEffect, useRef, useState } from 'react'
import { Bell, Grip, KeyRound, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { useNotifications } from '../notifications/NotificationContext'
import { useTheme, type ThemePref } from '../theme/ThemeContext'

const THEMES: { id: ThemePref; icon: typeof Sun; label: TranslationKey }[] = [
  { id: 'system', icon: Monitor, label: 'theme.systemShort' },
  { id: 'light', icon: Sun, label: 'theme.light' },
  { id: 'dark', icon: Moon, label: 'theme.dark' },
]

/**
 * Nút lưới trên header PC, kiểu trình mở ứng dụng của Google: gom thông báo,
 * giao diện, đổi mật khẩu và đăng xuất vào một ô lưới, để header đỡ chật.
 * Số thông báo chưa đọc hiện ngay trên nút.
 *
 * Mobile không dùng: ở đó đã có nút chuông và sheet tài khoản.
 */
export function HeaderMenu({
  onChangePassword,
  onSignOut,
  signingOut,
}: {
  onChangePassword: () => void
  onSignOut: () => void
  signingOut: boolean
}) {
  const { t } = useI18n()
  const { pref, setPref } = useTheme()
  const { unreadCount, setCenterOpen } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const theme = THEMES.find((o) => o.id === pref) ?? THEMES[0]
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]
  const badge = unreadCount > 99 ? '99+' : String(unreadCount)

  /** Bấm một ô là xong việc của menu — trừ ô giao diện, bấm tiếp để đổi tiếp. */
  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          unreadCount > 0
            ? `${t('menu.label')} · ${t('notif.unread', { count: unreadCount })}`
            : t('menu.label')
        }
        title={t('menu.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-100 hover:text-slate-800 ${
          open ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
        }`}
      >
        <Grip className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-semibold text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('menu.label')}
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-3xl bg-slate-100 p-2 shadow-xl ring-1 ring-slate-900/10"
        >
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-2">
            <Tile
              icon={Bell}
              tone="bg-sky-50 text-sky-600"
              label={t('notif.title')}
              sub={
                unreadCount > 0
                  ? t('notif.unread', { count: unreadCount })
                  : t('notif.allRead')
              }
              badge={unreadCount > 0 ? badge : null}
              onClick={() => run(() => setCenterOpen(true))}
            />
            <Tile
              icon={theme.icon}
              tone="bg-violet-50 text-violet-600"
              label={t('theme.label')}
              sub={t(theme.label)}
              title={t('menu.themeNext', { theme: t(nextTheme.label) })}
              onClick={() => setPref(nextTheme.id)}
            />
            <Tile
              icon={KeyRound}
              tone="bg-amber-50 text-amber-600"
              label={t('pwd.title')}
              onClick={() => run(onChangePassword)}
            />
            <Tile
              icon={LogOut}
              tone="bg-rose-50 text-rose-600"
              label={t('auth.signOut')}
              disabled={signingOut}
              onClick={() => run(onSignOut)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({
  icon: Icon,
  tone,
  label,
  sub,
  badge,
  title,
  disabled,
  onClick,
}: {
  icon: typeof Sun
  /** Màu nền + màu icon của vòng tròn, viết nguyên chuỗi để Tailwind sinh. */
  tone: string
  label: string
  sub?: string
  badge?: string | null
  title?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition hover:bg-slate-100 disabled:opacity-50"
    >
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="h-5 w-5" />
        {badge && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-none font-semibold text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="text-sm leading-tight font-medium text-slate-800">
        {label}
      </span>
      {sub && <span className="-mt-1 text-xs text-slate-500">{sub}</span>}
    </button>
  )
}
