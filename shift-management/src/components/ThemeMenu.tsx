import { Monitor, Moon, Sun } from 'lucide-react'
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
