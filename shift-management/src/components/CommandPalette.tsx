import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Bell,
  Calculator,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  KeyRound,
  Languages,
  LayoutList,
  LogOut,
  Monitor,
  Moon,
  Plus,
  ScrollText,
  Search,
  Sun,
  User,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import type { Lang, TranslationKey } from '../i18n/translations'
import { useNotifications } from '../notifications/NotificationContext'
import { useTheme, type ThemePref } from '../theme/ThemeContext'
import { quickCalc, type CalcResult } from '../lib/quickCalc'
import { scrollRoot } from '../lib/scrollRoot'
import { formatMinutesDuration, fromDateKey, toDateKey } from '../lib/time'
import { useExitAnimation } from './useExitAnimation'
import { useTwoStep } from './useTwoStep'

type Group = 'result' | 'nav' | 'action' | 'staff'

interface Command {
  id: string
  group: Group
  icon: typeof Search
  label: string
  hint?: string
  /** Từ khoá để tìm, đã bỏ dấu — gồm cả tiếng Việt lẫn tiếng Anh. */
  keywords: string
  /** `keep`: giữ bảng mở (chép kết quả, bấm đăng xuất lần đầu). */
  run: () => 'close' | 'keep'
}

const GROUP_LABEL: Record<Group, TranslationKey> = {
  result: 'palette.group.result',
  nav: 'palette.group.nav',
  action: 'palette.group.action',
  staff: 'palette.group.staff',
}

/** Tên ngôn ngữ viết bằng chính ngôn ngữ đó — giống nhau ở mọi giao diện. */
const LANG_NAME: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English' }

/** "Ngày" → "ngay": gõ không dấu vẫn tìm được. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
}

/**
 * Bảng lệnh nhanh, mở bằng Ctrl + K (⌘K trên Mac): đi tới trang, chạy thao
 * tác, xem ca của một người, và tính nhanh (số, giờ, ngày — xem
 * lib/quickCalc.ts). Kết quả là ngày thì Enter mở lịch ngày đó; số / giờ /
 * thời lượng thì Enter chép.
 */
