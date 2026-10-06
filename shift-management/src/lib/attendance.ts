import { addMinutes } from 'date-fns'
import type {
  Profile,
  ShiftAssignment,
  ShiftWithAssignments,
  UUID,
} from '../types'
import { fromDateKey, toMinutes } from './time'

/**
 * Luật chấm công, bản phía client.
 *
 * Nơi quyết định thật là các trigger trong `supabase/005_attendance.sql` và
 * `006_shift_rules.sql` (đồng hồ máy chủ, múi giờ Asia/Ho_Chi_Minh). File này chỉ để giao diện ẩn
 * đúng những nút mà database sẽ từ chối, và để bản mock hành xử giống bản
 * thật. Đổi con số ở đây phải đổi cả trong file SQL.
 */
export const CHECK_IN_LEAD_MIN = 30
/** Tự rời ca được trong ngần này phút kể từ lúc nhận ca. */
export const LEAVE_GRACE_MIN = 30

/**
 * Luật chỉ áp cho `staff`. Admin được miễn; `role` là `null` nghĩa là
 * migration 005 chưa chạy, database không chặn gì nên giao diện cũng không.
 */
export function isRestricted(user: Pick<Profile, 'role'> | null): boolean {
  return user?.role === 'staff'
}

function at(date: string, time: string): Date {
  return addMinutes(fromDateKey(date), toMinutes(time))
}

/** Thời điểm bắt đầu điểm danh được: 30 phút trước giờ vào của riêng người đó. */
export function checkInOpensAt(date: string, startTime: string): Date {
  return addMinutes(at(date, startTime), -CHECK_IN_LEAD_MIN)
}

export type CheckInWindow = 'early' | 'open' | 'closed'

/** Cửa sổ điểm danh của một lượt: từ `checkInOpensAt` đến hết giờ của người đó. */
export function checkInWindow(
  date: string,
  startTime: string,
  endTime: string,
  now: Date,
): CheckInWindow {
  // ponytail: so bằng giờ máy người dùng, đủ cho việc bật/tắt nút. Máy lệch
  // giờ thì database vẫn từ chối và lỗi hiện nguyên văn.
  if (now < checkInOpensAt(date, startTime)) return 'early'
  if (now > at(date, endTime)) return 'closed'
  return 'open'
}

/**
 * Ca có người khác ngoài mình: nhân viên không sửa được tên / ngày / giờ ca
 * (ghi chú thì được), không xoá được ca, chỉ còn đụng tới phần của mình
 * (006, luật E).
 */
export function hasOthers(
  shift: Pick<ShiftWithAssignments, 'assignments'>,
  userId: UUID | null,
): boolean {
  return shift.assignments.some((a) => a.user_id !== userId)
}

export type DeleteBlock = 'others' | 'confirmed' | 'late'

/**
 * Vì sao nhân viên không xoá được ca này, hoặc `null` nếu xoá được. Ca trống
 * thì xoá lúc nào cũng được; ca chỉ có mình thì xoá được khi mình còn rời
 * được — không thì xoá ca thành đường lách luật rời ca.
 */
export function deleteBlock(
  shift: Pick<ShiftWithAssignments, 'assignments'>,
  userId: UUID | null,
  now: Date,
): DeleteBlock | null {
  if (hasOthers(shift, userId)) return 'others'
  if (shift.assignments.some((a) => a.status === 'confirmed')) return 'confirmed'
  if (shift.assignments.some((a) => leaveDeadline(a) < now)) return 'late'
  return null
}

/** Hạn chót tự rời ca: 30 phút sau lúc nhận ca. */
export function leaveDeadline(assignment: Pick<ShiftAssignment, 'created_at'>): Date {
  return addMinutes(new Date(assignment.created_at), LEAVE_GRACE_MIN)
}

export type RemoveBlock = 'confirmed' | 'other' | 'late'

/**
 * Vì sao nhân viên không gỡ được lượt này khỏi ca (hay đổi người trên nó),
 * hoặc `null` nếu được. Chỉ dành cho lượt đã lưu — dòng vừa thêm trong form
 * chưa có trên máy chủ, gỡ thoải mái.
 */
export function removeBlock(
  assignment: Pick<ShiftAssignment, 'user_id' | 'status' | 'created_at'>,
  userId: UUID | null,
  now: Date,
): RemoveBlock | null {
  if (assignment.status === 'confirmed') return 'confirmed'
  if (assignment.user_id !== userId) return 'other'
  if (leaveDeadline(assignment) < now) return 'late'
  return null
}
