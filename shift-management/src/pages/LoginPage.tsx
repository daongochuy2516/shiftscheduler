import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CalendarClock, LifeBuoy, Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../components/Modal'
import { IS_MOCK_BACKEND } from '../data'
import { MOCK_PASSWORD } from '../auth/mockAuth'
import { MOCK_PROFILES } from '../data/mockData'
import { useI18n } from '../i18n/I18nContext'
import type { Lang } from '../i18n/translations'
import { APP_NAME } from '../lib/brand'

const LANGS: { id: Lang; label: string }[] = [
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'en', label: 'English' },
]

// min-h-11 = 44px, mức tối thiểu để bấm chính xác bằng ngón tay. text-base
// trên mobile cũng ngăn Safari iOS tự phóng to trang khi focus vào ô nhập.
const inputClass =
  'w-full min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

export function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // In mock mode the form starts pre-filled so the app is one click away.
  const [email, setEmail] = useState(() =>
    IS_MOCK_BACKEND ? MOCK_PROFILES[0].email : '',
  )
  const [password, setPassword] = useState(() =>
    IS_MOCK_BACKEND ? MOCK_PASSWORD : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex items-center gap-2.5 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="text-sm font-medium">{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  if (user) return <Navigate to={from} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const message = await signIn(email, password)
    if (message) {
      setError(message)
      setSubmitting(false)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <CalendarClock className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold text-slate-900">
            {APP_NAME}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('auth.subtitle')}</p>

          <div className="mt-3 flex rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200">
            {LANGS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setLang(option.id)}
                aria-pressed={lang === option.id}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  lang === option.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5"
        >
          <div>
            <label
              className="mb-1 block text-xs font-medium text-slate-600"
              htmlFor="email"
            >
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          {/*
            Grid rather than a label row + input: it keeps "Quên mật khẩu?"
            visually beside the label while placing it *after* the input in
            the DOM. Tab order follows the DOM, so tabbing out of the email
            field lands on the password box instead of snagging on the link.
          */}
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-2">
            <label
              className="col-start-1 row-start-1 mb-1 block text-xs font-medium text-slate-600"
              htmlFor="password"
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className={`col-span-2 row-start-2 ${inputClass}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="col-start-2 row-start-1 mb-1 justify-self-end text-xs font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
            >
              {t('forgot.link')}
            </button>
          </div>

          {error && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>

        {IS_MOCK_BACKEND && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
            <p className="font-semibold">{t('auth.mockMode')}</p>
            <p className="mt-1">
              {t('auth.mockHint', { password: MOCK_PASSWORD })}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {MOCK_PROFILES.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                    onClick={() => {
                      setEmail(p.email)
                      setPassword(MOCK_PASSWORD)
                    }}
                  >
                    {p.email}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showForgot && (
        <Modal
          title={t('forgot.title')}
          onClose={() => setShowForgot(false)}
          width="max-w-md"
          footer={
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500"
              onClick={() => setShowForgot(false)}
            >
              {t('forgot.ok')}
            </button>
          }
        >
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div className="space-y-2 text-sm">
              <p className="text-slate-700">{t('forgot.body')}</p>
              <p className="text-slate-500">{t('forgot.after')}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
