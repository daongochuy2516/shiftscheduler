import type {
  ActionLog,
  ActionLogPage,
  ActionLogQuery,
  AssignmentInput,
  Profile,
  Shift,
  ShiftAssignment,
  ShiftDateBounds,
  ShiftInput,
  ShiftQuery,
  ShiftTemplate,
  ShiftWithAssignments,
  TemplateInput,
  UUID,
} from '../types'
import { currentMockProfile } from '../auth/mockAuth'
import type { SchedulerBackend } from './backend'
import {
  MOCK_ASSIGNMENTS,
  MOCK_PROFILES,
  MOCK_SHIFTS,
  MOCK_TEMPLATES,
} from './mockData'

const STORAGE_KEY = 'scheduler.mock.v3'
const LATENCY_MS = 120

interface Snapshot {
  shifts: Shift[]
  assignments: ShiftAssignment[]
  templates: ShiftTemplate[]
  logs: ActionLog[]
}

function seed(): Snapshot {
  return {
    shifts: MOCK_SHIFTS,
    assignments: MOCK_ASSIGNMENTS,
    templates: MOCK_TEMPLATES,
    logs: [],
  }
}

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Snapshot
  } catch {
    // Corrupt or unavailable storage — fall through to the seed data.
  }
  return seed()
}

let state: Snapshot = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or disabled — the in-memory copy still works for this session.
  }
  listeners.forEach((fn) => fn())
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))
}