export function CommandPalette({
  onClose,
  onCreateShift,
  onChangePassword,
  onSignOut,
}: {
  onClose: () => void
  onCreateShift: () => void
  onChangePassword: () => void
  onSignOut: () => void
}) {
  const { t, lang, setLang, dateLocale } = useI18n()
  const { user } = useAuth()
  const { profiles } = useSchedule()
  const { pref, setPref } = useTheme()
  const { setCenterOpen } = useNotifications()
  const navigate = useNavigate()
  const signOut = useTwoStep(onSignOut)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useExitAnimation(rootRef, 260)

  // Như Modal: khoá cuộn trang phía sau.
  useEffect(() => {
    const locked = [document.documentElement, scrollRoot()].filter(
      (el): el is HTMLElement => el !== null,
    )
    const previous = locked.map((el) => el.style.overflow)
    locked.forEach((el) => (el.style.overflow = 'hidden'))
    return () => locked.forEach((el, i) => (el.style.overflow = previous[i]))
  }, [])

  useEffect(() => {
    if (!copiedId) return
    const id = window.setTimeout(() => setCopiedId(null), 1500)
    return () => window.clearTimeout(id)
  }, [copiedId])

  const isAdmin = user?.role === 'admin'

  // ---- danh sách lệnh cố định ---------------------------------------------
  const fixed = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path)
      return 'close' as const
    }
    const themes: { id: ThemePref; icon: typeof Sun; label: TranslationKey; kw: string }[] = [
      { id: 'light', icon: Sun, label: 'theme.light', kw: 'giao dien sang theme light' },
      { id: 'dark', icon: Moon, label: 'theme.dark', kw: 'giao dien toi theme dark' },
      { id: 'system', icon: Monitor, label: 'theme.systemShort', kw: 'giao dien he thong theme system auto' },
    ]
    const other: Lang = lang === 'vi' ? 'en' : 'vi'
    const list: Command[] = [
      { id: 'nav-day', group: 'nav', icon: CalendarDays, label: t('nav.timeline'), keywords: 'lich ngay schedule calendar day timeline', run: go('/') },
      { id: 'nav-week', group: 'nav', icon: CalendarDays, label: t('palette.weekView'), keywords: 'lich tuan schedule calendar week', run: go('/?view=week') },
      { id: 'nav-month', group: 'nav', icon: CalendarDays, label: t('palette.monthView'), keywords: 'lich thang schedule calendar month', run: go('/?view=month') },
      { id: 'nav-shifts', group: 'nav', icon: LayoutList, label: t('nav.allShifts'), keywords: 'tat ca ca all shifts list danh sach', run: go('/shifts') },
      { id: 'nav-summary', group: 'nav', icon: ClipboardCheck, label: t('nav.summary'), keywords: 'tong ket summary cham cong tinh cong hours', run: go('/summary') },
      { id: 'nav-mine', group: 'nav', icon: User, label: t('nav.myShifts'), keywords: 'ca cua toi my shifts', run: go('/my-shifts') },
      { id: 'nav-pending', group: 'nav', icon: Clock3, label: t('nav.pending'), keywords: 'cho xac nhan pending diem danh confirm', run: go('/pending') },
      { id: 'nav-logs', group: 'nav', icon: ScrollText, label: t('nav.actionLog'), keywords: 'nhat ky activity log logs', run: go('/logs') },
      { id: 'nav-status', group: 'nav', icon: Wifi, label: t('nav.status'), keywords: 'trang thai status ket noi connection', run: go('/status') },
      ...(isAdmin
        ? [{ id: 'nav-accounts', group: 'nav' as const, icon: UserCog, label: t('nav.accounts'), keywords: 'tai khoan accounts users nguoi dung an hien', run: go('/accounts') }]
        : []),
      {
        id: 'act-new', group: 'action', icon: Plus, label: t('nav.newShift'), keywords: 'tao ca moi new shift create them',
        run: () => (onCreateShift(), 'close'),
      },
      {
        id: 'act-notif', group: 'action', icon: Bell, label: t('notif.title'), keywords: 'thong bao notifications',
        run: () => (setCenterOpen(true), 'close'),
      },
      ...themes.map((th): Command => ({
        id: `act-theme-${th.id}`, group: 'action', icon: th.icon,
        label: t('palette.theme', { theme: t(th.label) }),
        hint: pref === th.id ? t('palette.current') : undefined,
        keywords: th.kw,
        run: () => (setPref(th.id), 'keep'),
      })),
      {
        id: 'act-lang', group: 'action', icon: Languages,
        label: t('palette.lang', { lang: LANG_NAME[other] }),
        keywords: 'ngon ngu language tieng viet english doi',
        run: () => (setLang(other), 'keep'),
      },
      {
        id: 'act-pwd', group: 'action', icon: KeyRound, label: t('pwd.title'), keywords: 'doi mat khau password change',
        run: () => (onChangePassword(), 'close'),
      },
      {
        id: 'act-signout', group: 'action', icon: LogOut,
        label: signOut.armed ? t('auth.signOutAgain') : t('auth.signOut'),
        keywords: 'dang xuat sign out logout thoat',
        run: () => (signOut.press(), 'keep'),
      },
    ]
    return list
  }, [t, lang, pref, isAdmin, navigate, setPref, setLang, setCenterOpen, onCreateShift, onChangePassword, signOut])

  // ---- kết quả tính nhanh ---------------------------------------------------
  const calc = useMemo(() => quickCalc(query), [query])

  const results = useMemo<Command[]>(() => {
    const numberFmt = new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
      maximumFractionDigits: 10,
    })
    const copyCmd = (id: string, text: string, label: string, hint?: string): Command => ({
      id,
      group: 'result',
      icon: Calculator,
      label,
      hint: copiedId === id ? t('palette.copied') : (hint ?? t('palette.copy')),
      keywords: '',
      run: () => {
        void navigator.clipboard?.writeText(text)
        setCopiedId(id)
        return 'keep'
      },
    })
    const dayLabel = (d: Date) => format(d, 'EEEE, d/M/yyyy', { locale: dateLocale })

    return calc.map((r: CalcResult, i): Command => {
      const id = `calc-${i}`
      switch (r.kind) {
        case 'number': {
          const text = numberFmt.format(r.value)
          return copyCmd(id, String(Number(r.value.toFixed(10))), `= ${text}`)
        }
        case 'time': {
          const hhmm = `${String(Math.floor(r.minutes / 60)).padStart(2, '0')}:${String(r.minutes % 60).padStart(2, '0')}`
          const shift = r.dayOffset
            ? ` (${r.dayOffset > 0 ? '+' : '−'}${t('palette.days', { count: Math.abs(r.dayOffset) })})`
            : ''
          return copyCmd(id, hhmm, `= ${hhmm}${shift}`)
        }
        case 'duration': {
          const text = formatMinutesDuration(r.minutes)
          return copyCmd(id, text, `= ${text}`, `${t('palette.minutes', { count: r.minutes })} · ${copiedId === id ? t('palette.copied') : t('palette.copy')}`)
        }
        case 'days': {
          const text = t('palette.days', { count: r.days })
          return copyCmd(id, String(r.days), `= ${text}`)
        }
        case 'date':
          return {
            id, group: 'result', icon: CalendarDays,
            label: `= ${dayLabel(fromDateKey(r.date))}`,
            hint: t('palette.openDay'), keywords: '',
            run: () => (navigate(`/?date=${r.date}`), 'close'),
          }
        case 'datetime':
          return {
            id, group: 'result', icon: CalendarDays,
            label: `= ${format(r.at, 'HH:mm')} · ${dayLabel(r.at)}`,
            hint: t('palette.openDay'), keywords: '',
            run: () => (navigate(`/?date=${toDateKey(r.at)}`), 'close'),
          }
      }
    })
  }, [calc, lang, dateLocale, copiedId, t, navigate])

  // ---- lọc ------------------------------------------------------------------
  const items = useMemo<Command[]>(() => {
    const tokens = fold(query).split(/\s+/).filter(Boolean)
    const matches = (c: Command) => {
      const hay = fold(`${c.label} ${c.keywords}`)
      return tokens.every((tok) => hay.includes(tok))
    }
    // Chỉ gợi ý người khi đã gõ: danh sách cả nhóm ngay từ đầu thì quá dài.
    const staff: Command[] = tokens.length
      ? profiles.map((p) => ({
          id: `staff-${p.id}`,
          group: 'staff' as const,
          icon: Users,
          label: t('palette.staffShifts', { name: p.display_name }),
          hint: p.email,
          keywords: `${p.email} ca shifts`,
          run: () => (navigate(`/shifts?staff=${p.id}`), 'close' as const),
        }))
      : []
    return [...results, ...fixed.filter(matches), ...staff.filter(matches).slice(0, 6)]
  }, [query, results, fixed, profiles, t, navigate])

  const activeIndex = Math.min(active, Math.max(0, items.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function runAt(index: number) {
    const cmd = items[index]
    if (!cmd) return
    if (cmd.run() === 'close') onClose()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((activeIndex + 1) % Math.max(1, items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((activeIndex - 1 + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(activeIndex)
    } else if (e.key === 'Escape') {
      // Không để Esc lọt xuống hộp thoại đang mở phía dưới (nếu có).
      e.stopPropagation()
      onClose()
    }
  }

  const mac = /Mac|iPhone|iPad/.test(navigator.userAgent)

  return (
    <div ref={rootRef} className="fixed inset-0 z-[55]">
      <div
        aria-hidden="true"
        onMouseDown={onClose}
        className="modal-backdrop absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] dark:bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        className="palette-panel relative mx-auto mt-[max(1rem,10vh)] flex max-h-[min(36rem,80dvh)] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('palette.placeholder')}
            aria-label={t('palette.title')}
            className="min-h-13 w-full bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                {t('palette.empty')}
              </p>
              <p className="mt-1 text-xs text-slate-500">{t('palette.examples')}</p>
            </div>
          ) : (
            items.map((cmd, i) => {
              const Icon = cmd.icon
              const newGroup = i === 0 || items[i - 1].group !== cmd.group
              const isActive = i === activeIndex
              const danger = cmd.id === 'act-signout' && signOut.armed
              return (
                <div key={cmd.id}>
                  {newGroup && (
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400">
                      {t(GROUP_LABEL[cmd.group])}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => runAt(i)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      danger
                        ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                        : isActive
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-700'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive || danger ? '' : 'text-slate-400'
                      }`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate ${
                        cmd.group === 'result' ? 'font-semibold tabular-nums' : ''
                      }`}
                    >
                      {cmd.label}
                    </span>
                    {cmd.hint && (
                      <span className="shrink-0 truncate text-xs text-slate-400">
                        {cmd.hint}
                      </span>
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span>
            <kbd className="font-semibold">↑↓</kbd> {t('palette.hintMove')}
          </span>
          <span>
            <kbd className="font-semibold">Enter</kbd> {t('palette.hintRun')}
          </span>
          <span className="ml-auto">
            <kbd className="font-semibold">{mac ? '⌘K' : 'Ctrl K'}</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}
