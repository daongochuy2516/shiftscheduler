import type { ActionLog, UUID } from '../types'

/**
 * Ca mà một dòng nhật ký nói tới, để mở form của ca đó. `assignmentId` là
 * lượt cần tô sáng trong form (dòng nói về một người).
 *
 * `null` khi dòng không gắn với ca nào (ca mẫu), hoặc chính dòng đó là xoá
 * ca. Ca bị xoá ở một lần sau thì ở đây không biết được — phải hỏi máy chủ.
 */
export function shiftTarget(
  row: ActionLog,
): { shiftId: UUID; assignmentId: UUID | null } | null {
  if (row.entity_type === 'shift') {
    if (row.action === 'shift.deleted' || !row.entity_id) return null
    return { shiftId: row.entity_id, assignmentId: null }
  }
  if (row.entity_type === 'assignment') {
    // Trigger ghi `shift_id` vào ngữ cảnh; ảnh chụp lượt phân công cũng có,
    // dùng làm dự phòng cho dòng cũ thiếu ngữ cảnh.
    const shiftId = [
      row.metadata.shift_id,
      row.new_data?.shift_id,
      row.old_data?.shift_id,
    ].find((v): v is string => typeof v === 'string' && v !== '')
    if (!shiftId) return null
    return {
      shiftId,
      // Người đã bị gỡ khỏi ca thì không còn dòng nào để tô.
      assignmentId: row.action === 'assignment.deleted' ? null : row.entity_id,
    }
  }
  return null
}

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
