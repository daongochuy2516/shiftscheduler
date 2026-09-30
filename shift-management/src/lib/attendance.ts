import { addMinutes } from 'date-fns'
import type { Profile, ShiftWithAssignments } from '../types'
import { fromDateKey, toMinutes } from './time'

/**
 * Luật chấm công, bản phía client.
 *
 * Nơi quyết định thật là các trigger trong `supabase/005_attendance.sql`
 * (đồng hồ máy chủ, múi giờ Asia/Ho_Chi_Minh). File này chỉ để giao diện ẩn
 * đúng những nút mà database sẽ từ chối, và để bản mock hành xử giống bản
 * thật. Đổi con số ở đây phải đổi cả trong file SQL.
 */
export const CHECK_IN_LEAD_MIN = 30
export const DELETE_GRACE_MIN = 30

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

/** Vì sao nhân viên không xoá được ca này, hoặc `null` nếu xoá được. */
export function deleteBlock(
  shift: Pick<ShiftWithAssignments, 'created_at' | 'assignments'>,
  now: Date,
): 'confirmed' | 'old' | null {
  if (shift.assignments.some((a) => a.status === 'confirmed')) return 'confirmed'
  const created = new Date(shift.created_at)
  if (addMinutes(created, DELETE_GRACE_MIN) < now) return 'old'
  return null
}
