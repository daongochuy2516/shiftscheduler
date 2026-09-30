import {
  addMinutes,
  format,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns'
import {
  Check,
  CalendarOff,
  NotebookPen,
  Pencil,
  ScrollText,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ShiftAssignment, ShiftWithAssignments, UUID } from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { useShiftEditor } from './ShiftEditorProvider'
import { useShiftColor } from '../data/useShiftColor'
import {
  checkInOpensAt,
  checkInWindow,
  isRestricted,
} from '../lib/attendance'
import {
  formatDuration,
  formatRange,
  fromDateKey,
  toMinutes,
} from '../lib/time'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import { StatusBadge } from './StatusBadge'

/** Xác nhận cần hỏi lại: ca của người khác, hoặc ca của mình chưa tới giờ. */
interface ConfirmTarget {
  kind: 'other' | 'early'
  assignment: ShiftAssignment
  shift: ShiftWithAssignments
  name: string
}

function hasStarted(date: string, startTime: string): boolean {
  return addMinutes(fromDateKey(date), toMinutes(startTime)) <= new Date()
}

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
  const shiftColor = useShiftColor()
  const { openEdit } = useShiftEditor()
  const { user } = useAuth()
  const [busyId, setBusyId] = useState<UUID | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(
    null,
  )
  const [confirmError, setConfirmError] = useState<string | null>(null)
  /** Nhân viên thường: chỉ điểm danh lượt của mình, và chỉ trong giờ. */
  const restricted = isRestricted(user)

  // Nút điểm danh phải tự hiện ra khi tới giờ, không bắt người đang chờ F5.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

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
    setConfirmError(null)
    try {
      await setAssignmentStatus(assignmentId, 'confirmed')
    } catch (err) {
      // Database là nơi quyết định (đồng hồ máy chủ): câu từ chối hiện nguyên văn.
      setConfirmError(err instanceof Error ? err.message : String(err))
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
      {confirmError && (
        <p
          role="alert"
          className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
        >
          {confirmError}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.date}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <span className="capitalize">{dateHeading(group.date)}</span>
          </h2>

          <div className="space-y-3">
            {group.shifts.map((shift) => {
              const color = shiftColor(shift)
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
                      const isOwn = assignment.user_id === user?.id
                      const pending = assignment.status === 'pending'
                      const gate = checkInWindow(
                        shift.date,
                        assignment.start_time,
                        assignment.end_time,
                        now,
                      )
                      // Lượt của người khác: nhân viên không có nút nào để bấm.
                      const blocked = restricted && isOwn && gate !== 'open'
                      const canConfirm =
                        pending && (!restricted || (isOwn && gate === 'open'))
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

                            {assignment.confirmed_at && (
                              <span className="text-xs text-slate-400 tabular-nums">
                                {t('list.checkedInAt', {
                                  time: format(
                                    new Date(assignment.confirmed_at),
                                    'HH:mm d/M',
                                  ),
                                })}
                              </span>
                            )}

                            {pending && blocked && (
                              <span className="ml-auto text-xs text-slate-500 sm:ml-0">
                                {gate === 'early'
                                  ? t('list.checkInOpens', {
                                      time: format(
                                        checkInOpensAt(
                                          shift.date,
                                          assignment.start_time,
                                        ),
                                        'HH:mm d/M',
                                      ),
                                    })
                                  : t('list.checkInClosed')}
                              </span>
                            )}

                            {canConfirm && (
                              <button
                                type="button"
                                onClick={() => {
                                  const kind =
                                    assignment.user_id !== user?.id
                                      ? 'other'
                                      : !hasStarted(
                                            shift.date,
                                            assignment.start_time,
                                          )
                                        ? 'early'
                                        : null
                                  if (!kind) {
                                    void confirm(assignment.id)
                                    return
                                  }
                                  setConfirmTarget({
                                    kind,
                                    assignment,
                                    shift,
                                    name:
                                      profile?.display_name ??
                                      t('common.unknownStaff'),
                                  })
                                }}
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

      {confirmTarget && (
        <Modal
          title={t(
            confirmTarget.kind === 'other'
              ? 'list.confirmOther.title'
              : 'list.confirmEarly.title',
          )}
          width="max-w-lg"
          onClose={() => setConfirmTarget(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirm(confirmTarget.assignment.id)
                  setConfirmTarget(null)
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-500"
              >
                <Check className="h-4 w-4" />
                {t('list.confirm')}
              </button>
            </>
          }
        >
          <p className="text-sm text-pretty text-slate-700">
            {confirmTarget.kind === 'other'
              ? t('list.confirmOther.body', { name: confirmTarget.name })
              : t('list.confirmEarly.body')}
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <Avatar
              name={confirmTarget.name}
              seed={confirmTarget.assignment.user_id}
              size="sm"
            />
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium text-slate-900">
                {confirmTarget.name} · {confirmTarget.shift.title}
              </p>
              <p className="text-slate-500 capitalize">
                {format(fromDateKey(confirmTarget.shift.date), 'EEEE, d/M', {
                  locale: dateLocale,
                })}{' '}
                ·{' '}
                {formatRange(
                  confirmTarget.assignment.start_time,
                  confirmTarget.assignment.end_time,
                )}
              </p>
            </div>
          </div>
          {confirmTarget.kind === 'other' && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <ScrollText className="h-3.5 w-3.5 shrink-0" />
              {t('list.confirmOther.logged')}
            </p>
          )}
        </Modal>
      )}
    </div>
  )
}
