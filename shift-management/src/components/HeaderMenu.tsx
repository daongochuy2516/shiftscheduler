import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Bell,
  Download,
  Grip,
  KeyRound,
  Languages,
  Link,
  LogOut,
  Monitor,
  Moon,
  MoonStar,
  Sun,
  UserCog,
  Network,
} from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { useNotifications } from '../notifications/NotificationContext'
import { useTheme, type ThemePref } from '../theme/ThemeContext'
import { useExitAnimation } from './useExitAnimation'
import { useTwoStep } from './useTwoStep'

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.userAgent)
/** Phím tắt copy link (bắt ở AppLayout), vẽ thành phím nhỏ cuối dòng. */
const COPY_LINK_KEYS = IS_MAC ? ['⌘', '⇧', 'L'] : ['Ctrl', 'Shift', 'L']
const PALETTE_KEYS = IS_MAC ? ['⌘', 'K'] : ['Ctrl', 'K']

const THEMES: { id: ThemePref; icon: typeof Sun; label: TranslationKey }[] = [
  { id: 'system', icon: Monitor, label: 'theme.systemShort' },
  { id: 'light', icon: Sun, label: 'theme.light' },
  { id: 'dark', icon: Moon, label: 'theme.dark' },
  { id: 'oled', icon: MoonStar, label: 'theme.oled' },
]

/**
 * Nút lưới trên header PC: gom trang Tài khoản (chỉ admin), Trạng thái, Hướng
 * dẫn, thông báo, giao diện, ngôn ngữ, copy link, đổi mật khẩu và đăng xuất
 * vào một menu, để header đỡ chật.
 *
 * Dạng danh sách chia nhóm (trang · thiết lập · thao tác · đăng xuất), không
 * phải lưới ô to: chín việc khác loại mà cùng một ô vuông thì việc nào cũng
 * nặng như nhau. Giá trị hiện tại (giao diện, ngôn ngữ) và phím tắt nằm cuối
 * dòng, thành một cột.
 *
 * Mobile không dùng: ở đó đã có nút chuông và sheet tài khoản (cũng là danh
 * sách).
 */
