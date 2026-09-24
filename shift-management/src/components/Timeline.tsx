import { useEffect, useMemo, useState } from 'react'
import { CalendarOff, Clock3 } from 'lucide-react'
import type { Profile, ShiftAssignment, ShiftWithAssignments, UUID } from '../types'
import { formatRange, normalizeTime, toDateKey, toMinutes } from '../lib/time'
import { useShiftColor } from '../data/useShiftColor'
import { useI18n } from '../i18n/I18nContext'
import { Avatar } from './Avatar'

const LEFT_COL = 176 // px — the sticky staff column
const HOUR_WIDTH = 76 // px per hour
const LANE_HEIGHT = 40
const LANE_GAP = 6

export interface HourRange {
  /** Whole hour, 0–23 */
  startHour: number
  /** Whole hour, 1–24 */
  endHour: number
}

interface PlacedAssignment {
  assignment: ShiftAssignment
  shift: ShiftWithAssignments
  lane: number
}

interface StaffRow {
  profile: Profile
  items: PlacedAssignment[]
  lanes: number
}

/**
 * Greedy interval packing: each assignment goes in the first lane whose last
 * block has already ended, otherwise a new lane is opened. This is what lets a
 * staff member hold two overlapping assignments without the blocks colliding.
 */
function packLanes(items: Omit<PlacedAssignment, 'lane'>[]): {
  placed: PlacedAssignment[]
  lanes: number
} {
  const sorted = [...items].sort(
    (a, b) =>
      toMinutes(a.assignment.start_time) - toMinutes(b.assignment.start_time),
  )
  const laneEnds: number[] = []
  const placed = sorted.map((item) => {
    const start = toMinutes(item.assignment.start_time)
    const end = toMinutes(item.assignment.end_time)
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    return { ...item, lane }
  })
  return { placed, lanes: Math.max(1, laneEnds.length) }
}

