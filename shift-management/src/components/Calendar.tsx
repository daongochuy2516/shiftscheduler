import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { fromDateKey, toDateKey } from '../lib/time'

/** Tuần bắt đầu từ thứ Hai, như lịch của cả app (ClaimTemplateModal, Tuần). */
const WEEK = { weekStartsOn: 1 } as const

/** Bảng chọn năm hiện 12 năm một lúc (4 hàng × 3). */
const YEAR_PAGE = 12

/**
 * Ba chế độ, như lịch của Windows: ngày → bấm tên tháng ra bảng 12 tháng →
 * bấm năm ra bảng 12 năm. Chọn xong thì quay về chế độ trước.
 */
type View = 'days' | 'months' | 'years'

/**
 * Lịch một tháng để chọn một ngày, thay cho bảng chọn ngày của trình duyệt.
 * Dùng thẳng trong một bảng có sẵn (bộ lọc Tất cả ca), hoặc qua DateInput.
 *
 * Bấm tên tháng trên đầu để chọn nhanh tháng, rồi năm.
 *
 * Bàn phím như lịch của hệ điều hành: ← → một ngày, ↑ ↓ một tuần, PageUp /
 * PageDown một tháng, Home / End đầu / cuối tuần, Enter / Space để chọn. Ngày
 * ngoài `min` / `max` mờ đi và không chọn được.
 *
 * Mọi ngày là chuỗi `yyyy-MM-dd` theo giờ máy (`toDateKey` / `fromDateKey`).
 */
