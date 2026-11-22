import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Download,
  KeyRound,
  Languages,
  LayoutList,
  Link,
  LogOut,
  Monitor,
  Moon,
  MoonStar,
  Plus,
  ScrollText,
  Search,
  Sun,
  User,
  UserCog,
  Network,
} from 'lucide-react'
import { ChangePasswordModal } from './ChangePasswordModal'
import { useAuth } from '../auth/AuthContext'
import { useSchedule, useShifts } from '../data/ScheduleContext'
import { IS_MOCK_BACKEND } from '../data'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { useNotifications, useNotify } from '../notifications/NotificationContext'
import { useTheme } from '../theme/ThemeContext'
import { SCROLL_ROOT_ID } from '../lib/scrollRoot'
import { UI_BYPASS, uiCanManageTemplates, uiIsAdmin } from '../lib/uiBypass'
import { fromDateKey, toDateKey } from '../lib/time'
import { useOverlayParams } from '../lib/urlParams'
import { validDateParam } from '../lib/canonicalParams'
import { Avatar } from './Avatar'
import { BottomNav } from './BottomNav'
import { Modal } from './Modal'
import { useShiftEditor } from './ShiftEditorProvider'
import { HeaderClock } from './HeaderClock'
import { HeaderMenu } from './HeaderMenu'
import { CommandPalette } from './CommandPalette'
import { NewShiftButton, NewShiftChooser } from './NewShiftMenu'
import { ClaimTemplateModal } from './ClaimTemplateModal'
import { TemplateManagerModal } from './TemplateManagerModal'
import { LocationManagerModal } from './LocationManagerModal'
import type { ShiftTemplate } from '../types'
import { useTwoStep } from './useTwoStep'
import { RoleBadge } from './RoleBadge'
import { APP_NAME } from '../lib/brand'
import { promptInstall, useInstallState } from '../pwa/install'
import { copyText } from '../lib/clipboard'
import { OfflineBanner } from './OfflineBanner'
import { InstallHelpModal } from './InstallHelpModal'

const NAV: {
  to: string
  label: TranslationKey
  icon: typeof CalendarDays
  end: boolean
}[] = [
  { to: '/', label: 'nav.timeline', icon: CalendarDays, end: true },
  { to: '/shifts', label: 'nav.allShifts', icon: LayoutList, end: false },
  { to: '/summary', label: 'nav.summary', icon: ClipboardCheck, end: false },
  { to: '/my-shifts', label: 'nav.myShifts', icon: User, end: false },
  { to: '/pending', label: 'nav.pending', icon: Clock3, end: false },
  { to: '/logs', label: 'nav.actionLog', icon: ScrollText, end: false },
  // Trạng thái và Tài khoản (admin) không nằm ở đây mà trong nút lưới
  // (HeaderMenu), cho thanh điều hướng đỡ dài.
]

/**
 * Which part of the day it is, using the Vietnamese split: sáng / trưa /
 * chiều / tối. Late night falls under "tối" because "chào buổi đêm" isn't
 * something anyone actually says.
 */
function greetingKey(): TranslationKey {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 11) return 'greeting.morning'
  if (hour >= 11 && hour < 13) return 'greeting.noon'
  if (hour >= 13 && hour < 18) return 'greeting.afternoon'
  return 'greeting.evening'
}

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon, oled: MoonStar } as const
/** Cùng thứ tự đổi với dòng Giao diện trên PC: Hệ thống → Sáng → Tối → Tối OLED. */
const THEME_NEXT = { system: 'light', light: 'dark', dark: 'oled', oled: 'system' } as const
const THEME_LABEL = {
  system: 'theme.systemShort',
  light: 'theme.light',
  dark: 'theme.dark',
  oled: 'theme.oled',
} as const satisfies Record<keyof typeof THEME_ICON, TranslationKey>

/**
 * Icon trong vòng tròn màu ở bảng avatar (mobile). Cùng màu với ô tương ứng
 * trong nút lưới trên PC (HeaderMenu) để hai bản nhìn như một app.
 * `tone` viết nguyên chuỗi để Tailwind sinh class.
 */