export function Timeline({
  date,
  shifts,
  profiles,
  range,
  currentUserId,
  hideEmptyStaff,
  onSelectAssignment,
}: {
  date: Date
  /** Shifts already filtered to `date`. */
  shifts: ShiftWithAssignments[]
  profiles: Profile[]
  range: HourRange
  currentUserId: UUID | null
  hideEmptyStaff: boolean
  onSelectAssignment: (shift: ShiftWithAssignments, assignmentId: UUID) => void
}) {
  const { t } = useI18n()
  const shiftColor = useShiftColor()
  const rangeStart = range.startHour * 60
  const rangeEnd = range.endHour * 60
  const span = Math.max(60, rangeEnd - rangeStart)
  const hours = useMemo(
    () =>
      Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i),
    [range.startHour, range.endHour],
  )
  const trackWidth = hours.length * HOUR_WIDTH

  const rows = useMemo<StaffRow[]>(() => {
    const byUser = new Map<UUID, Omit<PlacedAssignment, 'lane'>[]>()
    for (const shift of shifts) {
      for (const assignment of shift.assignments) {
        const list = byUser.get(assignment.user_id) ?? []
        list.push({ assignment, shift })
        byUser.set(assignment.user_id, list)
      }
    }

    const ordered = [...profiles].sort((a, b) => {
      // The signed-in user always sits at the top of the board.
      if (a.id === currentUserId) return -1
      if (b.id === currentUserId) return 1
      return a.display_name.localeCompare(b.display_name)
    })

    return ordered
      .map((profile) => {
        const { placed, lanes } = packLanes(byUser.get(profile.id) ?? [])
        return { profile, items: placed, lanes }
      })
      .filter((row) => !hideEmptyStaff || row.items.length > 0)
  }, [shifts, profiles, currentUserId, hideEmptyStaff])

  /** Assignments that fall entirely outside the visible hour window. */
  const clippedCount = useMemo(() => {
    let count = 0
    for (const shift of shifts) {
      for (const a of shift.assignments) {
        if (
          toMinutes(a.end_time) <= rangeStart ||
          toMinutes(a.start_time) >= rangeEnd
        ) {
          count += 1
        }
      }
    }
    return count
  }, [shifts, rangeStart, rangeEnd])

  // "Now" marker, only while looking at today.
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date()
      setNowMinutes(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])
  const isToday = toDateKey(date) === toDateKey(new Date())
  const showNow = isToday && nowMinutes >= rangeStart && nowMinutes <= rangeEnd
  const nowPct = ((nowMinutes - rangeStart) / span) * 100

  const totalAssignments = shifts.reduce((n, s) => n + s.assignments.length, 0)

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="thin-scrollbar overflow-x-auto">
        <div style={{ minWidth: LEFT_COL + trackWidth }}>
          {/* ---- hour header ---- */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
              style={{ width: LEFT_COL }}
            >
              {t('common.staff')}
            </div>
            <div className="relative" style={{ width: trackWidth }}>
              <div className="flex">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-r border-slate-200 py-2 pl-2 text-xs font-medium text-slate-500 last:border-r-0"
                    style={{ width: HOUR_WIDTH }}
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
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
                  {totalAssignments === 0
                    ? t('timeline.nobodyScheduled')
                    : t('timeline.noStaffMatch')}
                </p>
              )}
            </div>
          ) : (
            rows.map((row) => {
              const isMe = row.profile.id === currentUserId
              const height = row.lanes * (LANE_HEIGHT + LANE_GAP) + LANE_GAP
              return (
                <div
                  key={row.profile.id}
                  className={`flex border-b border-slate-100 last:border-b-0 ${
                    isMe ? 'bg-indigo-50/40' : ''
                  }`}
                >
                  <div
                    className={`sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-slate-200 px-3 ${
                      isMe ? 'bg-indigo-50' : 'bg-white'
                    }`}
                    style={{ width: LEFT_COL, height }}
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

                  <div
                    className="relative"
                    style={{ width: trackWidth, height }}
                  >
                    {/* hour grid lines */}
                    <div className="pointer-events-none absolute inset-0 flex">
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="border-r border-slate-100 last:border-r-0"
                          style={{ width: HOUR_WIDTH }}
                        />
                      ))}
                    </div>

                    {showNow && (
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-rose-400"
                        style={{ left: `${nowPct}%` }}
                      />
                    )}

                    {row.items.map(({ assignment, shift, lane }) => {
                      const start = toMinutes(assignment.start_time)
                      const end = toMinutes(assignment.end_time)
                      if (end <= rangeStart || start >= rangeEnd) return null

                      const clampedStart = Math.max(start, rangeStart)
                      const clampedEnd = Math.min(end, rangeEnd)
                      const left = ((clampedStart - rangeStart) / span) * 100
                      const width = ((clampedEnd - clampedStart) / span) * 100
                      const color = shiftColor(shift)
                      const pending = assignment.status === 'pending'

                      return (
                        <button
                          key={assignment.id}
                          type="button"
                          onClick={() => onSelectAssignment(shift, assignment.id)}
                          title={`${shift.title} · ${row.profile.display_name} · ${formatRange(
                            assignment.start_time,
                            assignment.end_time,
                          )}${pending ? ' · pending' : ''}`}
                          className={`absolute z-10 flex flex-col justify-center overflow-hidden rounded-md border px-2 text-left transition focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:outline-none ${
                            color.block
                          } ${pending ? 'border-dashed' : ''}`}
                          style={{
                            left: `${left}%`,
                            width: `max(${width}%, 44px)`,
                            top: lane * (LANE_HEIGHT + LANE_GAP) + LANE_GAP,
                            height: LANE_HEIGHT,
                          }}
                        >
                          <span className="flex items-center gap-1 truncate text-xs font-semibold">
                            {pending && (
                              <Clock3 className="h-3 w-3 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{shift.title}</span>
                          </span>
                          <span className="truncate text-[11px] opacity-75">
                            {normalizeTime(assignment.start_time)}–
                            {normalizeTime(assignment.end_time)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {clippedCount > 0 && (
        <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {t('timeline.clipped', { count: clippedCount })}
        </p>
      )}
    </div>
  )
}