function uid(prefix: string): UUID {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Bản mô phỏng của trigger `record_action_log` trong database, để chế độ dữ
 * liệu mẫu cũng có nhật ký thật thay vì một trang rỗng.
 *
 * Khác biệt cần nhớ: ở đây log do client ghi nên chỉ là mô phỏng. Với Supabase
 * thì log do database sinh, nhân viên không có quyền ghi.
 */
function pushLog(entry: {
  action: string
  entity_type: string
  entity_id: UUID | null
  summary: string
  old_data?: Record<string, unknown> | null
  new_data?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
}) {
  const actor = currentMockProfile()
  state.logs = [
    {
      id: uid('log'),
      created_at: new Date().toISOString(),
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      actor_name: actor?.display_name ?? null,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      summary: entry.summary,
      old_data: entry.old_data ?? null,
      new_data: entry.new_data ?? null,
      metadata: entry.metadata ?? {},
    },
    ...state.logs,
  ]
}

function nameOf(userId: UUID): string {
  return MOCK_PROFILES.find((p) => p.id === userId)?.display_name ?? '?'
}

function shiftLabel(shiftId: UUID): { title: string; date: string } {
  const shift = state.shifts.find((s) => s.id === shiftId)
  return { title: shift?.title ?? '?', date: shift?.date ?? '?' }
}

function withAssignments(shift: Shift): ShiftWithAssignments {
  return {
    ...shift,
    assignments: state.assignments.filter((a) => a.shift_id === shift.id),
  }
}

/**
 * Applies the roster for a shift: updates existing rows, inserts new ones and
 * drops any that are no longer listed. Mirrors what the Supabase backend does.
 */
function reconcileAssignments(shiftId: UUID, inputs: AssignmentInput[]) {
  const now = new Date().toISOString()
  const keptIds = new Set(inputs.map((a) => a.id).filter(Boolean) as UUID[])
  const label = shiftLabel(shiftId)

  const removed = state.assignments.filter(
    (a) => a.shift_id === shiftId && !keptIds.has(a.id),
  )
  state.assignments = state.assignments.filter(
    (a) => a.shift_id !== shiftId || keptIds.has(a.id),
  )
  for (const gone of removed) {
    pushLog({
      action: 'assignment.deleted',
      entity_type: 'assignment',
      entity_id: gone.id,
      summary: `Gỡ ${nameOf(gone.user_id)} khỏi ca ${label.title} ngày ${label.date}`,
      old_data: { ...gone },
      metadata: { shift_id: shiftId, ...label, target_name: nameOf(gone.user_id) },
    })
  }

  for (const input of inputs) {
    if (input.id) {
      const before = state.assignments.find((a) => a.id === input.id)
      const after = before ? { ...before, ...input, id: before.id, updated_at: now } : null
      state.assignments = state.assignments.map((a) =>
        a.id === input.id ? { ...a, ...input, id: a.id, updated_at: now } : a,
      )
      if (!before || !after) continue

      const onlyStatus =
        before.status !== input.status &&
        before.start_time === input.start_time &&
        before.end_time === input.end_time &&
        before.user_id === input.user_id &&
        (before.note ?? null) === (input.note ?? null)
      const unchanged =
        before.status === input.status &&
        before.start_time === input.start_time &&
        before.end_time === input.end_time &&
        before.user_id === input.user_id &&
        (before.note ?? null) === (input.note ?? null)
      if (unchanged) continue

      pushLog({
        action: onlyStatus ? 'assignment.status_changed' : 'assignment.updated',
        entity_type: 'assignment',
        entity_id: before.id,
        summary: onlyStatus
          ? `Đổi trạng thái của ${nameOf(input.user_id)} trong ca ${label.title} ngày ${label.date}: ${before.status} -> ${input.status}`
          : `Sửa phân công của ${nameOf(input.user_id)} trong ca ${label.title} ngày ${label.date}`,
        old_data: { ...before },
        new_data: { ...after },
        metadata: { shift_id: shiftId, ...label, target_name: nameOf(input.user_id) },
      })
    } else {
      const created: ShiftAssignment = {
        id: uid('a'),
        shift_id: shiftId,
        user_id: input.user_id,
        start_time: input.start_time,
        end_time: input.end_time,
        status: input.status,
        note: input.note,
        created_at: now,
        updated_at: now,
      }
      state.assignments.push(created)
      pushLog({
        action: 'assignment.created',
        entity_type: 'assignment',
        entity_id: created.id,
        summary: `Thêm ${nameOf(input.user_id)} vào ca ${label.title} ngày ${label.date} (${input.start_time}-${input.end_time})`,
        new_data: { ...created },
        metadata: { shift_id: shiftId, ...label, target_name: nameOf(input.user_id) },
      })
    }
  }
}

/**
 * Cùng cách hiểu "liên quan" như bản Supabase. Log phân công của mock không
 * ghi `target_user_id`, nên đọc thêm user_id trong dữ liệu cũ/mới.
 */
function involves(row: ActionLog, id: UUID): boolean {
  if (row.actor_id === id) return true
  const meta = row.metadata as {
    target_user_id?: UUID
    staff_removed?: { user_id?: UUID }[]
  }
  if (meta.target_user_id === id) return true
  if (row.new_data?.user_id === id || row.old_data?.user_id === id) return true
  return (meta.staff_removed ?? []).some((r) => r.user_id === id)
}

export const mockBackend: SchedulerBackend = {
  listProfiles(): Promise<Profile[]> {
    return delay(
      [...MOCK_PROFILES].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    )
  },

  listShifts(query: ShiftQuery): Promise<ShiftWithAssignments[]> {
    const rows = state.shifts.map(withAssignments).filter((s) => {
      if (query.kind === 'user') {
        return s.assignments.some((a) => a.user_id === query.userId)
      }
      if (query.kind === 'pending') {
        return s.assignments.some((a) => a.status === 'pending')
      }
      if (query.from && s.date < query.from) return false
      if (query.to && s.date > query.to) return false
      return (query.userIds ?? []).every((id) =>
        s.assignments.some((a) => a.user_id === id),
      )
    })
    return delay(rows)
  },

  shiftDateBounds(userIds: UUID[]): Promise<ShiftDateBounds> {
    const dates = state.shifts
      .map(withAssignments)
      .filter((s) =>
        userIds.every((id) => s.assignments.some((a) => a.user_id === id)),
      )
      .map((s) => s.date)
      .sort()
    return delay({
      earliest: dates[0] ?? null,
      latest: dates[dates.length - 1] ?? null,
    })
  },

  async createShift(input: ShiftInput, assignments: AssignmentInput[]) {
    const now = new Date().toISOString()
    const shift: Shift = {
      id: uid('s'),
      ...input,
      template_id: input.template_id ?? null,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    state.shifts = [...state.shifts, shift]
    pushLog({
      action: 'shift.created',
      entity_type: 'shift',
      entity_id: shift.id,
      summary: `Tạo ca ${shift.title} (${shift.date} ${shift.start_time}-${shift.end_time})`,
      new_data: { ...shift },
      metadata: { shift_title: shift.title, shift_date: shift.date },
    })
    reconcileAssignments(shift.id, assignments)
    persist()
    return delay(withAssignments(shift))
  },

  async updateShift(id: UUID, input: ShiftInput, assignments: AssignmentInput[]) {
    const now = new Date().toISOString()
    const before = state.shifts.find((s) => s.id === id)
    state.shifts = state.shifts.map((s) =>
      s.id === id ? { ...s, ...input, updated_at: now } : s,
    )
    const after = state.shifts.find((s) => s.id === id)

    // Bỏ qua updated_at giống hệt trigger, để "lưu mà không đổi gì" không sinh
    // ra một dòng log vô nghĩa.
    const changed =
      before &&
      after &&
      (before.title !== after.title ||
        before.date !== after.date ||
        before.start_time !== after.start_time ||
        before.end_time !== after.end_time ||
        (before.note ?? null) !== (after.note ?? null))
    if (changed && after) {
      pushLog({
        action: 'shift.updated',
        entity_type: 'shift',
        entity_id: id,
        summary: `Sửa ca ${after.title} (${after.date} ${after.start_time}-${after.end_time})`,
        old_data: { ...before },
        new_data: { ...after },
        metadata: { shift_title: after.title, shift_date: after.date },
      })
    }

    reconcileAssignments(id, assignments)
    persist()
    const saved = state.shifts.find((s) => s.id === id)
    if (!saved) throw new Error('Shift not found')
    return delay(withAssignments(saved))
  },

  async deleteShift(id: UUID) {
    const shift = state.shifts.find((s) => s.id === id)
    const doomed = state.assignments.filter((a) => a.shift_id === id)

    state.shifts = state.shifts.filter((s) => s.id !== id)
    // Mirrors `on delete cascade` in the real schema.
    state.assignments = state.assignments.filter((a) => a.shift_id !== id)

    if (shift) {
      // Một dòng duy nhất. Việc gỡ từng người ở đây là hệ quả của cascade,
      // không phải thao tác riêng của người dùng, nên liệt kê luôn vào đây
      // thay vì sinh thêm mỗi người một dòng.
      const roster = [...doomed]
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((a) => ({
          assignment_id: a.id,
          user_id: a.user_id,
          name: nameOf(a.user_id),
          start_time: a.start_time,
          end_time: a.end_time,
          status: a.status,
          note: a.note,
        }))

      pushLog({
        action: 'shift.deleted',
        entity_type: 'shift',
        entity_id: id,
        summary:
          `Xoá ca ${shift.title} (${shift.date} ${shift.start_time}-${shift.end_time})` +
          (roster.length > 0
            ? ` — gỡ ${roster.length} nhân viên: ${roster.map((r) => r.name).join(', ')}`
            : ' — ca đang trống'),
        old_data: { ...shift },
        metadata: {
          shift_title: shift.title,
          shift_date: shift.date,
          staff_count: roster.length,
          staff_removed: roster,
        },
      })
    }

    persist()
    await delay(null)
  },

  async setAssignmentStatus(assignmentId: UUID, status) {
    const now = new Date().toISOString()
    const before = state.assignments.find((a) => a.id === assignmentId)
    state.assignments = state.assignments.map((a) =>
      a.id === assignmentId ? { ...a, status, updated_at: now } : a,
    )
    if (before && before.status !== status) {
      const label = shiftLabel(before.shift_id)
      pushLog({
        action: 'assignment.status_changed',
        entity_type: 'assignment',
        entity_id: assignmentId,
        summary: `Đổi trạng thái của ${nameOf(before.user_id)} trong ca ${label.title} ngày ${label.date}: ${before.status} -> ${status}`,
        old_data: { ...before },
        new_data: { ...before, status, updated_at: now },
        metadata: {
          shift_id: before.shift_id,
          ...label,
          target_name: nameOf(before.user_id),
          old_status: before.status,
          new_status: status,
        },
      })
    }
    persist()
    await delay(null)
  },

  // ---- templates ----

  listTemplates(): Promise<ShiftTemplate[]> {
    return delay(
      [...state.templates].sort((a, b) => a.title.localeCompare(b.title)),
    )
  },

  async createTemplate(input: TemplateInput) {
    const now = new Date().toISOString()
    const created: ShiftTemplate = {
      id: uid('t'),
      ...input,
      created_by: null,
      created_at: now,
      updated_at: now,
    }
    state.templates = [...state.templates, created]
    pushLog({
      action: 'template.created',
      entity_type: 'template',
      entity_id: created.id,
      summary: `Tạo ca mẫu ${created.title} (${created.start_time}-${created.end_time})`,
      new_data: { ...created },
      metadata: { template_title: created.title },
    })
    persist()
    await delay(null)
  },

  async updateTemplate(id: UUID, input: TemplateInput) {
    const now = new Date().toISOString()
    const before = state.templates.find((t) => t.id === id)
    state.templates = state.templates.map((t) =>
      t.id === id ? { ...t, ...input, updated_at: now } : t,
    )
    const after = state.templates.find((t) => t.id === id)

    if (before && after) {
      // Chỉ bật/tắt thì ghi thành hành động riêng, giống trigger.
      const onlyToggled =
        before.is_active !== after.is_active &&
        before.title === after.title &&
        before.start_time === after.start_time &&
        before.end_time === after.end_time &&
        before.weekdays.join() === after.weekdays.join() &&
        (before.note ?? null) === (after.note ?? null)
      pushLog({
        action: onlyToggled ? 'template.toggled' : 'template.updated',
        entity_type: 'template',
        entity_id: id,
        summary: onlyToggled
          ? `${after.is_active ? 'Bật' : 'Tắt'} ca mẫu ${after.title}`
          : `Sửa ca mẫu ${after.title}`,
        old_data: { ...before },
        new_data: { ...after },
        metadata: { template_title: after.title },
      })
    }
    persist()
    await delay(null)
  },

  async deleteTemplate(id: UUID) {
    const before = state.templates.find((t) => t.id === id)
    state.templates = state.templates.filter((t) => t.id !== id)
    if (before) {
      pushLog({
        action: 'template.deleted',
        entity_type: 'template',
        entity_id: id,
        summary: `Xoá ca mẫu ${before.title}`,
        old_data: { ...before },
        metadata: { template_title: before.title },
      })
    }
    // Shifts already created from it keep working; they just lose the link.
    state.shifts = state.shifts.map((s) =>
      s.template_id === id ? { ...s, template_id: null } : s,
    )
    persist()
    await delay(null)
  },

  async claimTemplate(templateId: UUID, date: string, userId: UUID) {
    const template = state.templates.find((t) => t.id === templateId)
    if (!template) throw new Error('Template not found')

    const now = new Date().toISOString()
    let shift = state.shifts.find(
      (s) => s.template_id === templateId && s.date === date,
    )

    // Ca có được tạo mới bởi chính cú bấm Nhận ca này không. Cố ý KHÔNG ghi
    // log riêng cho việc tạo ca: một cú bấm phải là một dòng nhật ký, và dòng
    // "Nhận ca" bên dưới mang đủ dữ liệu về ca vừa tạo.
    const shiftCreated = !shift
    if (!shift) {
      shift = {
        id: uid('s'),
        title: template.title,
        date,
        start_time: template.start_time,
        end_time: template.end_time,
        note: template.note,
        template_id: template.id,
        created_by: userId,
        created_at: now,
        updated_at: now,
      }
      state.shifts = [...state.shifts, shift]
    }

    const alreadyOn = state.assignments.some(
      (a) => a.shift_id === shift.id && a.user_id === userId,
    )
    if (!alreadyOn) {
      const created: ShiftAssignment = {
        id: uid('a'),
        shift_id: shift.id,
        user_id: userId,
        start_time: template.start_time,
        end_time: template.end_time,
        status: 'pending',
        note: null,
        created_at: now,
        updated_at: now,
      }
      state.assignments.push(created)
      pushLog({
        action: 'assignment.claimed',
        entity_type: 'assignment',
        entity_id: created.id,
        summary: `Nhận ca ${shift.title} ngày ${date} (${template.start_time}-${template.end_time})`,
        new_data: { ...created },
        metadata: {
          shift_id: shift.id,
          shift_title: shift.title,
          shift_date: date,
          target_name: nameOf(userId),
          self: true,
          template_id: templateId,
          shift_created: shiftCreated,
          shift_snapshot: { ...shift },
        },
      })
    }

    persist()
    await delay(null)
  },

  // ---- action log ----

  listActionLogs(query: ActionLogQuery): Promise<ActionLogPage> {
    const search = query.search?.trim().toLowerCase() ?? ''
    // Cùng cách hiểu mốc ngày như bản Supabase: từ 00:00 tới hết 23:59.
    const fromMs = query.from ? new Date(`${query.from}T00:00:00`).getTime() : null
    const toMs = query.to ? new Date(`${query.to}T23:59:59.999`).getTime() : null

    const matched = state.logs.filter((row) => {
      const at = new Date(row.created_at).getTime()
      if (fromMs !== null && at < fromMs) return false
      if (toMs !== null && at > toMs) return false
      if (!query.staffIds.every((id) => involves(row, id))) return false
      if (query.action && row.action !== query.action) return false
      if (query.entityType && row.entity_type !== query.entityType) return false
      if (search && !(row.summary ?? '').toLowerCase().includes(search)) {
        return false
      }
      return true
    })

    const start = query.page * query.pageSize
    return delay({
      rows: matched.slice(start, start + query.pageSize),
      total: matched.length,
    })
  },

  subscribe(onChange: () => void) {
    listeners.add(onChange)
    return () => listeners.delete(onChange)
  },
}

/** Wipes local edits and restores the seeded demo data. */
export function resetMockData() {
  localStorage.removeItem(STORAGE_KEY)
  state = seed()
  persist()
}