function SheetIcon({ icon: Icon, tone }: { icon: typeof Sun; tone: string }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition ${tone}`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  // Cùng lát cắt với trang Chờ xác nhận: mở trang đó không phải tải lại.
  const { shifts } = useShifts(user ? { kind: 'pending' } : null)
  const {
    profilesById,
    templates,
    templatesAvailable,
    locations,
    locationsAvailable,
    locationsLoaded,
    loading,
    error,
  } = useSchedule()
  const isAdmin = uiIsAdmin(user)
  /**
   * Tên lấy từ danh sách nhân viên chứ không từ phiên đăng nhập: admin vừa
   * đổi tên mình ở trang Tài khoản thì header đổi theo ngay.
   */
  const displayName = user
    ? (profilesById.get(user.id)?.display_name ?? user.display_name)
    : ''
  const { openCreate } = useShiftEditor()
  const { setCenterOpen } = useNotifications()
  const { t, lang, setLang } = useI18n()
  const { pref: themePref, setPref: setThemePref } = useTheme()
  const navigate = useNavigate()
  const notify = useNotify()
  const overlay = useOverlayParams()
  const { params } = overlay
  const [signingOut, setSigningOut] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  /**
   * Bảng chọn của nút Tạo ca khi mở dạng hộp thoại: nút nổi trên điện thoại
   * (`menu`), hay lệnh "Nhận ca mẫu" trong Ctrl + K (`templates`, vào thẳng
   * danh sách mẫu). Trên PC nút Tạo ca tự xổ menu của nó.
   */
  const [newShift, setNewShift] = useState<'menu' | 'templates' | null>(null)

  /*
   * Hộp nhận ca mẫu và hộp quản lý ca mẫu / nơi trực nằm trên URL (xem
   * OVERLAY_PARAMS trong lib/urlParams.ts): copy link là người khác mở đúng
   * hộp đó, Back của trình duyệt đóng hộp.
   *   claim=<id mẫu>                hộp nhận ca mẫu (ngày, nơi trực chọn trong
   *                                 hộp vẫn là state cục bộ)
   *   manage=templates|locations    hộp quản lý (chỉ admin), đang ở danh sách
   *   manage=…&item=<id>|new        form sửa / tạo bên trong hộp quản lý
   * Giá trị không dùng được (mẫu đã xoá / tắt, không phải admin, id lạ) thì
   * bỏ khỏi URL để link luôn khớp với thứ đang hiện.
   */
  /** Đã tải xong nhân viên + ca mẫu mà không lỗi: lúc đó mới biết id nào là lạ. */
  const metaReady = !loading && !error
  /*
   * Link cũ / gõ tay có thể mang nhiều hộp thoại cùng lúc (`?shift=…&claim=…`).
   * Mỗi lúc chỉ một hộp: ưu tiên form ca > nhận ca mẫu > quản lý; tham số của
   * hộp thua bị bỏ khỏi URL (thay, không báo lỗi). Xét theo có mặt trên URL,
   * không theo hợp lệ: hộp thắng mà hỏng thì tự bị gỡ, không mở hộp thua.
   */
  const hasShift = params.get('shift') !== null
  const rawClaim = params.get('claim')
  const shadowClaim = hasShift && rawClaim !== null
  const shadowManage =
    (hasShift || rawClaim !== null) &&
    (params.get('manage') !== null || params.get('item') !== null)
  const claimId = shadowClaim ? null : rawClaim
  const claimTarget =
    claimId && templatesAvailable
      ? (templates.find((tpl) => tpl.id === claimId && tpl.is_active) ?? null)
      : null
  const canManage = uiCanManageTemplates(user)
  const manageParam = shadowManage ? null : params.get('manage')
  const manage =
    canManage && manageParam === 'templates' && templatesAvailable
      ? 'templates'
      : canManage && manageParam === 'locations' && locationsAvailable
        ? 'locations'
        : null
  const itemParam = shadowManage ? null : params.get('item')
  /** Danh sách của hộp quản lý đã tải đủ để nói một id là lạ chưa. */
  const itemsReady =
    manage === 'templates' ? metaReady : manage === 'locations' && locationsLoaded
  const itemKnown =
    itemParam === 'new' ||
    (manage === 'templates' ? templates : manage === 'locations' ? locations : []).some(
      (x) => x.id === itemParam,
    )
  /** Chưa tải xong thì cứ truyền id xuống: hộp tự chờ tới khi thấy mục đó. */
  const manageItem = manage && itemParam && (itemKnown || !itemsReady) ? itemParam : null

  // Những tham số phải bỏ, tính lại mỗi lần vẽ; effect dưới ghi lên URL.
  const stripClaim = claimId !== null && claimTarget === null && metaReady
  const manageKnownValue = manageParam === 'templates' || manageParam === 'locations'
  const stripManage =
    manageParam !== null &&
    manage === null &&
    (!canManage || !manageKnownValue || metaReady)
  const stripItem =
    !stripManage &&
    itemParam !== null &&
    (manageParam === null || (manage !== null && itemsReady && !itemKnown))
  const search = params.toString()
  /** URL đã xử lý: StrictMode / vẽ lại trước khi URL kịp đổi không báo hai lần. */
  const strippedFor = useRef<string | null>(null)
  const { open: openOverlay, close: closeOverlay, set: setOverlay, marked: overlayMarked } =
    overlay
  useEffect(() => {
    if (!stripClaim && !stripManage && !stripItem && !shadowClaim && !shadowManage) {
      // URL đã sạch: lần sau quay lại đúng link hỏng (Forward) thì xử lý lại.
      strippedFor.current = null
      return
    }
    if (strippedFor.current === search) return
    strippedFor.current = search
    if (stripClaim) {
      notify.notify({
        kind: 'error',
        title: 'notif.claim.missing',
        bodyKey: 'notif.claim.missingBody',
      })
    }
    const patch: Record<string, null> = {}
    if (stripClaim) patch.claim = null
    if (stripManage) {
      patch.manage = null
      patch.item = null
    }
    if (stripItem) patch.item = null
    if (shadowClaim) patch.claim = null
    if (shadowManage) {
      patch.manage = null
      patch.item = null
    }
    // Bỏ cả hộp thoại mà mục lịch sử này do app mở (có dấu): lùi về như bấm
    // Back. Chỉ bỏ `item` (về danh sách), hay bỏ hộp thua khi hộp ưu tiên
    // vẫn mở, thì thay URL, giữ dấu.
    if (overlayMarked && (stripClaim || stripManage) && !hasShift) closeOverlay()
    else setOverlay(patch)
  }, [
    stripClaim,
    stripManage,
    stripItem,
    shadowClaim,
    shadowManage,
    hasShift,
    search,
    overlayMarked,
    closeOverlay,
    setOverlay,
    notify,
  ])

  const openClaim = (template: ShiftTemplate) => openOverlay({ claim: template.id })
  const openManage = (kind: 'templates' | 'locations') => openOverlay({ manage: kind })
  /** Đổi giữa danh sách và form trong hộp quản lý: thay URL, Back vẫn đóng cả hộp. */
  const setManageItem = (next: string | null) => setOverlay({ item: next })
  const [installHelpOpen, setInstallHelpOpen] = useState(false)
  const install = useInstallState()
  /**
   * Mục "Cài ứng dụng": Chrome / Edge / Android mở hộp cài của trình duyệt,
   * iPhone / iPad thì hiện cách cài tay. Đã cài, hay trình duyệt không cài
   * được (Firefox máy tính) thì không có mục này.
   */
  const onInstall =
    install.canPrompt || install.manualIos
      ? () => {
          if (install.canPrompt) void promptInstall()
          else setInstallHelpOpen(true)
        }
      : undefined

  // Ctrl + K (⌘K trên Mac) mở / đóng bảng lệnh nhanh ở bất cứ trang nào —
  // kể cả khi đang gõ trong ô nhập: phím tắt này không gõ ra chữ gì.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Copy link trang đang xem. Bản PWA đã cài không có thanh địa chỉ, nên đây
   * là cách duy nhất để lấy link gửi cho người khác. URL luôn khớp màn hình
   * (kể cả hộp thoại có địa chỉ), nên copy nguyên `location.href` là đủ.
   * Link nằm luôn trong thân thông báo để người dùng thấy mình vừa copy gì.
   */
  const copyLink = useCallback(async () => {
    const href = window.location.href
    if (await copyText(href)) notify.success('notif.link.copied', undefined, href)
    else notify.notify({ kind: 'error', title: 'notif.link.copyFailed', body: href })
  }, [notify])

  // Ctrl + Shift + L (⌘⇧L trên Mac): copy link — chạy cả khi đang gõ trong ô
  // nhập, tổ hợp này không gõ ra chữ.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'l'
      ) {
        e.preventDefault()
        void copyLink()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copyLink])
  const [accountOpen, setAccountOpen] = useState(false)
  const signOutStep = useTwoStep(handleSignOut)
  const [greeting, setGreeting] = useState<TranslationKey>(greetingKey)

  // Keeps the greeting honest on a tab left open across a boundary. Setting
  // the same key is a no-op in React, so this re-renders only 4 times a day.
  useEffect(() => {
    const id = setInterval(() => setGreeting(greetingKey()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Popup thông báo nằm ngay dưới header. Header cao thấp tuỳ bề rộng (xuống
  // dòng, băng dữ liệu mẫu), nên đo thật rồi đưa ra biến CSS cho Toaster.
  const headerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const root = document.documentElement
    const observer = new ResizeObserver(() => {
      root.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-h')
    }
  }, [])

  // Nhân viên chỉ quan tâm ca của mình. Root không có ca nào nên với họ con số
  // đó luôn là 0 và vô dụng — đếm của cả nhóm mới đúng việc họ cần làm.
  const pendingCount = shifts.reduce(
    (n, s) =>
      n +
      s.assignments.filter(
        (a) => a.status === 'pending' && a.user_id === user?.id,
      ).length,
    0,
  )

  /**
   * Nút nổi tạo ca theo đúng ngày đang xem, không phải luôn là hôm nay: đang
   * mở lịch ngày 20 mà bấm tạo lại ra ca hôm nay thì rất dễ tạo nhầm.
   */
  const createDate = validDateParam(params.get('date')) ?? toDateKey(new Date())

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col sm:h-dvh sm:min-h-0 sm:overflow-hidden">
      <header
        ref={headerRef}
        className="app-header sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur"
      >
        <div
          className="safe-x mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <CalendarClock className="h-4.5 w-4.5" />
            </span>
            <span className="truncate text-sm font-medium text-slate-900">
              {APP_NAME}
            </span>
          </div>

          {/* Điều hướng trên chỉ dành cho màn hình rộng. Dưới 640px việc này do
              thanh dưới đảm nhiệm, header giữ gọn theo quy tắc app bar.

              Đủ chữ cả hàng thì cần ~1290px (admin, tiếng Anh). Hẹp hơn thì không bỏ bớt gì mà
              xếp lại: dòng trên là logo + cụm nút, dòng dưới là dải tab chạy
              hết chiều ngang (quá hẹp thì dải tab tự chia hai hàng). Để mặc
              flex-wrap thì cụm nút bên phải rơi xuống lẻ loi một mình. Đổi
              mục điều hướng hay nút trên header thì đo lại mốc 1320px. */}
          <nav data-tour="nav" className="order-3 -mx-1 hidden w-full flex-wrap items-center gap-1 sm:flex min-[1320px]:order-none min-[1320px]:mx-0 min-[1320px]:w-auto min-[1320px]:flex-nowrap">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                data-tour={`nav-${to}`}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {t(label)}
                {to === '/pending' && pendingCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-700">
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Ngôn ngữ trên PC nằm trong nút lưới (HeaderMenu). */}
            <HeaderClock />

            {/* Bấm là xổ menu: nhận ca mẫu, hay tạo ca thủ công. */}
            <NewShiftButton
              onManual={() => openCreate(createDate)}
              onTemplate={openClaim}
              onManage={() => openManage('templates')}
              onManageLocations={() => openManage('locations')}
            />

            <button
              type="button"
              onClick={() => setCenterOpen(true)}
              aria-label={t('notif.title')}
              data-tooltip={t('notif.title')}
              // Từ 640px chuông nằm trong nút lưới (HeaderMenu).
              data-tour="bell-mobile"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:hidden"
            >
              <Bell className="h-5 w-5" />
            </button>

            {user && (
              <>
                {/* Mobile: một nút duy nhất mở sheet tài khoản, thay cho cụm
                    avatar + email + hai nút icon nhỏ. */}
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(true)
                    signOutStep.reset()
                  }}
                  aria-label={t('nav.account')}
                  data-tour="account-mobile"
                  className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-slate-100 sm:hidden"
                >
                  <Avatar name={displayName} seed={user.id} size="sm" />
                </button>

                <div className="hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex">
                  <Avatar name={displayName} seed={user.id} size="sm" />
                  <div className="hidden leading-tight md:block">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      {displayName}
                      <RoleBadge role={user.role} />
                    </p>
                    <p className="text-[11px] text-slate-500 select-text">{user.email}</p>
                  </div>
                </div>

                {/* Nút lưới ở ngoài cùng bên phải, sau tài khoản. */}
                <div className="hidden sm:block">
                  <HeaderMenu
                    isAdmin={isAdmin}
                    onInstall={onInstall}
                    onCopyLink={() => void copyLink()}
                    onChangePassword={() => setChangingPassword(true)}
                    onSignOut={handleSignOut}
                    signingOut={signingOut}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {IS_MOCK_BACKEND && (
          <p className="safe-x bg-amber-50 py-1 text-center text-[11px] font-medium text-amber-800">
            {t('auth.mockBanner')}
          </p>
        )}
        {UI_BYPASS && (
          <p className="safe-x bg-rose-50 py-1 text-center text-[11px] font-medium text-rose-800">
            {t('auth.uiBypassBanner')}
          </p>
        )}
        <OfflineBanner />
      </header>

      {/* Từ 640px nội dung cuộn trong khung riêng dưới header, để thanh cuộn
          không đè lên header. Mobile vẫn cuộn cả trang (thanh địa chỉ của
          trình duyệt cần vậy mới tự thu gọn). */}
      <div
        id={SCROLL_ROOT_ID}
        className="flex flex-1 flex-col sm:min-h-0 sm:overflow-y-auto"
      >
        {/* padding-bottom chừa chỗ cho thanh dưới, nếu không dòng cuối của mọi
            trang sẽ bị thanh đó che mất. */}
        <main className="safe-x pb-mobile-nav mx-auto w-full max-w-[1600px] flex-1 pt-4 sm:pt-5">
          {children}
        </main>

        {/* Ẩn trên mobile: chỗ đó đã là thanh điều hướng và nút nổi. Lời chào
            vẫn còn, nằm trong sheet tài khoản. */}
        {user && (
          <footer className="safe-x hidden pt-1 pb-6 text-center text-xs text-slate-400 select-none sm:block">
            {t(greeting, { name: displayName })}
          </footer>
        )}
      </div>

      {/* Nút nổi: hành động chính, đặt trong tầm ngón cái, chỉ có ở mobile. */}
      <button
        type="button"
        onClick={() => setNewShift('menu')}
        aria-label={t('nav.newShift')}
        data-tour="fab"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition active:bg-indigo-700 sm:hidden"
        style={{ bottom: 'calc(var(--bottom-nav-h) + var(--safe-b) + 1rem)' }}
      >
        <Plus className="h-6 w-6" />
      </button>

      <BottomNav pendingCount={pendingCount} />

      {accountOpen && user && (
        <Modal
          title={displayName}
          titleAside={<RoleBadge role={user.role} />}
          subtitle={user.email}
          width="max-w-md"
          onClose={() => setAccountOpen(false)}
        >
          <div className="space-y-1">
            <p className="px-1 pb-2 text-center text-xs text-slate-400 select-none">
              {t(greeting, { name: displayName })}
            </p>

            <NavLink
              to="/summary"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={ClipboardCheck} tone="bg-slate-100 text-slate-600" />
              {t('nav.summary')}
            </NavLink>

            <NavLink
              to="/logs"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={ScrollText} tone="bg-slate-100 text-slate-600" />
              {t('nav.actionLog')}
            </NavLink>

            <NavLink
              to="/status"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={Network} tone="bg-slate-100 text-slate-600" />
              {t('nav.status')}
            </NavLink>

            <NavLink
              to="/help"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={BookOpen} tone="bg-slate-100 text-slate-600" />
              {t('nav.help')}
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/accounts"
                onClick={() => setAccountOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
              >
                <SheetIcon icon={UserCog} tone="bg-slate-100 text-slate-600" />
                {t('nav.accounts')}
              </NavLink>
            )}

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                setPaletteOpen(true)
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={Search} tone="bg-slate-100 text-slate-600" />
              {t('palette.title')}
            </button>

            {onInstall && (
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false)
                  onInstall()
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
              >
                <SheetIcon icon={Download} tone="bg-slate-100 text-slate-600" />
                {t('pwa.install')}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                void copyLink()
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={Link} tone="bg-slate-100 text-slate-600" />
              {t('menu.copyLink')}
            </button>

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                setChangingPassword(true)
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={KeyRound} tone="bg-slate-100 text-slate-600" />
              {t('pwd.title')}
            </button>

            {/* Bấm để đổi như ô trên PC; giá trị đang dùng ghi ở bên phải.
                Sheet giữ mở để bấm tiếp nếu cần. */}
            <button
              type="button"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              aria-label={`${t('nav.language')}: ${t('menu.langName')} · ${t('menu.langNext')}`}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={Languages} tone="bg-slate-100 text-slate-600" />
              {t('nav.language')}
              <span className="ml-auto text-sm font-normal text-slate-500">
                {t('menu.langName')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setThemePref(THEME_NEXT[themePref])}
              aria-label={`${t('theme.label')}: ${t(THEME_LABEL[themePref])} · ${t('menu.themeNext', { theme: t(THEME_LABEL[THEME_NEXT[themePref]]) })}`}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <SheetIcon icon={THEME_ICON[themePref]} tone="bg-slate-100 text-slate-600" />
              {t('theme.label')}
              <span className="ml-auto text-sm font-normal text-slate-500">
                {t(THEME_LABEL[themePref])}
              </span>
            </button>

            {/* Đăng xuất tách khỏi nhóm trên bằng đường kẻ, nhưng cùng tông xám
                với các mục khác: đỏ sẵn thì lại hút mắt vào đúng nút không nên
                bấm nhầm. Chỉ đỏ lúc đang chạm / rê chuột, và khi chờ bấm lần hai. */}
            <div className="border-t border-slate-100 pt-1">
              {/* Bấm hai lần mới đăng xuất, giống ô Đăng xuất trên PC. */}
              <button
                type="button"
                onClick={signOutStep.press}
                disabled={signingOut}
                className={`group flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition disabled:opacity-50 ${
                  signOutStep.armed
                    ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                    : 'text-slate-700 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-50 active:text-rose-600'
                }`}
              >
                <SheetIcon
                  icon={LogOut}
                  tone={
                    signOutStep.armed
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-rose-100 group-hover:text-rose-600 group-active:bg-rose-100 group-active:text-rose-600'
                  }
                />
                {signOutStep.armed
                  ? t('auth.signOutAgain')
                  : t('auth.signOut')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {changingPassword && (
        <ChangePasswordModal onClose={() => setChangingPassword(false)} />
      )}

      {installHelpOpen && (
        <InstallHelpModal onClose={() => setInstallHelpOpen(false)} />
      )}

      {newShift && (
        <Modal
          title={t('nav.newShift')}
          width="max-w-md"
          onClose={() => setNewShift(null)}
        >
          <NewShiftChooser
            startAtTemplates={newShift === 'templates'}
            onManual={() => {
              setNewShift(null)
              openCreate(createDate)
            }}
            onTemplate={(tpl) => {
              setNewShift(null)
              openClaim(tpl)
            }}
            onManage={() => {
              setNewShift(null)
              openManage('templates')
            }}
            onManageLocations={() => {
              setNewShift(null)
              openManage('locations')
            }}
          />
        </Modal>
      )}

      {/* Chờ tải xong danh sách để không chớp qua màn "chưa có mẫu nào". */}
      {manage === 'templates' && !loading && (
        <TemplateManagerModal
          item={manageItem}
          onItemChange={setManageItem}
          onClose={closeOverlay}
        />
      )}

      {manage === 'locations' && !loading && (
        <LocationManagerModal
          item={manageItem}
          onItemChange={setManageItem}
          onClose={closeOverlay}
        />
      )}

      {claimTarget && (
        <ClaimTemplateModal
          // Đổi sang mẫu khác (Back / link) thì chọn ngày lại từ đầu.
          key={claimTarget.id}
          template={claimTarget}
          viewedDate={fromDateKey(createDate)}
          onClose={closeOverlay}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onCreateShift={() => openCreate(createDate)}
          onClaimTemplate={() => setNewShift('templates')}
          onManageLocations={() => openManage('locations')}
          onChangePassword={() => setChangingPassword(true)}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  )
}
