import type {
  Account,
  ActionLog,
  ActionLogPage,
  ActionLogQuery,
  AssignmentInput,
  Location,
  LocationInput,
  Profile,
  ProfileInput,
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
import {
  canManageTemplates,
  checkInWindow,
  CLAIM_NEEDS_LOCATION_MESSAGE,
  deleteBlock,
  hasOthers,
  hoursLocked,
  isRestricted,
  KEEP_LOCATION_MESSAGE,
  locationsLocked,
  mustKeepLocation,
  removeBlock,
  type RemoveBlock,
} from '../lib/attendance'
import {
  compareLocations,
  normalizeLocationIds,
  sameLocationIds,
} from '../lib/locations'
import { ForbiddenError, type SchedulerBackend } from './backend'
import {
  MOCK_ASSIGNMENTS,
  MOCK_LOCATIONS,
  MOCK_PROFILES,
  MOCK_SHIFTS,
  MOCK_TEMPLATES,
} from './mockData'

// v4: thêm nơi trực (012) và gộp ca mẫu thành Sáng / Chiều / Tối.
const STORAGE_KEY = 'scheduler.mock.v4'
const LATENCY_MS = 120

interface Snapshot {
  shifts: Shift[]
  assignments: ShiftAssignment[]
  templates: ShiftTemplate[]
  locations: Location[]
  logs: ActionLog[]
  /**
   * Tài khoản mẫu là hằng số (MOCK_PROFILES, dùng chung với đăng nhập mock);
   * phần admin đã sửa ở trang Tài khoản nằm ở đây, ghép lên khi đọc. Tuỳ
   * chọn để dữ liệu đã lưu từ bản cũ vẫn đọc được.
   */
  profileEdits?: Record<UUID, ProfileInput>
}

function seed(): Snapshot {
  return {
    shifts: MOCK_SHIFTS,
    assignments: MOCK_ASSIGNMENTS,
    templates: MOCK_TEMPLATES,
    locations: MOCK_LOCATIONS,
    logs: [],
  }
}

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Snapshot
      // Lượt luôn có mảng nơi trực, như bản Supabase chuẩn hoá khi đọc.
      return {
        ...saved,
        locations: saved.locations ?? [],
        assignments: saved.assignments.map((a) => ({
          ...a,
          location_ids: a.location_ids ?? [],
        })),
      }
    }
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

/** Tài khoản mẫu kèm phần admin đã sửa ở trang Tài khoản. */
function mockAccounts(): Account[] {
  return MOCK_PROFILES.map((p) => ({ ...p, ...state.profileEdits?.[p.id] })).sort(
    (a, b) => a.display_name.localeCompare(b.display_name),
  )
}

function nameOf(userId: UUID): string {
  return MOCK_PROFILES.find((p) => p.id === userId)?.display_name ?? '?'
}

function shiftLabel(shiftId: UUID): { title: string; date: string } {
  const shift = state.shifts.find((s) => s.id === shiftId)
  return { title: shift?.title ?? '?', date: shift?.date ?? '?' }
}

/**
 * Tên các nơi trực của một lượt theo thứ tự hiển thị, bỏ id lạ (nơi đã xoá)
 * — `location_names` trong nhật ký của trigger 012.
 */
function locationNames(ids: readonly UUID[]): string[] {
  return state.locations
    .filter((l) => ids.includes(l.id))
    .sort(compareLocations)
    .map((l) => l.name)
}

/** Đuôi " — Fanpage, Discord" của summary nhận ca / thêm vào ca (012). */
function locationSuffix(names: string[]): string {
  return names.length > 0 ? ` — ${names.join(', ')}` : ''
}

/**
 * Ngữ cảnh chung của mọi dòng nhật ký về phân công — cùng các khoá với
 * `v_meta` của trigger (003_action_logs.sql), để trang Nhật ký đọc như nhau.
 */
