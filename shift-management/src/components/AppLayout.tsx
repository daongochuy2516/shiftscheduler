import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  CalendarDays,
  Clock3,
  KeyRound,
  LayoutList,
  LogOut,
  Plus,
  User,
} from 'lucide-react'
import { ChangePasswordModal } from './ChangePasswordModal'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { IS_MOCK_BACKEND } from '../data'
import { useI18n } from '../i18n/I18nContext'
import type { Lang, TranslationKey } from '../i18n/translations'
import { toDateKey } from '../lib/time'
import { Avatar } from './Avatar'
import { useShiftEditor } from './ShiftEditorProvider'

const NAV: {
  to: string
  label: TranslationKey
  icon: typeof CalendarDays
  end: boolean
}[] = [
  { to: '/', label: 'nav.timeline', icon: CalendarDays, end: true },
  { to: '/shifts', label: 'nav.allShifts', icon: LayoutList, end: false },
  { to: '/my-shifts', label: 'nav.myShifts', icon: User, end: false },
  { to: '/pending', label: 'nav.pending', icon: Clock3, end: false },
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
  const { shifts } = useSchedule()
  const { openCreate } = useShiftEditor()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [greeting, setGreeting] = useState<TranslationKey>(greetingKey)

  // Keeps the greeting honest on a tab left open across a boundary. Setting
  // the same key is a no-op in React, so this re-renders only 4 times a day.
  useEffect(() => {
    const id = setInterval(() => setGreeting(greetingKey()), 60_000)
    return () => clearInterval(id)
  }, [])

  const pendingCount = shifts.reduce(
    (n, s) => n + s.assignments.filter((a) => a.status === 'pending').length,
    0,
  )

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <CalendarClock className="h-4.5 w-4.5" />
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {t('auth.appName')}
            </span>
          </div>

          <nav className="order-3 -mx-1 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
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
              className="flex rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200"
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
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('nav.newShift')}</span>
            </button>

            {user && (
              <div className="flex items-center gap-2 border-l border-slate-200 pl-2">
                <Avatar
                  name={user.display_name}
                  seed={user.id}
                  size="sm"
                />
                <div className="hidden leading-tight md:block">
                  <p className="text-sm font-medium text-slate-800">
                    {user.display_name}
                  </p>
                  <p className="text-[11px] text-slate-500">{user.email}</p>
                </div>
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
            )}
          </div>
        </div>

        {IS_MOCK_BACKEND && (
          <p className="bg-amber-50 px-4 py-1 text-center text-[11px] font-medium text-amber-800 sm:px-6">
            {t('auth.mockBanner')}
          </p>
        )}
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6">
        {children}
      </main>

      {user && (
        <footer className="px-4 pt-1 pb-6 text-center text-xs text-slate-400 select-none">
          {t(greeting, { name: user.display_name })}
        </footer>
      )}

      {changingPassword && (
        <ChangePasswordModal onClose={() => setChangingPassword(false)} />
      )}
    </div>
  )
}
