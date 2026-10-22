import { useEffect, useMemo, useState } from 'react'
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
import {
  usePrefetchShifts,
  useSchedule,
  useShifts,
} from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { GridSkeleton, PageSkeleton } from '../components/PageSkeleton'
import { Checkbox } from '../components/Checkbox'
import { useUrlParams } from '../lib/urlParams'
import { SummaryGrid } from '../components/SummaryGrid'
import { buildSummary } from '../lib/summary'
import { formatMinutesDuration, fromDateKey, toDateKey } from '../lib/time'
import type { TranslationKey } from '../i18n/translations'
import { LoadError } from '../components/LoadError'

type ViewMode = 'day' | 'week' | 'month'

const VIEWS: { id: ViewMode; label: TranslationKey }[] = [
  { id: 'day', label: 'view.day' },
  { id: 'week', label: 'view.week' },
  { id: 'month', label: 'view.month' },
]

/**
 * Các ngày làm cột. Tháng lấy đúng tháng đó, không đệm cho tròn tuần như
 * lưới tháng bên Lịch: bảng tổng kết tháng 9 không nên cộng cả ngày 31/8.
 */
function daysFor(view: ViewMode, d: Date): Date[] {
  if (view === 'day') return [d]
  if (view === 'week') {
    const start = startOfWeek(d, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end: addDays(start, 6) })
  }
  return eachDayOfInterval({ start: startOfMonth(d), end: endOfMonth(d) })
}

function stepDate(view: ViewMode, d: Date, direction: 1 | -1): Date {
  if (view === 'day') return addDays(d, direction)
  if (view === 'week') return addDays(d, direction * 7)
  return addMonths(d, direction)
}

function rangeOf(days: Date[]): { from: string; to: string } {
  return { from: toDateKey(days[0]), to: toDateKey(days[days.length - 1]) }
}

/**
 * Tổng kết ca — ai đã trực ca nào, tổng bao nhiêu giờ.
 *
 * Khác trang Lịch ở chỗ nó chỉ đếm việc **đã trực xong**: một lượt phân công
 * vào bảng khi nhân viên đã xác nhận *và* đã qua giờ kết thúc của riêng người
 * đó (xem `lib/summary.ts`). Nhân viên không có ca bị ẩn theo mặc định.
 */
export function SummaryPage() {
  const [params, updateParams] = useUrlParams()
  const { profiles, rosterProfiles, loading, error } = useSchedule()
  const { user } = useAuth()
  const { t, dateLocale } = useI18n()
  // Trên URL như ngày và chế độ xem, để link gửi đi giữ đúng bộ lọc.
  const includeEmptyStaff = params.get('all') === '1'
  const setIncludeEmptyStaff = (on: boolean) =>
    updateParams({ all: on ? '1' : null })

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
    updateParams({
      date: toDateKey(next) !== toDateKey(new Date()) ? toDateKey(next) : null,
      view: nextView !== 'week' ? nextView : null,
    })
  }

  const days = useMemo(() => daysFor(view, date), [view, date])
  const { from, to } = rangeOf(days)

  // Chỉ tải đúng khoảng đang tổng kết, rồi tải trước khoảng liền kề.
  const shiftsState = useShifts({ kind: 'range', from, to })
  const visibleShifts = shiftsState.shifts
  usePrefetchShifts(
    [
      { kind: 'range', ...rangeOf(daysFor(view, stepDate(view, date, -1))) },
      { kind: 'range', ...rangeOf(daysFor(view, stepDate(view, date, 1))) },
    ],
    shiftsState.loaded,
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
  const step = (direction: 1 | -1) => navigate(stepDate(view, date, direction))

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
      {(error ?? shiftsState.error) && (
        <LoadError message={error ?? shiftsState.error ?? ''} />
      )}

      {/* ---- điều hướng thời gian + chế độ xem ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md bg-white shadow-xs ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={prevLabel}
            data-tooltip={prevLabel}
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
            data-tooltip={nextLabel}
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
            {shiftsState.loaded
              ? t('timeline.assignmentCount', { count: totals.count })
              : t('common.loading')}
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
            <Checkbox
              className="h-5 w-5 sm:h-4 sm:w-4"
              checked={includeEmptyStaff}
              onChange={setIncludeEmptyStaff}
            />
            <span className="hidden sm:inline">{t('summary.showAllStaff')}</span>
            <span className="sm:hidden">{t('summary.showAllStaffShort')}</span>
          </label>
        </div>
      </div>

      {!shiftsState.loaded ? (
        <GridSkeleton />
      ) : (
        <>
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
            profileCount={rosterProfiles.length}
            currentUserId={user?.id ?? null}
            dense={view === 'month'}
          />
        </>
      )}
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
