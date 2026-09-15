import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import { Check, CalendarOff, NotebookPen, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ShiftAssignment, ShiftWithAssignments, UUID } from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { useShiftEditor } from './ShiftEditorProvider'
import { shiftColor } from '../lib/colors'
import {
  formatDuration,
  formatRange,
  fromDateKey,
  toMinutes,
} from '../lib/time'
import { Avatar } from './Avatar'
import { StatusBadge } from './StatusBadge'

export function ShiftList({
  shifts,
  emptyTitle,
  emptyHint,
  /** When set, only these assignments are listed inside each shift. */
  assignmentFilter,
  highlightUserId,
  order = 'asc',
}: {
  shifts: ShiftWithAssignments[]
  emptyTitle: string
  emptyHint?: string
  assignmentFilter?: (assignment: ShiftAssignment) => boolean
  highlightUserId?: UUID | null
  /**
   * Thứ tự các ngày. `desc` cho danh sách cuộn về quá khứ: ca cũ hơn phải
   * nối vào cuối, không chèn lên đầu làm màn hình giật. Trong một ngày ca
   * vẫn xếp theo giờ tăng dần.
   */
  order?: 'asc' | 'desc'
}) {
  const { profilesById, setAssignmentStatus } = useSchedule()
  const { t, dateLocale } = useI18n()
  const { openEdit } = useShiftEditor()
  const [busyId, setBusyId] = useState<UUID | null>(null)

  /** "Today · Monday, 8 September 2026", localised. */
  function dateHeading(dateKey: string): string {
    const d = fromDateKey(dateKey)
    const long = format(d, 'EEEE, d MMMM yyyy', { locale: dateLocale })
    if (isToday(d)) return `${t('list.today')} · ${long}`
    if (isTomorrow(d)) return `${t('list.tomorrow')} · ${long}`
    if (isYesterday(d)) return `${t('list.yesterday')} · ${long}`
    return long
  }

  const groups = useMemo(() => {
    const byDate = new Map<string, ShiftWithAssignments[]>()
    for (const shift of shifts) {
      const list = byDate.get(shift.date) ?? []
      list.push(shift)
      byDate.set(shift.date, list)
    }
    return [...byDate.entries()]
      .sort((a, b) =>
        order === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]),
      )
      .map(([date, items]) => ({
        date,
        shifts: items.sort(
          (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
        ),
      }))
  }, [shifts, order])

  async function confirm(assignmentId: UUID) {
    setBusyId(assignmentId)
    try {
      await setAssignmentStatus(assignmentId, 'confirmed')
    } finally {
      setBusyId(null)
    }
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-900/5">
        <CalendarOff className="h-7 w-7 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">{emptyTitle}</p>
        {emptyHint && <p className="text-sm text-slate-500">{emptyHint}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.date}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <span className="capitalize">{dateHeading(group.date)}</span>
          </h2>

          <div className="space-y-3">
            {group.shifts.map((shift) => {
              const color = shiftColor(shift.id)
              const visible = assignmentFilter
                ? shift.assignments.filter(assignmentFilter)
                : shift.assignments
              const sorted = [...visible].sort(
                (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
              )

              return (
                <article
                  key={shift.id}
                  className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5"
                >
                  <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
                    <h3 className="font-semibold text-slate-900">
                      {shift.title}
                    </h3>
                    <span className="text-sm text-slate-500">
                      {formatRange(shift.start_time, shift.end_time)}
                    </span>
                    <span className="text-sm text-slate-400">
                      ·{' '}
                      {t('timeline.staffCount', {
                        count: shift.assignments.length,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(shift)}
                      className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 sm:min-h-0 sm:px-2.5 sm:py-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('common.edit')}
                    </button>
                  </header>

                  {shift.note && (
                    <p className="flex items-start gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-sm text-slate-600">
                      <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {shift.note}
                    </p>
                  )}

                  <ul className="divide-y divide-slate-100">
                    {sorted.length === 0 && (
                      <li className="px-4 py-3 text-sm text-slate-500">
                        {t('list.noStaffAssigned')}
                      </li>
                    )}
                    {sorted.map((assignment) => {
                      const profile = profilesById.get(assignment.user_id)
                      const isMine = assignment.user_id === highlightUserId
                      return (
                        // Mobile: xếp dọc thành thẻ — tên và giờ ở hàng đầu,
                        // trạng thái và nút xác nhận ở hàng dưới. Nhồi sáu thứ
                        // vào một hàng ngang trên màn 360px sẽ xuống dòng lộn
                        // xộn và nút bấm bị bóp nhỏ.
                        <li
                          key={assignment.id}
                          className={`px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2 sm:py-2.5 ${
                            isMine ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 sm:contents">
                            <Avatar
                              name={profile?.display_name ?? '?'}
                              seed={assignment.user_id}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {profile?.display_name ??
                                  t('common.unknownStaff')}
                                {isMine && (
                                  <span className="ml-1.5 text-[11px] font-medium text-indigo-600">
                                    {t('common.you')}
                                  </span>
                                )}
                              </p>
                              {assignment.note && (
                                <p className="truncate text-xs text-slate-500">
                                  {assignment.note}
                                </p>
                              )}
                            </div>

                            <span className="shrink-0 text-sm tabular-nums text-slate-700 sm:ml-auto">
                              {formatRange(
                                assignment.start_time,
                                assignment.end_time,
                              )}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center gap-3 pl-9 sm:mt-0 sm:contents sm:pl-0">
                            <span className="text-xs text-slate-400 sm:w-16 sm:text-right">
                              {formatDuration(
                                assignment.start_time,
                                assignment.end_time,
                              )}
                            </span>

                            <StatusBadge status={assignment.status} size="sm" />

                            {assignment.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => confirm(assignment.id)}
                                disabled={busyId === assignment.id}
                                className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-60 sm:ml-0 sm:min-h-0 sm:px-2 sm:py-1"
                              >
                                <Check className="h-3 w-3" />
                                {busyId === assignment.id
                                  ? t('common.saving')
                                  : t('list.confirm')}
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
