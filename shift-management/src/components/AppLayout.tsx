import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  KeyRound,
  LayoutList,
  LogOut,
  Plus,
  ScrollText,
  User,
} from 'lucide-react'
import { ChangePasswordModal } from './ChangePasswordModal'
import { useAuth } from '../auth/AuthContext'
import { useShifts } from '../data/ScheduleContext'
import { IS_MOCK_BACKEND } from '../data'
import { useI18n } from '../i18n/I18nContext'
import type { Lang, TranslationKey } from '../i18n/translations'
import { SCROLL_ROOT_ID } from '../lib/scrollRoot'
import { toDateKey } from '../lib/time'
import { Avatar } from './Avatar'
import { BottomNav } from './BottomNav'
import { Modal } from './Modal'
import { useShiftEditor } from './ShiftEditorProvider'
import { ThemeMenu, ThemeSegmented } from './ThemeMenu'

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
  { to: '/status', label: 'nav.status', icon: Activity, end: false },
]

const LANGS: { id: Lang; label: string }[] = [
  { id: 'vi', label: 'VI' },
  { id: 'en', label: 'EN' },
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

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  // Cùng lát cắt với trang Chờ xác nhận: mở trang đó không phải tải lại.
  const { shifts } = useShifts(user ? { kind: 'pending' } : null)
  const { openCreate } = useShiftEditor()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [signingOut, setSigningOut] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [greeting, setGreeting] = useState<TranslationKey>(greetingKey)

  // Keeps the greeting honest on a tab left open across a boundary. Setting
  // the same key is a no-op in React, so this re-renders only 4 times a day.
  useEffect(() => {
    const id = setInterval(() => setGreeting(greetingKey()), 60_000)
    return () => clearInterval(id)
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
  const createDate = params.get('date') ?? toDateKey(new Date())

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col sm:h-dvh sm:min-h-0 sm:overflow-hidden">
      <header className="app-header sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div
          className="safe-x mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <CalendarClock className="h-4.5 w-4.5" />
            </span>
            <span className="truncate text-sm font-semibold text-slate-900">
              {t('auth.appName')}
            </span>
          </div>

          {/* Điều hướng trên chỉ dành cho màn hình rộng. Dưới 640px việc này do
              thanh dưới đảm nhiệm, header giữ gọn theo quy tắc app bar. */}
          <nav className="order-3 -mx-1 hidden w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:flex sm:w-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
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
                  <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700">
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div
              role="group"
              aria-label={t('nav.language')}
              className="hidden rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200 sm:flex"
            >
              {LANGS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLang(option.id)}
                  aria-pressed={lang === option.id}
                  className={`rounded px-1.5 py-1 text-xs font-semibold transition ${
                    lang === option.id
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => openCreate(toDateKey(new Date()))}
              className="hidden items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 sm:inline-flex"
            >
              <Plus className="h-4 w-4" />
              {t('nav.newShift')}
            </button>

            {user && (
              <>
                {/* Mobile: một nút duy nhất mở sheet tài khoản, thay cho cụm
                    avatar + email + hai nút icon nhỏ. */}
                <button
                  type="button"
                  onClick={() => setAccountOpen(true)}
                  aria-label={t('nav.account')}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-slate-100 sm:hidden"
                >
                  <Avatar name={user.display_name} seed={user.id} size="sm" />
                </button>

                <div className="hidden items-center gap-2 border-l border-slate-200 pl-2 sm:flex">
                  <Avatar name={user.display_name} seed={user.id} size="sm" />
                  <div className="hidden leading-tight md:block">
                    <p className="text-sm font-medium text-slate-800">
                      {user.display_name}
                    </p>
                    <p className="text-[11px] text-slate-500">{user.email}</p>
                  </div>
                  <ThemeMenu />
                  <button
                    type="button"
                    onClick={() => setChangingPassword(true)}
                    aria-label={t('pwd.title')}
                    title={t('pwd.title')}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    aria-label={t('auth.signOut')}
                    title={t('auth.signOut')}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
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
            {t(greeting, { name: user.display_name })}
          </footer>
        )}
      </div>

      {/* Nút nổi: hành động chính, đặt trong tầm ngón cái, chỉ có ở mobile. */}
      <button
        type="button"
        onClick={() => openCreate(createDate)}
        aria-label={t('nav.newShift')}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition active:bg-indigo-700 sm:hidden"
        style={{ bottom: 'calc(var(--bottom-nav-h) + var(--safe-b) + 1rem)' }}
      >
        <Plus className="h-6 w-6" />
      </button>

      <BottomNav pendingCount={pendingCount} />

      {accountOpen && user && (
        <Modal
          title={user.display_name}
          subtitle={user.email}
          width="max-w-md"
          onClose={() => setAccountOpen(false)}
        >
          <div className="space-y-1">
            <p className="px-1 pb-2 text-center text-xs text-slate-400 select-none">
              {t(greeting, { name: user.display_name })}
            </p>

            <NavLink
              to="/summary"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <ClipboardCheck className="h-5 w-5 text-slate-400" />
              {t('nav.summary')}
            </NavLink>

            <NavLink
              to="/logs"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <ScrollText className="h-5 w-5 text-slate-400" />
              {t('nav.actionLog')}
            </NavLink>

            <NavLink
              to="/status"
              onClick={() => setAccountOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <Activity className="h-5 w-5 text-slate-400" />
              {t('nav.status')}
            </NavLink>

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                setChangingPassword(true)
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
            >
              <KeyRound className="h-5 w-5 text-slate-400" />
              {t('pwd.title')}
            </button>

            <div className="flex min-h-12 items-center gap-3 rounded-lg px-3">
              <span className="text-sm font-medium text-slate-700">
                {t('nav.language')}
              </span>
              <div
                role="group"
                aria-label={t('nav.language')}
                className="ml-auto flex rounded-md bg-slate-100 p-1"
              >
                {LANGS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLang(option.id)}
                    aria-pressed={lang === option.id}
                    className={`min-h-9 min-w-12 rounded px-3 text-sm font-semibold transition ${
                      lang === option.id
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex min-h-12 items-center gap-3 rounded-lg px-3">
              <span className="text-sm font-medium text-slate-700">
                {t('theme.label')}
              </span>
              <ThemeSegmented />
            </div>

            {/* Đăng xuất tách khỏi nhóm trên và dùng màu cảnh báo: nó đưa người
                dùng ra khỏi ứng dụng, không nên nằm lẫn với các mục thường. */}
            <div className="border-t border-slate-100 pt-1">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-rose-600 transition active:bg-rose-50 disabled:opacity-50"
              >
                <LogOut className="h-5 w-5" />
                {t('auth.signOut')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {changingPassword && (
        <ChangePasswordModal onClose={() => setChangingPassword(false)} />
      )}
    </div>
  )
}
