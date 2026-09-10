import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { useShiftEditor } from '../components/ShiftEditorProvider'
import { Timeline, type HourRange } from '../components/Timeline'
import { WeekGrid } from '../components/WeekGrid'
import { MonthGrid } from '../components/MonthGrid'
import { TemplateBar } from '../components/TemplateBar'
import { PageSkeleton } from '../components/PageSkeleton'
import { shiftColor } from '../lib/colors'
import { formatRange, fromDateKey, toDateKey, toMinutes } from '../lib/time'
import type { TranslationKey } from '../i18n/translations'

type ViewMode = 'day' | 'week' | 'month'
type ScaleId = 'fit' | 'work' | 'business' | 'full'

const VIEWS: { id: ViewMode; label: TranslationKey }[] = [
  { id: 'day', label: 'view.day' },
  { id: 'week', label: 'view.week' },
  { id: 'month', label: 'view.month' },
]

const SCALES: { id: ScaleId; label: TranslationKey }[] = [
  { id: 'fit', label: 'timeline.scale.fit' },
  { id: 'work', label: 'timeline.scale.work' },
  { id: 'business', label: 'timeline.scale.business' },
  { id: 'full', label: 'timeline.scale.full' },
]

export function TimelinePage() {
  const [params, setParams] = useSearchParams()
  const { shifts, profiles, loading, error } = useSchedule()
  const { user } = useAuth()
  const { t, dateLocale } = useI18n()
  const { openCreate, openEdit } = useShiftEditor()
  const [scale, setScale] = useState<ScaleId>('fit')
  const [hideEmptyStaff, setHideEmptyStaff] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const view = ((): ViewMode => {
    const raw = params.get('view')
    return raw === 'week' || raw === 'month' ? raw : 'day'
  })()

  const date = useMemo(() => {
    const raw = params.get('date')
    if (raw) {
      const parsed = fromDateKey(raw)
      if (isValid(parsed)) return parsed
    }
    return new Date()
  }, [params])

  const dateKey = toDateKey(date)

  /** Writes date + view back to the URL, keeping both linkable. */
  function navigate(next: Date, nextView: ViewMode = view) {
    const query: Record<string, string> = {}
    if (toDateKey(next) !== toDateKey(new Date())) query.date = toDateKey(next)
    if (nextView !== 'day') query.view = nextView
    setParams(query, { replace: true })
  }

  // ---- the visible window, per view --------------------------------------
  const weekStart = useMemo(
    () => startOfWeek(date, { weekStartsOn: 1 }),
    [date],
  )

  const { rangeStartKey, rangeEndKey } = useMemo(() => {
    if (view === 'day') return { rangeStartKey: dateKey, rangeEndKey: dateKey }
    if (view === 'week') {
      return {
        rangeStartKey: toDateKey(weekStart),
        rangeEndKey: toDateKey(endOfWeek(date, { weekStartsOn: 1 })),
      }
    }
    // The month grid shows whole weeks, so it spills past the month itself.
    return {
      rangeStartKey: toDateKey(
        startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
      ),
      rangeEndKey: toDateKey(endOfWeek(endOfMonth(date), { weekStartsOn: 1 })),
    }
  }, [view, dateKey, weekStart, date])

  const visibleShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.date >= rangeStartKey && s.date <= rangeEndKey)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [shifts, rangeStartKey, rangeEndKey],
  )

  const dayShifts = useMemo(
    () => visibleShifts.filter((s) => s.date === dateKey),
    [visibleShifts, dateKey],
  )

  /** Hour window for the day view's horizontal scale. */
  const range = useMemo<HourRange>(() => {
    if (scale === 'full') return { startHour: 0, endHour: 24 }
    if (scale === 'work') return { startHour: 6, endHour: 22 }
    if (scale === 'business') return { startHour: 8, endHour: 20 }

    const times = dayShifts.flatMap((s) =>
      s.assignments.flatMap((a) => [
        toMinutes(a.start_time),
        toMinutes(a.end_time),
      ]),
    )
    if (times.length === 0) return { startHour: 8, endHour: 20 }

    let startHour = Math.max(0, Math.floor(Math.min(...times) / 60) - 1)
    let endHour = Math.min(24, Math.ceil(Math.max(...times) / 60) + 1)
    if (endHour - startHour < 6) {
      endHour = Math.min(24, startHour + 6)
      startHour = Math.max(0, endHour - 6)
    }
    return { startHour, endHour }
  }, [scale, dayShifts])

  // ---- header labels ------------------------------------------------------
  const step = (direction: 1 | -1) => {
    if (view === 'day') return navigate(addDays(date, direction))
    if (view === 'week') return navigate(addDays(date, direction * 7))
    return navigate(addMonths(date, direction))
  }

  const headingText =
    view === 'day'
      ? format(date, 'EEEE, d MMMM yyyy', { locale: dateLocale })
      : view === 'week'
        ? `${format(weekStart, 'd MMM', { locale: dateLocale })} – ${format(
            addDays(weekStart, 6),
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

  const countedShifts = view === 'day' ? dayShifts : visibleShifts
  const assignmentCount = countedShifts.reduce(
    (n, s) => n + s.assignments.length,
    0,
  )

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* ---- navigation + view switcher ---- */}
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
            <CalendarDays className="h-5 w-5 shrink-0 text-slate-400" />
            <span className="truncate capitalize">{headingText}</span>
          </h1>
          <p className="text-sm text-slate-500">
            {t('timeline.shiftCount', { count: countedShifts.length })} ·{' '}
            {t('timeline.assignmentCount', { count: assignmentCount })}
          </p>
        </div>

        {/* Ngày/Tuần/Tháng là lựa chọn chính nên luôn hiện. Trên mobile nó
            chiếm cả hàng, mỗi nút đủ 44px chiều cao. */}
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

          {/* Mobile: các tuỳ chọn phụ gom vào một sheet, giữ hàng này gọn. */}
          {view !== 'month' && (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={t('nav.filters')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white text-slate-600 shadow-xs ring-1 ring-slate-200 sm:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}

          {view !== 'month' && (
            <label className="hidden items-center gap-1.5 text-sm text-slate-600 sm:flex">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={hideEmptyStaff}
                onChange={(e) => setHideEmptyStaff(e.target.checked)}
              />
              {t('timeline.onlyStaffWorking')}
            </label>
          )}

          {view === 'day' && (
            <>
              <select
                aria-label={t('timeline.hourScale')}
                value={scale}
                onChange={(e) => setScale(e.target.value as ScaleId)}
                className="hidden rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 sm:block"
              >
                {SCALES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {t(s.label)}
                  </option>
                ))}
              </select>

              {/* Trên mobile việc này do nút nổi đảm nhiệm, và nút nổi cũng tạo
                  theo đúng ngày đang xem. */}
              <button
                type="button"
                onClick={() => openCreate(dateKey)}
                className="hidden items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 sm:inline-flex"
              >
                <Plus className="h-4 w-4" />
                {t('timeline.addShiftOnDay')}
              </button>
            </>
          )}
        </div>
      </div>

      {filtersOpen && (
        <Modal
          title={t('nav.filters')}
          width="max-w-md"
          onClose={() => setFiltersOpen(false)}
        >
          <div className="space-y-4">
            <label className="flex min-h-12 items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={hideEmptyStaff}
                onChange={(e) => setHideEmptyStaff(e.target.checked)}
              />
              {t('timeline.onlyStaffWorking')}
            </label>

            {view === 'day' && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  {t('timeline.hourScale')}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {SCALES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScale(s.id)}
                      aria-pressed={scale === s.id}
                      className={`min-h-11 rounded-md border px-3 text-sm font-medium transition ${
                        scale === s.id
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {t(s.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ---- quick-claim templates (day view only) ---- */}
      {view === 'day' && <TemplateBar date={date} />}

      {/* ---- the view itself ---- */}
      {view === 'day' && (
        <Timeline
          date={date}
          shifts={dayShifts}
          profiles={profiles}
          range={range}
          currentUserId={user?.id ?? null}
          hideEmptyStaff={hideEmptyStaff}
          onSelectAssignment={(shift, assignmentId) =>
            openEdit(shift, assignmentId)
          }
        />
      )}

      {view === 'week' && (
        <WeekGrid
          weekStart={weekStart}
          shifts={visibleShifts}
          profiles={profiles}
          currentUserId={user?.id ?? null}
          hideEmptyStaff={hideEmptyStaff}
          onSelectAssignment={(shift, assignmentId) =>
            openEdit(shift, assignmentId)
          }
          onSelectDay={(day) => navigate(day, 'day')}
        />
      )}

      {view === 'month' && (
        <MonthGrid
          month={date}
          shifts={visibleShifts}
          currentUserId={user?.id ?? null}
          onSelectShift={(shift) => openEdit(shift)}
          onSelectDay={(day) => navigate(day, 'day')}
        />
      )}

      {/* ---- shifts on this day (day view legend) ---- */}
      {view === 'day' && dayShifts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dayShifts.map((shift) => {
            const color = shiftColor(shift.id)
            return (
              <button
                key={shift.id}
                type="button"
                onClick={() => openEdit(shift)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm shadow-xs ring-1 ring-slate-200 transition hover:ring-slate-300"
              >
                <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                <span className="font-medium text-slate-800">{shift.title}</span>
                <span className="text-slate-500">
                  {formatRange(shift.start_time, shift.end_time)}
                </span>
                <span className="text-slate-400">
                  ·{' '}
                  {t('timeline.staffCount', {
                    count: shift.assignments.length,
                  })}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
