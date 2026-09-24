import { useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { ShiftWithAssignments, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useShiftColor } from '../data/useShiftColor'
import { normalizeTime, toDateKey, toMinutes } from '../lib/time'

/** Chips shown per day cell before collapsing into a "+N more" line. */
const MAX_CHIPS = 3

export function MonthGrid({
  month,
  shifts,
  currentUserId,
  onSelectShift,
  onSelectDay,
}: {
  month: Date
  /** Shifts covering the whole visible grid, not just the month itself. */
  shifts: ShiftWithAssignments[]
  currentUserId: UUID | null
  onSelectShift: (shift: ShiftWithAssignments) => void
  onSelectDay: (date: Date) => void
}) {
  const { t, dateLocale } = useI18n()
  const shiftColor = useShiftColor()
  const todayKey = toDateKey(new Date())

  // The grid always shows whole weeks, so it spills into the neighbouring
  // months at both ends.
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [month])

  const byDate = useMemo(() => {
    const map = new Map<string, ShiftWithAssignments[]>()
    for (const shift of shifts) {
      const list = map.get(shift.date) ?? []
      list.push(shift)
      map.set(shift.date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
    }
    return map
  }, [shifts])

  const weekdayLabels = useMemo(
    () => days.slice(0, 7).map((d) => format(d, 'EEE', { locale: dateLocale })),
    [days, dateLocale],
  )

  return (
    <div className="thin-scrollbar overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      {/* Bảy cột trên màn 360px cho ra ô rộng chừng 48px, chip ca thành không
          đọc được. Đặt bề rộng tối thiểu rồi cho cuộn ngang — lịch là loại nội
          dung được phép cuộn ngang. Từ 640px trở lên vừa màn hình nên không
          xuất hiện thanh cuộn. */}
      <div className="min-w-[36rem] sm:min-w-0">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold text-slate-500 capitalize"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = toDateKey(day)
          const dayShifts = byDate.get(key) ?? []
          const inMonth = isSameMonth(day, month)
          const isToday = key === todayKey
          const overflow = dayShifts.length - MAX_CHIPS

          return (
            <div
              key={key}
              className={`min-h-26 border-r border-b border-slate-100 p-1.5 last:border-r-0 ${
                inMonth ? '' : 'bg-slate-50/60'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day)}
                title={t('timeline.openDay')}
                className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition ${
                  isToday
                    ? 'bg-indigo-600 text-white'
                    : inMonth
                      ? 'text-slate-700 hover:bg-slate-100'
                      : 'text-slate-400 hover:bg-slate-100'
                }`}
              >
                {format(day, 'd')}
              </button>

              <div className="space-y-1">
                {dayShifts.slice(0, MAX_CHIPS).map((shift) => {
                  const color = shiftColor(shift)
                  const mine = shift.assignments.some(
                    (a) => a.user_id === currentUserId,
                  )
                  const pending = shift.assignments.some(
                    (a) => a.status === 'pending',
                  )
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => onSelectShift(shift)}
                      title={`${shift.title} · ${normalizeTime(shift.start_time)}–${normalizeTime(
                        shift.end_time,
                      )}`}
                      className={`block w-full rounded border px-1.5 py-0.5 text-left transition focus:ring-2 focus:ring-indigo-500 focus:outline-none ${color.block} ${
                        pending ? 'border-dashed' : ''
                      } ${mine ? 'ring-1 ring-indigo-400' : ''}`}
                    >
                      <span className="block truncate text-[11px] font-semibold">
                        {shift.title}
                      </span>
                      <span className="block truncate text-[10px] opacity-75">
                        {normalizeTime(shift.start_time)} ·{' '}
                        {t('timeline.staffCount', {
                          count: shift.assignments.length,
                        })}
                      </span>
                    </button>
                  )
                })}

                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="block w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    {t('timeline.moreCount', { count: overflow })}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}
