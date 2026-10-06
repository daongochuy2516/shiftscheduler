import type { Profile } from '../types'

/**
 * Người này có hiện trong các bảng xếp ca và ô chọn nhân viên không.
 * `displayed` là `null` khi migration 007 chưa chạy — coi như hiện.
 */
export function isListed(profile: Pick<Profile, 'displayed'>): boolean {
  return profile.displayed !== false
}

/**
 * Lọc một hàng của bảng (Lịch ngày/tuần, Tổng kết): người đang ẩn vẫn hiện
 * nếu có dữ liệu trong khoảng đang xem — ẩn người không được làm mất ca.
 */
export function showRow(
  profile: Pick<Profile, 'displayed'>,
  hasItems: boolean,
): boolean {
  return isListed(profile) || hasItems
}
