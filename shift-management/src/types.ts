/**
 * Domain types. These mirror the Supabase table columns 1:1 so that the
 * mock backend and the real backend are interchangeable.
 *
 * Times are kept as "HH:mm" strings (Postgres `time` values are read/written
 * as "HH:mm:ss"; see lib/time.ts for the normalisation helpers).
 * Dates are kept as "yyyy-MM-dd" strings (Postgres `date`).
 */

export type UUID = string

export interface Profile {
  id: UUID
  email: string
  display_name: string
  created_at: string
}

export interface Shift {
  id: UUID
  title: string
  /** yyyy-MM-dd */
  date: string
  /** HH:mm */
  start_time: string
  /** HH:mm */
  end_time: string
  note: string | null
  created_by: UUID | null
  /** Set when this shift was materialised from a template. */
  template_id: UUID | null
  created_at: string
  updated_at: string
}

/**
 * A recurring shift definition. Staff claim one for a given day, which
 * materialises a real `shift` (once per template per day) and adds an
 * assignment for the claimer.
 */
export interface ShiftTemplate {
  id: UUID
  title: string
  /** HH:mm */
  start_time: string
  /** HH:mm */
  end_time: string
  note: string | null
  /** 0 = Sunday … 6 = Saturday. Empty means it repeats every day. */
  weekdays: number[]
  is_active: boolean
  created_by: UUID | null
  created_at: string
  updated_at: string
}

/**
 * Một dòng nhật ký thao tác. Bảng chỉ cho đọc: log do trigger trong database
 * sinh ra, không có đường nào để client tạo/sửa/xoá.
 */
export interface ActionLog {
  id: UUID
  /** ISO timestamp */
  created_at: string
  actor_id: UUID | null
  /** Ảnh chụp tại thời điểm ghi log — còn đọc được sau khi tài khoản bị xoá. */
  actor_email: string | null
  actor_name: string | null
  /** 'shift.created', 'assignment.claimed', 'template.toggled', … */
  action: string
  entity_type: string
  entity_id: UUID | null
  summary: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export interface ActionLogFilters {
  /** yyyy-MM-dd, tính từ 00:00 ngày đó theo giờ máy người dùng. */
  from: string | null
  /** yyyy-MM-dd, tính tới hết 23:59 ngày đó. */
  to: string | null
  actorId: UUID | null
  action: string | null
  entityType: string | null
  /** Khớp trong summary. */
  search: string | null
}

export interface ActionLogQuery extends ActionLogFilters {
  page: number
  pageSize: number
}

export interface ActionLogPage {
  rows: ActionLog[]
  /** Tổng số dòng khớp bộ lọc, dùng để phân trang. */
  total: number
}

export interface TemplateInput {
  title: string
  start_time: string
  end_time: string
  note: string | null
  weekdays: number[]
  is_active: boolean
}

export type AssignmentStatus = 'pending' | 'confirmed'

export interface ShiftAssignment {
  id: UUID
  shift_id: UUID
  user_id: UUID
  /** HH:mm */
  start_time: string
  /** HH:mm */
  end_time: string
  status: AssignmentStatus
  note: string | null
  created_at: string
  updated_at: string
}

/**
 * Một lát cắt ca cần tải. Không bao giờ có "tải tất cả": mỗi màn hình xin
 * đúng phần nó hiển thị.
 *
 * - `range`: theo ngày (`from`/`to` là yyyy-MM-dd, bỏ trống một đầu = mở),
 *   có thể lọc thêm những ca có một nhân viên (`userId`).
 * - `user`: mọi ca có người này.
 * - `pending`: mọi ca còn ít nhất một lượt chờ xác nhận.
 */
export type ShiftQuery =
  | {
      kind: 'range'
      from: string | null
      to: string | null
      userId?: UUID | null
    }
  | { kind: 'user'; userId: UUID }
  | { kind: 'pending' }

/** A shift together with its assignments — the shape the UI works with. */
export interface ShiftWithAssignments extends Shift {
  assignments: ShiftAssignment[]
}

/**
 * Ngày ca sớm nhất và muộn nhất — điểm dừng của cuộn vô hạn. Cả hai `null`
 * khi không có ca nào.
 */
export interface ShiftDateBounds {
  earliest: string | null
  latest: string | null
}

/**
 * Payload for creating/updating a shift and its roster in one go.
 *
 * `template_id` is deliberately optional and omitted by the edit form: leaving
 * the key out means an update never clears a shift's link to its template.
 */
export interface ShiftInput {
  title: string
  date: string
  start_time: string
  end_time: string
  note: string | null
  template_id?: UUID | null
}

export interface AssignmentInput {
  /** Present when editing an existing assignment, absent when adding a new one. */
  id?: UUID
  user_id: UUID
  start_time: string
  end_time: string
  status: AssignmentStatus
  note: string | null
}