export function Calendar({
  value,
  onChange,
  min,
  max,
  autoFocus = false,
}: {
  value: string
  onChange: (date: string) => void
  min?: string | null
  max?: string | null
  /** Đưa tiêu điểm vào ngày đang chọn (hoặc hôm nay) ngay khi hiện. */
  autoFocus?: boolean
}) {
  const { t, dateLocale } = useI18n()
  const [focused, setFocused] = useState(() => value || toDateKey(new Date()))
  const [month, setMonth] = useState(() => startOfMonth(fromDateKey(focused)))
  const [view, setView] = useState<View>('days')
  const gridRef = useRef<HTMLDivElement>(null)
  // Chỉ kéo tiêu điểm theo khi người dùng đang đi bằng phím trong lịch —
  // không cướp tiêu điểm lúc mới hiện (trừ autoFocus) hay lúc bấm ‹ ›.
  const keyboardMove = useRef(autoFocus)

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(month, WEEK),
        end: endOfWeek(endOfMonth(month), WEEK),
      }),
    [month],
  )
  const weekdays = useMemo(() => {
    const monday = startOfWeek(new Date(), WEEK)
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), 'EEEEE', { locale: dateLocale }),
    )
  }, [dateLocale])

  const outOfRange = (key: string) =>
    (!!min && key < min) || (!!max && key > max)
  /** Cả khoảng [from, to] nằm ngoài min / max — tháng / năm đó không chọn được gì. */
  const spanOutOfRange = (from: Date, to: Date) =>
    (!!min && toDateKey(to) < min) || (!!max && toDateKey(from) > max)

  const year = month.getFullYear()
  const yearStart = Math.floor(year / YEAR_PAGE) * YEAR_PAGE

  useEffect(() => {
    if (!keyboardMove.current) return
    keyboardMove.current = false
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus()
  }, [focused, month])

  function moveTo(next: Date) {
    const key = toDateKey(next)
    keyboardMove.current = true
    setFocused(key)
    if (!isSameMonth(next, month)) setMonth(startOfMonth(next))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const d = fromDateKey(focused)
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(d, -1),
      ArrowRight: () => addDays(d, 1),
      ArrowUp: () => addDays(d, -7),
      ArrowDown: () => addDays(d, 7),
      PageUp: () => addMonths(d, -1),
      PageDown: () => addMonths(d, 1),
      Home: () => startOfWeek(d, WEEK),
      End: () => endOfWeek(d, WEEK),
    }
    const move = moves[e.key]
    if (move) {
      e.preventDefault()
      moveTo(move())
    }
  }

  const navButton =
    'flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:h-8 sm:w-8'

  return (
    <div className="w-[17.5rem] select-none">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setMonth((m) =>
              view === 'days'
                ? addMonths(m, -1)
                : addYears(m, view === 'months' ? -1 : -YEAR_PAGE),
            )
          }
          aria-label={t(view === 'days' ? 'date.prevMonth' : 'date.prevYears')}
          className={navButton}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView(view === 'days' ? 'months' : 'years')}
          disabled={view === 'years'}
          aria-live="polite"
          className="rounded-md px-2 py-1 text-sm font-semibold text-slate-900 transition first-letter:uppercase hover:bg-slate-100 disabled:hover:bg-transparent"
        >
          {view === 'days'
            ? format(month, 'LLLL yyyy', { locale: dateLocale })
            : view === 'months'
              ? year
              : `${yearStart} – ${yearStart + YEAR_PAGE - 1}`}
        </button>
        <button
          type="button"
          onClick={() =>
            setMonth((m) =>
              view === 'days'
                ? addMonths(m, 1)
                : addYears(m, view === 'months' ? 1 : YEAR_PAGE),
            )
          }
          aria-label={t(view === 'days' ? 'date.nextMonth' : 'date.nextYears')}
          className={navButton}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {view === 'months' && (
        <div className="grid grid-cols-3 gap-1 py-1">
          {Array.from({ length: 12 }, (_, i) => {
            const m = new Date(year, i, 1)
            const current = isSameMonth(m, month)
            return (
              <button
                key={i}
                type="button"
                disabled={spanOutOfRange(m, endOfMonth(m))}
                onClick={() => {
                  setMonth(m)
                  setView('days')
                }}
                className={`h-14 rounded-md text-sm transition first-letter:uppercase disabled:cursor-not-allowed disabled:opacity-30 ${
                  current
                    ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {format(m, 'LLL', { locale: dateLocale })}
              </button>
            )
          })}
        </div>
      )}

      {view === 'years' && (
        <div className="grid grid-cols-3 gap-1 py-1">
          {Array.from({ length: YEAR_PAGE }, (_, i) => {
            const y = yearStart + i
            return (
              <button
                key={y}
                type="button"
                disabled={spanOutOfRange(new Date(y, 0, 1), new Date(y, 11, 31))}
                onClick={() => {
                  setMonth(new Date(y, month.getMonth(), 1))
                  setView('months')
                }}
                className={`h-14 rounded-md text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-30 ${
                  y === year
                    ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500'
                    : y === new Date().getFullYear()
                      ? 'font-semibold text-indigo-700 ring-1 ring-indigo-300 ring-inset hover:bg-indigo-50'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {y}
              </button>
            )
          })}
        </div>
      )}

      {view === 'days' && (
      <>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1">
            {w}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        role="grid"
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5"
      >
        {days.map((d) => {
          const key = toDateKey(d)
          const selected = key === value
          const disabled = outOfRange(key)
          const inMonth = isSameMonth(d, month)
          return (
            <button
              key={key}
              type="button"
              data-date={key}
              role="gridcell"
              aria-selected={selected}
              aria-label={format(d, 'PPPP', { locale: dateLocale })}
              disabled={disabled}
              // Chỉ một ô nhận Tab (roving tabindex): Tab vào lịch rồi đi bằng
              // phím mũi tên, không phải Tab qua 42 ô.
              tabIndex={key === focused ? 0 : -1}
              onFocus={() => setFocused(key)}
              onClick={() => onChange(key)}
              className={`flex h-10 items-center justify-center rounded-md text-sm tabular-nums transition outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-30 sm:h-8 ${
                selected
                  ? 'bg-indigo-600 font-semibold text-white hover:bg-indigo-500'
                  : isToday(d)
                    ? 'font-semibold text-indigo-700 ring-1 ring-indigo-300 ring-inset hover:bg-indigo-50'
                    : inMonth
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-300 hover:bg-slate-50'
              }`}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}
