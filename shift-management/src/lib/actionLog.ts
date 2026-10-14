import type { ActionLog } from '../types'

/**
 * Hai hành động "ảo" của nhật ký. Database chỉ ghi `assignment.status_changed`
 * cho mọi lần đổi trạng thái, nhưng đổi trạng thái thực chất chỉ có hai chiều
 * nên giao diện gọi thẳng tên việc — và lọc được riêng từng chiều.
 *
 * Giá trị là trạng thái mới (`new_data.status`) của dòng thuộc chiều đó.
 */
export const CHECK_IN_ACTIONS = {
  'assignment.confirmed': 'confirmed',
  'assignment.unconfirmed': 'pending',
} as const

export type CheckInAction = keyof typeof CHECK_IN_ACTIONS

export function isCheckInAction(action: string): action is CheckInAction {
  return action in CHECK_IN_ACTIONS
}

/** Hành động để hiển thị và để lọc: tách đổi trạng thái thành hai chiều. */
export function effectiveAction(row: ActionLog): string {
  if (row.action !== 'assignment.status_changed') return row.action
  const from = row.old_data?.status
  const to = row.new_data?.status
  if (from !== 'confirmed' && to === 'confirmed') return 'assignment.confirmed'
  if (from === 'confirmed' && to !== 'confirmed') return 'assignment.unconfirmed'
  return row.action
}

/**
 * Dòng có khớp bộ lọc hành động không. Lọc "Đổi trạng thái" vẫn ra cả hai
 * chiều như trước; lọc "Điểm danh" / "Gỡ điểm danh" chỉ ra đúng chiều đó.
 */
export function matchesAction(row: ActionLog, action: string): boolean {
  if (isCheckInAction(action)) return effectiveAction(row) === action
  return row.action === action
}
