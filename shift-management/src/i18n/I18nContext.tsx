import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { enUS, vi as viDateLocale } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { DICTIONARIES, type Lang, type TranslationKey } from './translations'

const STORAGE_KEY = 'scheduler.lang'
const DEFAULT_LANG: Lang = 'vi'

const DATE_LOCALES: Record<Lang, Locale> = {
  vi: viDateLocale,
  en: enUS,
}

export type TranslateParams = Record<string, string | number> & {
  count?: number
}

interface I18nContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, params?: TranslateParams) => string
  /** date-fns locale matching the active language. */
  dateLocale: Locale
}

const I18nContext = createContext<I18nContextValue | null>(null)

/** Dịch một khoá theo `lang`; khoá không có ở ngôn ngữ đó thì lấy bản `en`. */
function translate(lang: Lang, key: TranslationKey, params?: TranslateParams): string {
  const dict = DICTIONARIES[lang] as Record<string, string>
  const fallback = DICTIONARIES.en as Record<string, string>

  // Plural keys (`foo_one` / `foo_other`) win when a count is supplied,
  // otherwise fall back to the bare key — which is what `vi` defines.
  let template: string | undefined
  if (params && typeof params.count === 'number') {
    const suffix = params.count === 1 ? '_one' : '_other'
    template = dict[key + suffix] ?? fallback[key + suffix]
  }
  template ??= dict[key] ?? fallback[key] ?? key

  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'vi' || stored === 'en') return stored
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return DEFAULT_LANG
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just won't survive a reload.
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: TranslateParams) => translate(lang, key, params),
    [lang],
  )

  const value = useMemo(
    () => ({ lang, setLang, t, dateLocale: DATE_LOCALES[lang] }),
    [lang, setLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Ép một nhánh giao diện dùng cố định một ngôn ngữ, bất kể lựa chọn của
 * người dùng — trang Trạng thái luôn tiếng Anh cho chuẩn thuật ngữ. Không
 * đổi `<html lang>` hay lựa chọn đã lưu; `setLang` bên trong vẫn đổi ngôn
 * ngữ của cả app. Gắn `lang` lên phần tử bọc nhánh đó cho trình đọc màn hình.
 */
export function FixedLang({ lang, children }: { lang: Lang; children: ReactNode }) {
  const { setLang } = useI18n()
  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key: TranslationKey, params?: TranslateParams) => translate(lang, key, params),
      dateLocale: DATE_LOCALES[lang],
    }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
