import { useEffect, useRef, useState } from 'react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { useTheme, type ThemePref } from '../theme/ThemeContext'

const OPTIONS: {
  id: ThemePref
  icon: typeof Sun
  label: TranslationKey
  short: TranslationKey
}[] = [
  { id: 'system', icon: Monitor, label: 'theme.system', short: 'theme.systemShort' },
  { id: 'light', icon: Sun, label: 'theme.light', short: 'theme.light' },
  { id: 'dark', icon: Moon, label: 'theme.dark', short: 'theme.dark' },
]

/** Nút icon trên header PC, bấm mở menu ba lựa chọn. */
export function ThemeMenu() {
  const { t } = useI18n()
  const { pref, setPref } = useTheme()
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

  const CurrentIcon = OPTIONS.find((o) => o.id === pref)!.icon

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('theme.label')}
        title={t('theme.label')}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-md p-1.5 transition hover:bg-slate-100 hover:text-slate-700 ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-400'
        }`}
      >
        <CurrentIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('theme.label')}
          className="absolute top-full right-0 z-50 mt-2 w-48 rounded-lg bg-white p-1 shadow-lg ring-1 ring-slate-900/10"
        >
          {OPTIONS.map(({ id, icon: Icon, label }) => {
            const active = pref === id
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => setPref(id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition ${
                  active
                    ? 'bg-indigo-50 font-medium text-indigo-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t(label)}
                {active && <Check className="ml-auto h-4 w-4" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Dãy ba nút trong sheet tài khoản trên mobile, cùng kiểu với chọn ngôn ngữ. */
export function ThemeSegmented() {
  const { t } = useI18n()
  const { pref, setPref } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="ml-auto flex rounded-md bg-slate-100 p-1"
    >
      {OPTIONS.map(({ id, icon: Icon, short }) => {
        const active = pref === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPref(id)}
            className={`flex min-h-9 items-center gap-1.5 rounded px-2.5 text-sm font-semibold transition ${
              active ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(short)}
          </button>
        )
      })}
    </div>
  )
}
