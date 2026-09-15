import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ShiftTemplate } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { useSchedule, useShifts } from '../data/ScheduleContext'
import { formatRange, toDateKey } from '../lib/time'
import { shiftColor } from '../lib/colors'
import { Modal } from './Modal'

type PickerMode = 'week' | 'month'

/**
 * Asks which day(s) to claim a recurring template for, instead of silently
 * using whatever day the timeline happens to be showing.
 */
export function ClaimTemplateModal({
  template,
  viewedDate,
  onClose,
}: {
  template: ShiftTemplate
  /** The day the schedule page is currently showing. */
  viewedDate: Date
  onClose: () => void
}) {
  const { t, dateLocale } = useI18n()
  const { user } = useAuth()
  const { claimTemplate } = useSchedule()

  const [mode, setMode] = useState<PickerMode>('month')
  const [cursor, setCursor] = useState<Date>(viewedDate)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set([toDateKey(viewedDate)]),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todayKey = toDateKey(new Date())
  const color = shiftColor(template.id)

  /** Empty weekdays means the template repeats every day. */
  const isRepeatDay = (day: Date) =>
    template.weekdays.length === 0 || template.weekdays.includes(day.getDay())

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    })
  }, [mode, cursor])

  // Chỉ tải những ngày đang hiện trên lịch chọn. Chưa tải xong thì ô "đã
  // nhận" chưa kịp tô, nhưng không sao: nhận trùng một ngày là no-op ở
  // backend, không tạo ca hay phân công thừa.
  const { shifts } = useShifts({
    kind: 'range',
    from: toDateKey(days[0]),
    to: toDateKey(days[days.length - 1]),
  })

  /** Days this template is already claimed by the signed-in user. */
  const claimedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const shift of shifts) {
      if (shift.template_id !== template.id) continue
      if (shift.assignments.some((a) => a.user_id === user?.id)) {
        keys.add(shift.date)
      }
    }
    return keys
  }, [shifts, template.id, user?.id])

  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), 'EEEEEE', { locale: dateLocale }),
    )
  }, [dateLocale])

  function toggle(day: Date) {
    const key = toDateKey(day)
    if (claimedKeys.has(key)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function pickOnly(day: Date) {
    const key = toDateKey(day)
    if (claimedKeys.has(key)) return
    setSelected(new Set([key]))
    setCursor(day)
  }

  /** Adds every repeat day of the given week that isn't claimed already. */
  function addWeekRepeats(weekOffset: number) {
    const start = startOfWeek(addWeeks(new Date(), weekOffset), {
      weekStartsOn: 1,
    })
    setSelected((prev) => {
      const next = new Set(prev)
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i)
        const key = toDateKey(day)
        if (isRepeatDay(day) && !claimedKeys.has(key)) next.add(key)
      }
      return next
    })
    setCursor(start)
  }

  const viewedKey = toDateKey(viewedDate)
  const tomorrowKey = toDateKey(addDays(new Date(), 1))
  const showViewedChip = viewedKey !== todayKey && viewedKey !== tomorrowKey

  const headingText =
    mode === 'week'
      ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), 'd MMM', {
          locale: dateLocale,
        })} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), 'd MMM yyyy', {
          locale: dateLocale,
        })}`
      : format(cursor, 'MMMM yyyy', { locale: dateLocale })

  function step(direction: 1 | -1) {
    setCursor((c) =>
      mode === 'week' ? addWeeks(c, direction) : addMonths(c, direction),
    )
  }

  async function handleClaim() {
    if (!user || selected.size === 0) return
    setSaving(true)
    setError(null)
    try {
      // Sorted so a partial failure leaves the earliest days done.
      await claimTemplate(template.id, [...selected].sort(), user.id)
      onClose()
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : t('tpl.errClaim')} ${
          selected.size > 1 ? t('claim.partialError') : ''
        }`.trim(),
      )
      setSaving(false)
    }
  }

  const chipClass =
    'rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700'

  return (
    <Modal
      title={t('claim.title')}
      subtitle={t('claim.subtitle', { title: template.title })}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <span className="mr-auto text-sm text-slate-600">
            {selected.size === 0
              ? t('claim.none')
              : t('claim.selected', { count: selected.size })}
          </span>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleClaim}
            disabled={saving || selected.size === 0}
          >
            {saving
              ? t('tpl.claiming')
              : t('claim.action', { count: selected.size })}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </p>
        )}

        {/* ---- which shift ---- */}
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${color.block}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
          <span className="text-sm font-semibold">{template.title}</span>
          <span className="text-xs opacity-75">
            {formatRange(template.start_time, template.end_time)}
          </span>
        </div>

        {/* ---- quick picks ---- */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">
            {t('claim.quick')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={chipClass}
              onClick={() => pickOnly(new Date())}
            >
              {t('claim.today')}
            </button>
            <button
              type="button"
              className={chipClass}
              onClick={() => pickOnly(addDays(new Date(), 1))}
            >
              {t('claim.tomorrow')}
            </button>
            {showViewedChip && (
              <button
                type="button"
                className={chipClass}
                onClick={() => pickOnly(viewedDate)}
              >
                {t('claim.viewedDay')} ·{' '}
                {format(viewedDate, 'd/M', { locale: dateLocale })}
              </button>
            )}
            <button
              type="button"
              className={chipClass}
              onClick={() => addWeekRepeats(0)}
            >
              {t('claim.thisWeek')}
            </button>
            <button
              type="button"
              className={chipClass}
              onClick={() => addWeekRepeats(1)}
            >
              {t('claim.nextWeek')}
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setSelected(new Set())}
              >
                {t('claim.clear')}
              </button>
            )}
          </div>
        </div>

        {/* ---- calendar ---- */}
        <div className="rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={mode === 'week' ? t('view.prevWeek') : t('view.prevMonth')}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-slate-800 capitalize">
              {headingText}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={mode === 'week' ? t('view.nextWeek') : t('view.nextMonth')}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-auto flex rounded-md bg-slate-100 p-0.5">
              {(['week', 'month'] as PickerMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    mode === m
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m === 'week' ? t('view.week') : t('view.month')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 px-1.5 pt-1.5">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="pb-1 text-center text-[11px] font-medium text-slate-500 capitalize"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 px-1.5 pb-1.5">
            {days.map((day) => {
              const key = toDateKey(day)
              const isClaimed = claimedKeys.has(key)
              const isSelected = selected.has(key)
              const repeats = isRepeatDay(day)
              const isToday = key === todayKey
              const outsideMonth = mode === 'month' && !isSameMonth(day, cursor)
              const isPast = key < todayKey

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(day)}
                  disabled={isClaimed}
                  title={
                    isClaimed
                      ? t('claim.alreadyClaimed')
                      : !repeats
                        ? t('claim.notRepeatDay')
                        : format(day, 'EEEE, d MMMM', { locale: dateLocale })
                  }
                  className={`relative flex h-10 flex-col items-center justify-center rounded-md border text-sm transition ${
                    isClaimed
                      ? 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-700'
                      : isSelected
                        ? 'border-indigo-600 bg-indigo-600 font-semibold text-white'
                        : 'border-transparent hover:border-indigo-300 hover:bg-indigo-50'
                  } ${
                    !isClaimed && !isSelected
                      ? repeats
                        ? 'text-slate-800'
                        : 'text-slate-400'
                      : ''
                  } ${outsideMonth && !isSelected && !isClaimed ? 'opacity-45' : ''} ${
                    isPast && !isSelected && !isClaimed ? 'opacity-60' : ''
                  } ${isToday && !isSelected && !isClaimed ? 'ring-1 ring-indigo-400' : ''}`}
                >
                  {isClaimed ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    format(day, 'd')
                  )}
                  {repeats && !isClaimed && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-400" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ---- legend ---- */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-indigo-600" />
            {t('claim.legendSelected')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-emerald-200 bg-emerald-50" />
            {t('claim.legendClaimed')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-indigo-400" />
            {t('tpl.repeatOn')}
          </li>
        </ul>
      </div>
    </Modal>
  )
}
