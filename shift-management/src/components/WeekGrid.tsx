import { useMemo } from 'react'
import { addDays, format, isSameDay } from 'date-fns'
import { CalendarOff, Clock3 } from 'lucide-react'
import type { Profile, ShiftWithAssignments, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useShiftColor } from '../data/useShiftColor'
import {
  formatMinutesDuration,
  formatRange,
  normalizeTime,
  toDateKey,
  toMinutes,
} from '../lib/time'
import { Avatar } from './Avatar'

const LEFT_COL = 176
const DAY_MIN = 132
const TOTAL_COL = 76

interface Cell {
  shift: ShiftWithAssignments
  assignmentId: UUID
  start: string
  end: string
  pending: boolean
}

export function WeekGrid({
  weekStart,
  shifts,
  profiles,
  currentUserId,
  hideEmptyStaff,
  onSelectAssignment,
  onSelectDay,
}: {
  /** First day of the displayed week. */
  weekStart: Date
  /** Shifts already filtered to this week. */
  shifts: ShiftWithAssignments[]
  profiles: Profile[]
  currentUserId: UUID | null
  hideEmptyStaff: boolean
  onSelectAssignment: (shift: ShiftWithAssignments, assignmentId: UUID) => void
  onSelectDay: (date: Date) => void
}) {
  const { t, dateLocale } = useI18n()
  const shiftColor = useShiftColor()
  const today = toDateKey(new Date())

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  /** user id -> date key -> that person's blocks on that day. */
  const byUser = useMemo(() => {
    const map = new Map<UUID, Map<string, Cell[]>>()
    for (const shift of shifts) {
      for (const a of shift.assignments) {
        const days = map.get(a.user_id) ?? new Map<string, Cell[]>()
        const cells = days.get(shift.date) ?? []
        cells.push({
          shift,
          assignmentId: a.id,
          start: normalizeTime(a.start_time),
          end: normalizeTime(a.end_time),
          pending: a.status === 'pending',
        })
        days.set(shift.date, cells)
        map.set(a.user_id, days)
      }
    }
    // Keep each day's blocks in clock order.
    for (const days of map.values()) {
      for (const cells of days.values()) {
        cells.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
      }
    }
    return map
  }, [shifts])

  const rows = useMemo(() => {
    const ordered = [...profiles].sort((a, b) => {
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return a.display_name.localeCompare(b.display_name)
    })
    return ordered
      .map((profile) => {
        const days = byUser.get(profile.id) ?? new Map<string, Cell[]>()
        let minutes = 0
        for (const cells of days.values()) {
          for (const c of cells) minutes += toMinutes(c.end) - toMinutes(c.start)
        }
        const count = [...days.values()].reduce((n, c) => n + c.length, 0)
        return { profile, days, minutes, count }
      })
      .filter((row) => !hideEmptyStaff || row.count > 0)
  }, [profiles, byUser, currentUserId, hideEmptyStaff])

  const gridTemplate = `${LEFT_COL}px repeat(7, minmax(${DAY_MIN}px, 1fr)) ${TOTAL_COL}px`
  const minWidth = LEFT_COL + 7 * DAY_MIN + TOTAL_COL

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="thin-scrollbar overflow-x-auto">
        <div style={{ minWidth }}>
          {/* ---- day header ---- */}
          <div
            className="grid border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {t('common.staff')}
            </div>
            {days.map((day) => {
              const isToday = toDateKey(day) === today
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  title={t('timeline.openDay')}
                  className={`border-r border-slate-200 px-2 py-2 text-left transition last:border-r-0 hover:bg-slate-100 ${
                    isToday ? 'bg-indigo-50' : ''
                  }`}
                >
                  <span
                    className={`block text-xs font-medium capitalize ${
                      isToday ? 'text-indigo-600' : 'text-slate-500'
                    }`}
                  >
                    {format(day, 'EEE', { locale: dateLocale })}
                  </span>
                  <span
                    className={`block text-sm font-semibold ${
                      isToday ? 'text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {format(day, 'd MMM', { locale: dateLocale })}
                  </span>
                </button>
              )
            })}
            <div className="px-2 py-2 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {t('timeline.weekTotal')}
            </div>
          </div>

          {/* ---- staff rows ---- */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <CalendarOff className="h-6 w-6 text-slate-300" />
              {profiles.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-600">
                    {t('timeline.noStaffAccounts')}
                  </p>
                  <p className="max-w-sm text-sm text-slate-500">
                    {t('timeline.noStaffAccountsHint')}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-slate-600">
                  {t('timeline.nobodyScheduledWeek')}
                </p>
              )}
            </div>
          ) : (
            rows.map((row) => {
              const isMe = row.profile.id === currentUserId
              return (
                <div
                  key={row.profile.id}
                  className={`grid border-b border-slate-100 last:border-b-0 ${
                    isMe ? 'bg-indigo-50/40' : ''
                  }`}
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div
                    className={`sticky left-0 z-20 flex items-center gap-2 border-r border-slate-200 px-3 py-2 ${
                      isMe ? 'bg-indigo-50' : 'bg-white'
                    }`}
                  >
                    <Avatar
                      name={row.profile.display_name}
                      seed={row.profile.id}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {row.profile.display_name}
                      </p>
                      {isMe && (
                        <p className="text-[10px] font-medium text-indigo-600">
                          {t('common.you')}
                        </p>
                      )}
                    </div>
                  </div>

                  {days.map((day) => {
                    const key = toDateKey(day)
                    const cells = row.days.get(key) ?? []
                    return (
                      <div
                        key={key}
                        className={`space-y-1 border-r border-slate-100 p-1.5 last:border-r-0 ${
                          isSameDay(day, new Date()) ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        {cells.map((cell) => {
                          const color = shiftColor(cell.shift)
                          return (
                            <button
                              key={cell.assignmentId}
                              type="button"
                              onClick={() =>
                                onSelectAssignment(cell.shift, cell.assignmentId)
                              }
                              title={`${cell.shift.title} · ${formatRange(cell.start, cell.end)}`}
                              className={`block w-full rounded border px-1.5 py-1 text-left transition focus:ring-2 focus:ring-indigo-500 focus:outline-none ${color.block} ${
                                cell.pending ? 'border-dashed' : ''
                              }`}
                            >
                              <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
                                {cell.pending && (
                                  <Clock3 className="h-2.5 w-2.5 shrink-0 opacity-70" />
                                )}
                                <span className="truncate">
                                  {cell.shift.title}
                                </span>
                              </span>
                              <span className="block truncate text-[10px] opacity-75">
                                {cell.start}–{cell.end}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}

                  <div className="flex items-center justify-end px-2 py-2 text-xs font-medium tabular-nums text-slate-600">
                    {row.minutes > 0 ? formatMinutesDuration(row.minutes) : '—'}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