function assignmentMeta(
  shiftId: UUID,
  userId: UUID,
  locationIds: readonly UUID[],
): Record<string, unknown> {
  const label = shiftLabel(shiftId)
  return {
    shift_id: shiftId,
    shift_title: label.title,
    shift_date: label.date,
    target_user_id: userId,
    target_name: nameOf(userId),
    self: userId === me(),
    // 012: nơi trực hiện tại của lượt (lúc gỡ thì là của lượt bị gỡ).
    location_names: locationNames(locationIds),
  }
}

function withAssignments(shift: Shift): ShiftWithAssignments {
  return {
    ...shift,
    assignments: state.assignments.filter((a) => a.shift_id === shift.id),
  }
}

// ---- luật chấm công: bản mô phỏng các trigger của 005 + 006 + 010 ----
// Câu báo lỗi giống hệt bản SQL, để hai chế độ từ chối bằng cùng một câu.

function restricted(): boolean {
  return isRestricted(currentMockProfile())
}

function assertCanConfirm(
  a: Pick<AssignmentInput, 'user_id' | 'start_time' | 'end_time'>,
  date: string,
) {
  if (!restricted()) return
  if (a.user_id !== currentMockProfile()?.id) {
    throw new Error('Bạn không có quyền điểm danh cho người khác.')
  }
  if (checkInWindow(date, a.start_time, a.end_time, new Date()) !== 'open') {
    throw new Error(
      'Bạn không có quyền điểm danh ngoài giờ: chỉ từ 30 phút trước giờ bắt đầu đến giờ kết thúc của bạn.',
    )
  }
}

const REMOVE_ERRORS: Record<RemoveBlock, string> = {
  confirmed: 'Bạn không có quyền gỡ lượt đã điểm danh.',
  other: 'Bạn không có quyền gỡ người khác khỏi ca.',
  late: 'Bạn không có quyền rời ca sau 30 phút kể từ lúc nhận.',
}

const ADD_OTHER_ERROR = 'Bạn không có quyền thêm người khác vào ca.'
const EDIT_OTHER_ERROR = 'Bạn không có quyền sửa lượt của người khác.'

function me(): UUID | null {
  return currentMockProfile()?.id ?? null
}

/** Bản sao trigger của 012: chỉ admin tạo / sửa / xoá nơi trực. */
function assertCanManageLocations() {
  if (!canManageTemplates(currentMockProfile())) {
    throw new Error('Bạn không có quyền sửa nơi trực.')
  }
}

const LOCATION_IN_USE_ERROR = 'Nơi trực đang được dùng — hãy ẩn thay vì xoá.'
const LOCATION_UNUSABLE_ERROR = 'Nơi trực không tồn tại hoặc đã bị ẩn.'
const CONFIRMED_LOCATIONS_ERROR =
  'Bạn không có quyền sửa nơi trực của lượt đã điểm danh.'

/**
 * 012: nhân viên chỉ gắn được nơi trực đang bật. Chỉ xét phần **mới thêm**
 * so với `before` — lượt đang mang một nơi vừa bị ẩn vẫn lưu được.
 */
function assertLocationsUsable(ids: readonly UUID[], before: readonly UUID[] = []) {
  if (!restricted()) return
  for (const id of ids) {
    if (before.includes(id)) continue
    if (!state.locations.some((l) => l.id === id && l.is_active)) {
      throw new Error(LOCATION_UNUSABLE_ERROR)
    }
  }
}

/** `location_ids` mà một lần ghi sẽ để lại trên lượt (không gửi = giữ nguyên). */
function nextLocationIds(
  before: ShiftAssignment | null,
  input: Pick<AssignmentInput, 'location_ids'>,
): UUID[] {
  if (input.location_ids === undefined) return before?.location_ids ?? []
  return normalizeLocationIds(input.location_ids)
}

/**
 * Ràng buộc của bảng `locations` (012), cùng câu lỗi Postgres trả về. Tên đã
 * được trigger cắt khoảng trắng trước khi xét.
 */
