import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Info,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { PageSkeleton } from '../components/PageSkeleton'
import { SummaryGrid } from '../components/SummaryGrid'
import { buildSummary } from '../lib/summary'
import { formatMinutesDuration, fromDateKey, toDateKey } from '../lib/time'
import type { TranslationKey } from '../i18n/translations'

type ViewMode = 'day' | 'week' | 'month'

const VIEWS: { id: ViewMode; label: TranslationKey }[] = [
  { id: 'day', label: 'view.day' },
  { id: 'week', label: 'view.week' },
  { id: 'month', label: 'view.month' },
]

/**
 * Tổng kết ca — ai đã trực ca nào, tổng bao nhiêu giờ.
 *
 * Khác trang Lịch ở chỗ nó chỉ đếm việc **đã trực xong**: một lượt phân công
 * vào bảng khi nhân viên đã xác nhận *và* đã qua giờ kết thúc của riêng người
 * đó (xem `lib/summary.ts`). Nhân viên không có ca bị ẩn theo mặc định.
 */
export function SummaryPage() {
  const [params, setParams] = useSearchParams()
  const { shifts, profiles, loading, error } = useSchedule()
  const { user } = useAuth()
  const { t, dateLocale } = useI18n()
  const [includeEmptyStaff, setIncludeEmptyStaff] = useState(false)

  // Mốc "đã qua giờ kết thúc" phải tự nhích theo thời gian, nếu không ca vừa
  // xong chỉ hiện ra sau khi người dùng F5. Một phút một lần là đủ mịn.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const view = ((): ViewMode => {
    const raw = params.get('view')
    return raw === 'day' || raw === 'month' ? raw : 'week'
  })()

  const date = useMemo(() => {
    const raw = params.get('date')
    if (raw) {
      const parsed = fromDateKey(raw)
      if (isValid(parsed)) return parsed
    }
    return new Date()
  }, [params])

  /** Giữ ngày + chế độ xem trong URL để gửi link được, như trang Lịch. */
  function navigate(next: Date, nextView: ViewMode = view) {
    const query: Record<string, string> = {}
    if (toDateKey(next) !== toDateKey(new Date())) query.date = toDateKey(next)
    if (nextView !== 'week') query.view = nextView
    setParams(query, { replace: true })
  }

  /**
   * Các ngày làm cột. Tháng lấy đúng tháng đó, không đệm cho tròn tuần như
   * lưới tháng bên Lịch: bảng tổng kết tháng 9 không nên cộng cả ngày 31/8.
   */
  const days = useMemo(() => {
    if (view === 'day') return [date]
    if (view === 'week') {
      const start = startOfWeek(date, { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end: addDays(start, 6) })
    }
    return eachDayOfInterval({
      start: startOfMonth(date),
      end: endOfMonth(date),
    })
  }, [view, date])

  const rangeStartKey = toDateKey(days[0])
  const rangeEndKey = toDateKey(days[days.length - 1])

  const visibleShifts = useMemo(
    () =>
      shifts.filter((s) => s.date >= rangeStartKey && s.date <= rangeEndKey),
    [shifts, rangeStartKey, rangeEndKey],
  )

  const { rows, totals, minutesByDate } = useMemo(
    () =>
      buildSummary({
        shifts: visibleShifts,
        profiles,
        now,
        currentUserId: user?.id ?? null,
        includeEmptyStaff,
      }),
    [visibleShifts, profiles, now, user?.id, includeEmptyStaff],
  )

  // ---- nhãn điều hướng ----------------------------------------------------
  const step = (direction: 1 | -1) => {
    if (view === 'day') return navigate(addDays(date, direction))
    if (view === 'week') return navigate(addDays(date, direction * 7))
    return navigate(addMonths(date, direction))
  }

  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const headingText =
    view === 'day'
      ? format(date, 'EEEE, d MMMM yyyy', { locale: dateLocale })
      : view === 'week'
        ? `${format(weekStart, 'd MMM', { locale: dateLocale })} – ${format(
            endOfWeek(date, { weekStartsOn: 1 }),
            'd MMM yyyy',
            { locale: dateLocale },
          )}`
        : format(date, 'MMMM yyyy', { locale: dateLocale })

  const jumpLabel =
    view === 'day'
      ? t('view.today')
      : view === 'week'
        ? t('view.thisWeek')
        : t('view.thisMonth')

  const prevLabel =
    view === 'day'
      ? t('view.prevDay')
      : view === 'week'
        ? t('view.prevWeek')
        : t('view.prevMonth')
  const nextLabel =
    view === 'day'
      ? t('view.nextDay')
      : view === 'week'
        ? t('view.nextWeek')
        : t('view.nextMonth')

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* ---- điều hướng thời gian + chế độ xem ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md bg-white shadow-xs ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={prevLabel}
            title={prevLabel}
            className="flex min-h-10 items-center rounded-l-md px-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 sm:min-h-0 sm:px-2 sm:py-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate(new Date())}
            className="min-h-10 border-x border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:min-h-0 sm:py-1.5"
          >
            {jumpLabel}
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={nextLabel}
            title={nextLabel}
            className="flex min-h-10 items-center rounded-r-md px-3 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 sm:min-h-0 sm:px-2 sm:py-1.5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="truncate capitalize">{headingText}</span>
          </h1>
          <p className="text-sm text-slate-500">
            {t('summary.title')} ·{' '}
            {t('timeline.assignmentCount', { count: totals.count })}
          </p>
        </div>

        <div className="order-3 ml-auto flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <div className="flex flex-1 rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200 sm:flex-none">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => navigate(date, v.id)}
                className={`min-h-10 flex-1 rounded px-2.5 text-sm font-medium transition sm:min-h-0 sm:flex-none sm:py-1 ${
                  view === v.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(v.label)}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 sm:h-3.5 sm:w-3.5"
              checked={includeEmptyStaff}
              onChange={(e) => setIncludeEmptyStaff(e.target.checked)}
            />
            <span className="hidden sm:inline">{t('summary.showAllStaff')}</span>
            <span className="sm:hidden">{t('summary.showAllStaffShort')}</span>
          </label>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('summary.stat.staff')} value={String(totals.staff)} />
        <Stat label={t('summary.stat.shifts')} value={String(totals.count)} />
        <Stat
          label={t('summary.stat.hours')}
          value={
            totals.minutes > 0 ? formatMinutesDuration(totals.minutes) : '—'
          }
        />
        <Stat
          label={t('summary.stat.notCounted')}
          value={String(totals.notCounted)}
          muted
        />
      </dl>

      {/* Luật ghi nhận phải nói thẳng ra, nếu không con số "Chưa ghi nhận"
          trông như dữ liệu bị mất. */}
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        {t('summary.rule')}
      </p>

      <SummaryGrid
        days={days}
        rows={rows}
        minutesByDate={minutesByDate}
        totalMinutes={totals.minutes}
        profileCount={profiles.length}
        currentUserId={user?.id ?? null}
        dense={view === 'month'}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-900/5">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 text-xl font-semibold tabular-nums ${
          muted ? 'text-slate-400' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