export function HeaderMenu({
  isAdmin,
  onInstall,
  onCopyLink,
  onChangePassword,
  onSignOut,
  signingOut,
}: {
  isAdmin: boolean
  /** Có khi trình duyệt cài được app (pwa/install.ts); không thì ẩn dòng. */
  onInstall?: () => void
  onCopyLink: () => void
  onChangePassword: () => void
  onSignOut: () => void
  signingOut: boolean
}) {
  const { t, lang, setLang } = useI18n()
  const { pref, setPref } = useTheme()
  const { setCenterOpen } = useNotifications()
  const navigate = useNavigate()
  // Đăng xuất phải bấm hai lần: lỡ tay một lần là mất phiên đang làm.
  const signOut = useTwoStep(onSignOut)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element
      // Bấm trên thẻ của wizard hướng dẫn thì giữ menu mở — wizard đang chỉ
      // vào các dòng trong menu này.
      if (target.closest?.('[data-tour-overlay]')) return
      if (!ref.current?.contains(target)) setOpen(false)
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

  /**
   * Bấm một dòng là xong việc của menu — trừ giao diện và ngôn ngữ, bấm tiếp
   * để đổi tiếp.
   */
  function run(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          signOut.reset()
        }}
        aria-label={t('menu.label')}
        data-tooltip={t('menu.label')}
        data-tour="menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-100 hover:text-slate-800 ${
          open ? 'bg-slate-100 text-slate-800' : 'text-slate-500'
        }`}
      >
        <Grip className="h-5 w-5" />
      </button>

      {open && (
        <MenuPanel label={t('menu.label')}>
          {/* ---- trang ---- */}
          {isAdmin && (
            <Item
              icon={UserCog}
              tour="menu-accounts"
              label={t('nav.accounts')}
              onClick={() => run(() => navigate('/accounts'))}
            />
          )}
          <Item
            icon={Network}
            tour="menu-status"
            label={t('nav.status')}
            onClick={() => run(() => navigate('/status'))}
          />
          <Item
            icon={BookOpen}
            tour="menu-help"
            label={t('nav.help')}
            onClick={() => run(() => navigate('/help'))}
          />

          <Separator />
          {/* ---- thiết lập ---- */}
          <Item
            icon={Bell}
            tour="menu-notifications"
            label={t('notif.title')}
            onClick={() => run(() => setCenterOpen(true))}
          />
          <Item
            icon={theme.icon}
            tour="menu-theme"
            label={t('theme.label')}
            value={t(theme.label)}
            tooltip={t('menu.themeNext', { theme: t(nextTheme.label) })}
            onClick={() => setPref(nextTheme.id)}
          />
          <Item
            icon={Languages}
            tour="menu-language"
            label={t('nav.language')}
            value={t('menu.langName')}
            tooltip={t('menu.langNext')}
            onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
          />

          <Separator />
          {/* ---- thao tác ---- */}
          {onInstall && (
            <Item
              icon={Download}
              label={t('pwa.install')}
              onClick={() => run(onInstall)}
            />
          )}
          <Item
            icon={Link}
            label={t('menu.copyLink')}
            keys={COPY_LINK_KEYS}
            onClick={() => run(onCopyLink)}
          />
          <Item
            icon={KeyRound}
            tour="menu-password"
            label={t('pwd.title')}
            onClick={() => run(onChangePassword)}
          />

          <Separator />
          {/* Cùng tông với các dòng khác, chỉ đỏ khi rê chuột (và khi đang chờ
              bấm lần hai): đỏ sẵn thì lại hút mắt vào đúng nút không nên bấm. */}
          <Item
            icon={LogOut}
            tour="menu-signout"
            label={signOut.armed ? t('auth.signOutAgain') : t('auth.signOut')}
            danger
            alert={signOut.armed}
            disabled={signingOut}
            onClick={signOut.press}
          />

          <Separator />
          {/* Cho người chưa biết có bảng lệnh nhanh. */}
          <p className="flex items-center justify-between gap-2 px-2.5 pt-1 pb-1.5 text-xs text-slate-500">
            {t('palette.title')}
            <Keys keys={PALETTE_KEYS} />
          </p>
        </MenuPanel>
      )}
    </div>
  )
}

/**
 * Khung menu. Tách riêng để có hiệu ứng: mở thì xổ ra từ góc nút
 * (`menu-panel` trong index.css), đóng thì useExitAnimation để lại bản sao
 * thu gọn lại. Bảng nằm canh theo nút chứ không phủ màn hình, nên bản sao
 * phải giữ đúng vị trí (`freezePosition`).
 */
function MenuPanel({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useExitAnimation(ref, 200, { freezePosition: true })
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="menu-panel absolute top-full right-0 z-50 mt-2 w-72 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-900/10"
    >
      {children}
    </div>
  )
}

function Separator() {
  return <div role="separator" className="mx-2.5 my-1 h-px bg-slate-100" />
}

/** Phím tắt vẽ thành các phím nhỏ, như trong Quick Search. */
function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-5 rounded border border-slate-200 px-1 text-center font-sans text-[11px] leading-4 text-slate-500"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}

function Item({
  icon: Icon,
  label,
  value,
  keys,
  tooltip,
  disabled,
  danger = false,
  alert = false,
  tour,
  onClick,
}: {
  icon: typeof Sun
  label: string
  /** Giá trị hiện tại, cuối dòng (ví dụ "Hệ thống", "Tiếng Việt"). */
  value?: string
  /** Phím tắt, cuối dòng. */
  keys?: readonly string[]
  /** Tooltip tự vẽ khi rê chuột (`data-tooltip`, xem Tooltip.tsx). */
  tooltip?: string
  disabled?: boolean
  /** Thao tác khó gỡ (đăng xuất): xám như thường, đỏ khi rê chuột. */
  danger?: boolean
  /** Đang chờ bấm lần hai để xác nhận: nền đỏ cho khó bỏ qua. */
  alert?: boolean
  /** Mốc cho wizard hướng dẫn (`data-tour`). */
  tour?: string
  onClick: () => void
}) {
  const tone = alert
    ? 'bg-rose-50 font-medium text-rose-700 ring-1 ring-rose-200 ring-inset'
    : danger
      ? 'text-slate-700 hover:bg-rose-50 hover:text-rose-600'
      : 'text-slate-700 hover:bg-slate-100'
  const iconTone = alert
    ? 'text-rose-600'
    : danger
      ? 'text-slate-500 group-hover:text-rose-600'
      : 'text-slate-500'
  return (
    <button
      type="button"
      role="menuitem"
      data-tour={tour}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onClick}
      className={`group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors disabled:opacity-50 ${tone}`}
    >
      <Icon className={`h-4 w-4 shrink-0 transition-colors ${iconTone}`} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value && <span className="shrink-0 text-xs text-slate-500">{value}</span>}
      {keys && <Keys keys={keys} />}
    </button>
  )
}