/** Như trigger của 014: trim, chuỗi rỗng thành null. */
function cleanShortName(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function assertLocationInput(input: LocationInput, id: UUID | null) {
  const name = input.name.trim()
  if (name.length < 1 || name.length > 50) {
    throw new Error(
      'new row for relation "locations" violates check constraint "locations_name_valid"',
    )
  }
  // Bản sao `locations_short_name_valid` của 014 (sau khi trigger trim).
  if ((cleanShortName(input.short_name)?.length ?? 0) > 10) {
    throw new Error(
      'new row for relation "locations" violates check constraint "locations_short_name_valid"',
    )
  }
  if (input.color !== null && !/^[a-z]{1,20}$/.test(input.color)) {
    throw new Error(
      'new row for relation "locations" violates check constraint "locations_color_format"',
    )
  }
  if (
    state.locations.some(
      (l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    throw new Error(
      'duplicate key value violates unique constraint "locations_name_lower_unique"',
    )
  }
}

/** Bản sao trigger của 008: chỉ admin tạo / sửa / xoá ca mẫu. */
function assertCanManageTemplates() {
  if (!canManageTemplates(currentMockProfile())) {
    throw new Error('Bạn không có quyền sửa ca mẫu.')
  }
}

/** Gỡ một lượt khỏi ca (006, luật A và B). */
function assertCanRemove(a: ShiftAssignment) {
  if (!restricted()) return
  const block = removeBlock(a, me(), new Date())
  if (block) throw new Error(REMOVE_ERRORS[block])
}

/**
 * Kiểm tra cả danh sách **trước** khi sửa gì: một dòng bị từ chối thì không
 * dòng nào được lưu, thay vì để lại ca lưu dở.
 *
 * `templateId` là ca mẫu gốc của ca **sau** lần lưu (bản thật lưu ca trước
 * rồi mới tới từng lượt, nên trigger của lượt thấy giá trị mới) — dùng cho
 * luật "ca mẫu phải có nơi trực" (015). Thứ tự xét giống bản thật: gỡ, sửa,
 * rồi thêm; trong mỗi dòng theo đúng thứ tự trong trigger.
 */
function assertRosterAllowed(
  shiftId: UUID | null,
  date: string,
  templateId: UUID | null,
  inputs: AssignmentInput[],
) {
  if (!restricted()) {
    // Admin / role null: chỉ còn luật R1 của 015 (áp cho mọi người có phiên).
    for (const input of inputs) {
      if (!input.id) assertClaimHasLocation(templateId, input)
    }
    return
  }
  const byId = new Map(inputs.filter((i) => i.id).map((i) => [i.id, i]))
  for (const before of state.assignments) {
    if (before.shift_id !== shiftId) continue
    const input = byId.get(before.id)
    if (!input) {
      assertCanRemove(before)
      continue
    }
    const locationsChanged = !sameLocationIds(
      nextLocationIds(before, input),
      before.location_ids,
    )
    // Cùng thứ tự với trigger (006, bản mới nhất 012): lượt của người khác,
    // rồi đổi người, rồi tới luật điểm danh / nơi trực.
    if (
      before.user_id !== me() &&
      (input.user_id !== before.user_id ||
        input.start_time !== before.start_time ||
        input.end_time !== before.end_time ||
        input.status !== before.status ||
        (input.note ?? null) !== (before.note ?? null) ||
        locationsChanged)
    ) {
      throw new Error(EDIT_OTHER_ERROR)
    }
    if (input.user_id !== before.user_id) throw new Error(ADD_OTHER_ERROR)
    if (before.status !== 'confirmed') {
      const hoursChanged =
        input.start_time !== before.start_time ||
        input.end_time !== before.end_time
      // 010, luật G. `date` là ngày mới: bản thật lưu ca trước rồi mới tới
      // từng lượt, nên trigger của lượt thấy ngày đã đổi.
      if (hoursChanged && hoursLocked(date, before.start_time, new Date())) {
        throw new Error(
          'Bạn không có quyền sửa giờ khi đã tới giờ điểm danh — cần sửa thì nhắn admin.',
        )
      }
      if (
        input.status === 'confirmed' &&
        (hoursChanged ||
          (input.note ?? null) !== (before.note ?? null) ||
          locationsChanged)
      ) {
        throw new Error(
          'Bạn không có quyền vừa điểm danh vừa sửa lượt: lưu thay đổi trước rồi mới điểm danh.',
        )
      }
      // 015, luật R2 — trong trigger nằm sau các luật trên, trước luật
      // "nơi trực phải đang hiện". Chỉ xét khi mảng đổi: lượt cũ đã rỗng từ
      // trước vẫn sửa giờ / điểm danh được.
      if (
        locationsChanged &&
        nextLocationIds(before, input).length === 0 &&
        mustKeepLocation({ template_id: templateId }, currentMockProfile())
      ) {
        throw new Error(KEEP_LOCATION_MESSAGE)
      }
      if (locationsChanged) {
        assertLocationsUsable(nextLocationIds(before, input), before.location_ids)
      }
      if (input.status === 'confirmed') assertCanConfirm(input, date)
      continue
    }
    // 012: đã điểm danh là đã trực ở đâu xong — khoá cùng chỗ với giờ.
    if (locationsChanged && locationsLocked(before, currentMockProfile())) {
      throw new Error(CONFIRMED_LOCATIONS_ERROR)
    }
    if (input.status !== 'confirmed') {
      throw new Error('Bạn không có quyền bỏ điểm danh.')
    }
    if (
      input.start_time !== before.start_time ||
      input.end_time !== before.end_time ||
      input.user_id !== before.user_id
    ) {
      throw new Error('Bạn không có quyền sửa giờ của lượt đã điểm danh.')
    }
  }
  for (const input of inputs) {
    if (input.id) continue
    // 015, luật R1 đứng đầu trigger, trước mọi luật dành cho nhân viên.
    assertClaimHasLocation(templateId, input)
    if (input.user_id !== me()) throw new Error(ADD_OTHER_ERROR)
    if (input.status === 'confirmed') {
      throw new Error(
        'Bạn không có quyền điểm danh lúc thêm vào ca: thêm vào ca trước rồi mới điểm danh.',
      )
    }
    assertLocationsUsable(nextLocationIds(null, input))
  }
}

/**
 * Bản sao luật R1 của 015: tự thêm mình vào ca sinh từ ca mẫu (tức là nhận
 * ca) thì phải có ít nhất một nơi trực — mọi vai trò, kể cả admin. Luật R2
 * (không bỏ hết nơi trực) nằm trong vòng sửa lượt của `assertRosterAllowed`.
 */
function assertClaimHasLocation(templateId: UUID | null, input: AssignmentInput) {
  if (!templateId || input.id) return
  if (input.user_id === me() && nextLocationIds(null, input).length === 0) {
    throw new Error(CLAIM_NEEDS_LOCATION_MESSAGE)
  }
}

/** Bản sao unique (shift_id, user_id) của 010 — áp cho cả admin. */
function assertUniqueStaff(inputs: AssignmentInput[]) {
  const seen = new Set<UUID>()
  for (const input of inputs) {
    if (seen.has(input.user_id)) {
      throw new Error(
        'duplicate key value violates unique constraint "shift_assignments_shift_user_unique"',
      )
    }
    seen.add(input.user_id)
  }
}

/** Thời điểm điểm danh sau một lần ghi — client không tự đặt được. */
function confirmedAt(
  before: ShiftAssignment | null,
  status: AssignmentInput['status'],
  now: string,
): string | null {
  if (status !== 'confirmed') return null
  return before?.status === 'confirmed' ? (before.confirmed_at ?? null) : now
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
      metadata: assignmentMeta(shiftId, gone.user_id, gone.location_ids),
    })
  }

  for (const input of inputs) {
    if (input.id) {
      const before = state.assignments.find((a) => a.id === input.id)
      if (!before) continue
      const location_ids = nextLocationIds(before, input)
      const after: ShiftAssignment = {
        ...before,
        ...input,
        id: before.id,
        confirmed_at: confirmedAt(before, input.status, now),
        location_ids,
        updated_at: now,
      }
      state.assignments = state.assignments.map((a) =>
        a.id === input.id ? after : a,
      )

      const sameLocations = sameLocationIds(before.location_ids, location_ids)
      // 012: "đổi trạng thái" chỉ khi nơi trực cũng không đổi, giống trigger.
      const onlyStatus =
        before.status !== input.status &&
        before.start_time === input.start_time &&
        before.end_time === input.end_time &&
        before.user_id === input.user_id &&
        (before.note ?? null) === (input.note ?? null) &&
        sameLocations
      const unchanged =
        before.status === input.status &&
        before.start_time === input.start_time &&
        before.end_time === input.end_time &&
        before.user_id === input.user_id &&
        (before.note ?? null) === (input.note ?? null) &&
        sameLocations
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
        metadata: {
          ...assignmentMeta(shiftId, input.user_id, location_ids),
          ...(onlyStatus
            ? { old_status: before.status, new_status: input.status }
            : {}),
        },
      })
    } else {
      const created: ShiftAssignment = {
        id: uid('a'),
        shift_id: shiftId,
        user_id: input.user_id,
        start_time: input.start_time,
        end_time: input.end_time,
        status: input.status,
        confirmed_at: confirmedAt(null, input.status, now),
        note: input.note,
        location_ids: nextLocationIds(null, input),
        created_at: now,
        updated_at: now,
      }
      state.assignments.push(created)
      const names = locationNames(created.location_ids)
      pushLog({
        action: 'assignment.created',
        entity_type: 'assignment',
        entity_id: created.id,
        summary:
          `Thêm ${nameOf(input.user_id)} vào ca ${label.title} ngày ${label.date} (${input.start_time}-${input.end_time})` +
          locationSuffix(names),
        new_data: { ...created },
        metadata: assignmentMeta(shiftId, input.user_id, created.location_ids),
      })
    }
  }
}

