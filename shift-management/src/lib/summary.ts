import { addMinutes } from 'date-fns'
import type {
  Profile,
  ShiftAssignment,
  ShiftWithAssignments,
  UUID,
} from '../types'
import { fromDateKey, normalizeTime, toMinutes } from './time'

/**
 * Tổng kết ca — phần tính toán thuần, không dính React.
 *
 * Tổng kết không phải một bảng riêng dưới database: nó được suy ra từ chính
 * `shifts` + `shift_assignments`. Nhờ vậy nó luôn khớp với dữ liệu thật và
 * không cần thêm migration nào.
 */

/** Thời điểm kết thúc thật của một lượt phân công, để so với hiện tại. */
export function assignmentEndsAt(date: string, endTime: string): Date {
  return addMinutes(fromDateKey(date), toMinutes(normalizeTime(endTime)))
}

/**
 * Điều kiện vào tổng kết, đúng hai thứ:
 *
 * 1. Nhân viên **đã xác nhận** lượt phân công đó.
 * 2. **Đã qua giờ kết thúc của riêng người đó** — ca 01:00–06:00 thì 06:00
 *    mới được tính.
 *
 * Ca chưa xác nhận không bao giờ vào tổng kết, dù đã qua từ lâu.
 */
export function isRecorded(
  date: string,
  assignment: ShiftAssignment,
  now: Date,
): boolean {
  if (assignment.status !== 'confirmed') return false
  return assignmentEndsAt(date, assignment.end_time).getTime() <= now.getTime()
}

/** Một lượt đã trực xong, kèm sẵn số phút để cộng dồn. */
export interface RecordedEntry {
  assignmentId: UUID
  shiftId: UUID
  title: string
  /** yyyy-MM-dd */
  date: string
  /** HH:mm */
  start: string
  /** HH:mm */
  end: string
  minutes: number
}

export interface SummaryRow {
  profile: Profile
  /** date key -> các lượt của người đó trong ngày, theo thứ tự giờ. */
  byDate: Map<string, RecordedEntry[]>
  count: number
  minutes: number
}

export interface SummaryTotals {
  /** Số nhân viên có ít nhất một lượt được ghi nhận. */
  staff: number
  count: number
  minutes: number
  /**
   * Số lượt nằm trong khoảng nhưng chưa vào tổng kết — chưa xác nhận, hoặc
   * đã xác nhận mà chưa tới giờ kết thúc. Hiện ra để người xem không tưởng
   * là dữ liệu bị mất.
   */
  notCounted: number
}

/**
 * Gom các lượt đã trực xong thành bảng nhân viên × ngày.
 *
 * `shifts` phải được lọc sẵn theo khoảng đang xem. Người đang đăng nhập được
 * đẩy lên đầu, còn lại xếp theo tên — giống lưới tuần bên trang Lịch.
 */
export function buildSummary({
  shifts,
  profiles,
  now,
  currentUserId,
  includeEmptyStaff,
}: {
  shifts: ShiftWithAssignments[]
  profiles: Profile[]
  now: Date
  currentUserId: UUID | null
  includeEmptyStaff: boolean
}): { rows: SummaryRow[]; totals: SummaryTotals; minutesByDate: Map<string, number> } {
  const byUser = new Map<UUID, Map<string, RecordedEntry[]>>()
  const minutesByDate = new Map<string, number>()
  let count = 0
  let minutes = 0
  let notCounted = 0

  for (const shift of shifts) {
    for (const a of shift.assignments) {
      if (!isRecorded(shift.date, a, now)) {
        notCounted += 1
        continue
      }
      const start = normalizeTime(a.start_time)
      const end = normalizeTime(a.end_time)
      const span = Math.max(0, toMinutes(end) - toMinutes(start))
      const days = byUser.get(a.user_id) ?? new Map<string, RecordedEntry[]>()
      const entries = days.get(shift.date) ?? []
      entries.push({
        assignmentId: a.id,
        shiftId: shift.id,
        title: shift.title,
        date: shift.date,
        start,
        end,
        minutes: span,
      })
      days.set(shift.date, entries)
      byUser.set(a.user_id, days)
      minutesByDate.set(shift.date, (minutesByDate.get(shift.date) ?? 0) + span)
      count += 1
      minutes += span
    }
  }

  for (const days of byUser.values()) {
    for (const entries of days.values()) {
      entries.sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    }
  }

  const ordered = [...profiles].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    return a.display_name.localeCompare(b.display_name)
  })

  const rows = ordered
    .map((profile) => {
      const days = byUser.get(profile.id) ?? new Map<string, RecordedEntry[]>()
      const all = [...days.values()].flat()
      return {
        profile,
        byDate: days,
        count: all.length,
        minutes: all.reduce((sum, e) => sum + e.minutes, 0),
      }
    })
    // Nhân viên không có ca bị ẩn theo mặc định: bảng tổng kết mà đầy dòng
    // rỗng thì không đọc được gì.
    .filter((row) => includeEmptyStaff || row.count > 0)

  return {
    rows,
    totals: { staff: byUser.size, count, minutes, notCounted },
    minutesByDate,
  }
}