/**
 * Nhận lại ca mẫu đã nhận, với nơi trực mới: chỉ đổi `location_ids` của lượt
 * đang có. Luật như trigger thấy một UPDATE đổi nơi trực: lượt của mình,
 * chưa điểm danh, mọi nơi đang bật.
 */
function mergeClaimLocations(mine: ShiftAssignment, ids: UUID[]) {
  const location_ids = normalizeLocationIds(ids)
  if (restricted()) {
    if (mine.user_id !== me()) throw new Error(EDIT_OTHER_ERROR)
    if (locationsLocked(mine, currentMockProfile())) {
      throw new Error(CONFIRMED_LOCATIONS_ERROR)
    }
    assertLocationsUsable(location_ids, mine.location_ids)
  }
  const now = new Date().toISOString()
  const after: ShiftAssignment = { ...mine, location_ids, updated_at: now }
  state.assignments = state.assignments.map((a) => (a.id === mine.id ? after : a))
  const label = shiftLabel(mine.shift_id)
  pushLog({
    action: 'assignment.updated',
    entity_type: 'assignment',
    entity_id: mine.id,
    summary: `Sửa phân công của ${nameOf(mine.user_id)} trong ca ${label.title} ngày ${label.date}`,
    old_data: { ...mine },
    new_data: { ...after },
    metadata: assignmentMeta(mine.shift_id, mine.user_id, location_ids),
  })
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
    // Chỉ phần danh bạ, như bản thật sau 011: email và vai trò không có ở đây.
    return delay(
      mockAccounts().map(({ id, display_name, displayed, created_at }) => ({
        id,
        display_name,
        displayed,
        created_at,
      })),
    )
  },

  async listAccounts() {
    // Bản sao list_accounts() của 011: máy chủ xét vai trò thật.
    if (currentMockProfile()?.role !== 'admin') {
      throw new ForbiddenError('Bạn không có quyền truy cập trang này.')
    }
    return delay(mockAccounts())
  },

  async updateProfile(id: UUID, input: ProfileInput) {
    // Bản sao của 007_accounts.sql: chỉ admin, tên không được trống.
    if (currentMockProfile()?.role !== 'admin') {
      throw new Error('Bạn không có quyền sửa tài khoản.')
    }
    if (input.display_name.trim() === '') {
      throw new Error('Tên hiển thị không được để trống.')
    }
    if (!MOCK_PROFILES.some((p) => p.id === id)) {
      throw new Error('Bạn không có quyền sửa tài khoản.')
    }
    state.profileEdits = { ...state.profileEdits, [id]: input }
    persist()
    await delay(null)
  },

  listShifts(query: ShiftQuery): Promise<ShiftWithAssignments[]> {
    const rows = state.shifts.map(withAssignments).filter((s) => {
      if (query.kind === 'user') {
        return s.assignments.some((a) => a.user_id === query.userId)
      }
      if (query.kind === 'pending') {
        return s.assignments.some((a) => a.status === 'pending')
      }
      if (query.kind === 'shift') return s.id === query.shiftId
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
    assertRosterAllowed(null, input.date, input.template_id ?? null, assignments)
    assertUniqueStaff(assignments)
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
    // 006, luật E: ca có người khác thì tên / ngày / giờ chỉ admin sửa được.
    // Ghi chú của ca thì không chặn.
    if (
      restricted() &&
      before &&
      hasOthers(withAssignments(before), me()) &&
      (before.title !== input.title ||
        before.date !== input.date ||
        before.start_time !== input.start_time ||
        before.end_time !== input.end_time)
    ) {
      throw new Error(
        'Bạn không có quyền sửa tên, ngày và giờ của ca có người khác.',
      )
    }
    // 010, luật 5: ca sinh từ ca mẫu giữ nguyên giờ và ca mẫu gốc.
    if (
      restricted() &&
      before &&
      input.template_id !== undefined &&
      (input.template_id ?? null) !== before.template_id
    ) {
      throw new Error('Bạn không có quyền đổi ca mẫu gốc của ca.')
    }
    if (
      restricted() &&
      before?.template_id &&
      (before.start_time !== input.start_time || before.end_time !== input.end_time)
    ) {
      throw new Error('Bạn không có quyền sửa giờ của ca tạo từ ca mẫu.')
    }
    if (
      restricted() &&
      before &&
      before.date !== input.date &&
      withAssignments(before).assignments.some((a) => a.status === 'confirmed')
    ) {
      throw new Error('Bạn không có quyền đổi ngày của ca đã có người điểm danh.')
    }
    // 010, luật G: dời ngày là cách khác để mở lại cửa sổ điểm danh đã qua.
    if (
      restricted() &&
      before &&
      before.date !== input.date &&
      withAssignments(before).assignments.some((a) =>
        hoursLocked(before.date, a.start_time, new Date()),
      )
    ) {
      throw new Error(
        'Bạn không có quyền dời ca sang ngày khác khi đã tới giờ điểm danh.',
      )
    }
    assertRosterAllowed(
      id,
      input.date,
      input.template_id !== undefined
        ? (input.template_id ?? null)
        : (before?.template_id ?? null),
      assignments,
    )
    assertUniqueStaff(assignments)
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

    if (shift && restricted()) {
      const block = deleteBlock({ assignments: doomed }, me(), new Date())
      if (block === 'others') {
        throw new Error('Bạn không có quyền xoá ca có người khác.')
      }
      if (block === 'confirmed') {
        throw new Error('Bạn không có quyền xoá ca đã có người điểm danh.')
      }
      if (block === 'late') {
        throw new Error('Bạn không có quyền xoá ca sau 30 phút kể từ lúc nhận.')
      }
    }

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
          location_ids: a.location_ids,
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
    if (before && before.status !== status) {
      if (restricted() && before.user_id !== me()) {
        throw new Error(EDIT_OTHER_ERROR)
      }
      if (status === 'confirmed') {
        assertCanConfirm(before, shiftLabel(before.shift_id).date)
      } else if (restricted()) {
        throw new Error('Bạn không có quyền bỏ điểm danh.')
      }
    }
    const confirmed_at = confirmedAt(before ?? null, status, now)
    state.assignments = state.assignments.map((a) =>
      a.id === assignmentId ? { ...a, status, confirmed_at, updated_at: now } : a,
    )
    if (before && before.status !== status) {
      const label = shiftLabel(before.shift_id)
      pushLog({
        action: 'assignment.status_changed',
        entity_type: 'assignment',
        entity_id: assignmentId,
        summary: `Đổi trạng thái của ${nameOf(before.user_id)} trong ca ${label.title} ngày ${label.date}: ${before.status} -> ${status}`,
        old_data: { ...before },
        new_data: { ...before, status, confirmed_at, updated_at: now },
        metadata: {
          ...assignmentMeta(before.shift_id, before.user_id, before.location_ids),
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
    assertCanManageTemplates()
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
    assertCanManageTemplates()
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
        (before.note ?? null) === (after.note ?? null) &&
        // 012: đổi màu cùng lúc thì là "sửa", không phải "bật / tắt".
        (before.color ?? null) === (after.color ?? null)
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
    assertCanManageTemplates()
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

  // ---- nơi trực (012) ----

  listLocations(): Promise<Location[]> {
    // Dữ liệu mẫu lưu trước 014 không có short_name.
    return delay(
      [...state.locations]
        .map((l) => ({ ...l, short_name: l.short_name ?? null }))
        .sort(compareLocations),
    )
  },

  async createLocation(input: LocationInput) {
    assertCanManageLocations()
    assertLocationInput(input, null)
    const now = new Date().toISOString()
    const created: Location = {
      id: uid('loc'),
      ...input,
      name: input.name.trim(),
      short_name: cleanShortName(input.short_name),
      created_by: me(),
      created_at: now,
      updated_at: now,
    }
    state.locations = [...state.locations, created]
    pushLog({
      action: 'location.created',
      entity_type: 'location',
      entity_id: created.id,
      summary: `Tạo nơi trực ${created.name}`,
      new_data: { ...created },
      metadata: { location_name: created.name },
    })
    persist()
    await delay(null)
  },

  async updateLocation(id: UUID, input: LocationInput) {
    assertCanManageLocations()
    assertLocationInput(input, id)
    const before = state.locations.find((l) => l.id === id)
    if (!before) {
      await delay(null)
      return
    }
    const now = new Date().toISOString()
    const after: Location = {
      ...before,
      ...input,
      name: input.name.trim(),
      short_name: cleanShortName(input.short_name),
      updated_at: now,
    }
    const same = (a: Location, b: Location) =>
      a.name === b.name &&
      (a.short_name ?? null) === (b.short_name ?? null) &&
      (a.color ?? null) === (b.color ?? null) &&
      a.sort_order === b.sort_order
    // Lưu mà không đổi gì thì không có dòng nhật ký, như trigger.
    if (same(before, after) && before.is_active === after.is_active) {
      await delay(null)
      return
    }
    state.locations = state.locations.map((l) => (l.id === id ? after : l))
    // Chỉ ẩn / hiện thì ghi thành hành động riêng, như ca mẫu.
    const onlyToggled = same(before, after)
    pushLog({
      action: onlyToggled ? 'location.toggled' : 'location.updated',
      entity_type: 'location',
      entity_id: id,
      summary: onlyToggled
        ? `${after.is_active ? 'Hiện' : 'Ẩn'} nơi trực ${after.name}`
        : `Sửa nơi trực ${after.name}`,
      old_data: { ...before },
      new_data: { ...after },
      metadata: {
        location_name: after.name,
        ...(onlyToggled ? { is_active: after.is_active } : {}),
      },
    })
    persist()
    await delay(null)
  },

  async deleteLocation(id: UUID) {
    assertCanManageLocations()
    // Mảng không có khoá ngoại nên trigger chặn thay, kể cả admin.
    if (state.assignments.some((a) => a.location_ids.includes(id))) {
      throw new Error(LOCATION_IN_USE_ERROR)
    }
    const before = state.locations.find((l) => l.id === id)
    state.locations = state.locations.filter((l) => l.id !== id)
    if (before) {
      pushLog({
        action: 'location.deleted',
        entity_type: 'location',
        entity_id: id,
        summary: `Xoá nơi trực ${before.name}`,
        old_data: { ...before },
        metadata: { location_name: before.name },
      })
    }
    persist()
    await delay(null)
  },

  async claimTemplate(
    templateId: UUID,
    date: string,
    userId: UUID,
    locationIds: UUID[],
  ) {
    const template = state.templates.find((t) => t.id === templateId)
    if (!template) throw new Error('Template not found')
    const location_ids = normalizeLocationIds(locationIds)
    // Hộp nhận ca chỉ đưa nơi trực đang bật. Bản Supabase kiểm tra điều này
    // bằng một lần đọc trước khi ghi gì (với mọi vai trò — phía client không
    // biết vai trò), để nơi vừa bị ẩn / xoá không để lại ca mồ côi và dòng
    // "Xoá ca" thừa; ở đây xét y như vậy.
    if (location_ids.some((id) => !state.locations.some((l) => l.id === id && l.is_active))) {
      throw new Error(LOCATION_UNUSABLE_ERROR)
    }

    const now = new Date().toISOString()
    let shift = state.shifts.find(
      (s) => s.template_id === templateId && s.date === date,
    )

    // Đã có trong ca: nơi trực mới gộp vào lượt đang có — bản thật là một
    // lệnh UPDATE, trigger ghi "Sửa phân công". Không có gì mới thì thôi.
    const mine = shift
      ? state.assignments.find(
          (a) => a.shift_id === shift?.id && a.user_id === userId,
        )
      : undefined
    if (mine) {
      // Đã điểm danh: nhận lại là no-op như trước khi có nơi trực (nhân viên
      // không đổi được nơi trực lúc này; dừng ở lỗi thì các ngày sau trong
      // cùng lần nhận nhiều ngày sẽ bị bỏ dở). Admin sửa trong form ca.
      const added =
        mine.status === 'confirmed'
          ? []
          : location_ids.filter((id) => !mine.location_ids.includes(id))
      if (added.length > 0) {
        mergeClaimLocations(mine, [...mine.location_ids, ...added])
        persist()
      }
      await delay(null)
      return
    }
    // Lượt mới (nơi trực đã xét ở đầu hàm). Xét trước khi tạo ca, để bị từ
    // chối thì không để lại ca mồ côi.
    if (userId !== me() && restricted()) throw new Error(ADD_OTHER_ERROR)
    // 015, luật R1: nhận ca cho chính mình phải có nơi trực — mọi vai trò.
    // Xét trước khi tạo ca, như bản Supabase, để không có ca mồ côi hay dòng
    // nhật ký thừa. Nhận lại ca đã có ở trên vẫn là no-op như bản thật.
    if (userId === me() && location_ids.length === 0) {
      throw new Error(CLAIM_NEEDS_LOCATION_MESSAGE)
    }

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
        confirmed_at: null,
        note: null,
        location_ids,
        created_at: now,
        updated_at: now,
      }
      state.assignments.push(created)
      const names = locationNames(location_ids)
      pushLog({
        action: 'assignment.claimed',
        entity_type: 'assignment',
        entity_id: created.id,
        summary:
          `Nhận ca ${shift.title} ngày ${date} (${template.start_time}-${template.end_time})` +
          locationSuffix(names),
        new_data: { ...created },
        metadata: {
          shift_id: shift.id,
          shift_title: shift.title,
          shift_date: date,
          target_user_id: userId,
          target_name: nameOf(userId),
          self: true,
          location_names: names,
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

  // Bản mock không có máy chủ: "máy chủ" chính là trình duyệt này.
  async serverTime() {
    return new Date()
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
