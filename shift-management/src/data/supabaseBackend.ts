import type { PostgrestError } from '@supabase/supabase-js'
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
import { CLAIM_NEEDS_LOCATION_MESSAGE } from '../lib/attendance'
import { getSupabase } from '../lib/supabaseClient'
import { normalizeTime } from '../lib/time'
import { ForbiddenError, type SchedulerBackend } from './backend'

/** Postgres `time` comes back as "HH:mm:ss"; the UI works in "HH:mm". */
function normalizeAssignment(row: ShiftAssignment): ShiftAssignment {
  return {
    ...row,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    // Absent until migration 005 adds the column.
    confirmed_at: row.confirmed_at ?? null,
    // Absent until migration 012 adds the column.
    location_ids: row.location_ids ?? [],
  }
}

function normalizeShift(
  row: Shift & { assignments: ShiftAssignment[] | null },
): ShiftWithAssignments {
  return {
    ...row,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
    // Absent entirely until migration 002 adds the column.
    template_id: row.template_id ?? null,
    assignments: (row.assignments ?? []).map(normalizeAssignment),
  }
}

/**
 * Lọc ca có **tất cả** các nhân viên (AND): mỗi người là một lần nhúng
 * shift_assignments riêng với !inner, đặt tên match_0, match_1… Mỗi lần nhúng
 * lọc độc lập nên ca phải khớp hết. Lọc thẳng trên `assignments` thì sẽ cắt
 * mất những người còn lại trong ca.
 */
function staffMatchColumns(userIds: UUID[]): string {
  return userIds
    .map((_, i) => `, match_${i}:shift_assignments!inner(user_id)`)
    .join('')
}

/** Bỏ các cột match_* chỉ dùng để lọc, không để lọt vào dữ liệu trả về. */
function withoutMatches<T extends object>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith('match_')),
  ) as T
}

/**
 * Nhóm điều kiện "liên quan tới một người" cho nhật ký, theo cú pháp or() của
 * PostgREST. Giá trị JSON có dấu hai chấm nên phải bọc trong ngoặc kép.
 */
function involvesStaff(id: UUID): string {
  const removed = JSON.stringify(JSON.stringify([{ user_id: id }]))
  return [
    `actor_id.eq.${id}`,
    `metadata->>target_user_id.eq.${id}`,
    `metadata->staff_removed.cs.${removed}`,
  ].join(',')
}

/**
 * Đã chạy 012 chưa, theo lần `listLocations` gần nhất (`null` = chưa biết).
 * `claimTemplate` cần biết để chặn nhận ca không có nơi trực (015, luật R1)
 * trước khi ghi gì, mà không phải gửi thêm một truy vấn sẽ lỗi khi 012 chưa
 * chạy. ScheduleProvider luôn tải danh sách nơi trực khi vào app, nên lúc
 * người dùng bấm Nhận ca giá trị này thường đã có; vào app lúc mất mạng (danh
 * sách lấy từ bản lưu offline) thì còn `null` và `claimTemplate` tự hỏi lại.
 */
let locationsInstalled: boolean | null = null

function fail(context: string, error: PostgrestError): never {
  throw new Error(`${context}: ${error.message}`)
}

/**
 * Signals that a table doesn't exist, i.e. the migration hasn't been run.
 *
 * PostgREST answers from its own schema cache and reports PGRST205 rather than
 * passing through Postgres's 42P01, so both have to be recognised.
 */
function isMissingTable(error: PostgrestError): boolean {
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    /could not find the table/i.test(error.message)
  )
}

/** Hàm SQL chưa có (migration chưa chạy) — PostgREST báo PGRST202. */
export function isMissingFunction(error: PostgrestError): boolean {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function/i.test(error.message)
  )
}

/**
 * Ghi nơi trực kèm `short_name`; nếu PostgREST báo chưa có cột đó (014 chưa
 * chạy — PGRST204) thì ghi lại không có nó, để admin vẫn thêm / sửa được nơi
 * trực. Tên tắt khi đó bị bỏ qua (chip tự cắt từ tên).
 */
async function withoutMissingShortName(
  input: LocationInput,
  write: (
    payload: Partial<LocationInput>,
  ) => PromiseLike<{ error: PostgrestError | null }>,
): Promise<{ error: PostgrestError | null }> {
  const first = await write(input)
  if (
    first.error &&
    first.error.code === 'PGRST204' &&
    /short_name/.test(first.error.message)
  ) {
    const { short_name: _omit, ...rest } = input
    void _omit
    return write(rest)
  }
  return first
}

/**
 * Columns sent to `shift_assignments`, minus the local-only `id`.
 * `location_ids` only when the caller set it: before migration 012 the column
 * doesn't exist and sending it at all fails the whole write (PGRST204).
 */
function assignmentRow(shiftId: UUID, input: AssignmentInput) {
  return {
    shift_id: shiftId,
    user_id: input.user_id,
    start_time: input.start_time,
    end_time: input.end_time,
    status: input.status,
    note: input.note,
    ...(input.location_ids !== undefined
      ? { location_ids: input.location_ids }
      : {}),
  }
}

/**
 * Brings `shift_assignments` in line with what the modal submitted: rows with
 * an id are updated, rows without one are inserted, and any row still in the
 * table but missing from the payload is deleted.
 */
async function reconcileAssignments(
  shiftId: UUID,
  inputs: AssignmentInput[],
): Promise<void> {
  const supabase = getSupabase()

  const { data: existing, error: readError } = await supabase
    .from('shift_assignments')
    .select('id')
    .eq('shift_id', shiftId)
  if (readError) fail('Could not read the current roster', readError)

  const keptIds = new Set(
    inputs.map((a) => a.id).filter((id): id is UUID => Boolean(id)),
  )
  const removedIds = (existing ?? [])
    .map((row) => row.id as UUID)
    .filter((id) => !keptIds.has(id))

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .in('id', removedIds)
    if (error) fail('Could not remove staff from the shift', error)
  }

  // Updates run one row at a time because each carries different values.
  for (const input of inputs) {
    if (!input.id) continue
    const { error } = await supabase
      .from('shift_assignments')
      .update(assignmentRow(shiftId, input))
      .eq('id', input.id)
    if (error) fail('Could not update an assignment', error)
  }

  const added = inputs.filter((input) => !input.id)
  // A bulk insert sends the union of every row's keys and fills a missing one
  // with null, which `location_ids not null` rejects — so once one new row
  // carries locations, give the others an explicit empty list.
  const withLocations = added.some((input) => input.location_ids !== undefined)
  const newRows = added.map((input) =>
    assignmentRow(
      shiftId,
      withLocations ? { ...input, location_ids: input.location_ids ?? [] } : input,
    ),
  )
  if (newRows.length > 0) {
    const { error } = await supabase.from('shift_assignments').insert(newRows)
    if (error) fail('Could not add staff to the shift', error)
  }
}

async function fetchShift(id: UUID): Promise<ShiftWithAssignments> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('shifts')
    .select('*, assignments:shift_assignments(*)')
    .eq('id', id)
    .single()
  if (error) fail('Could not load the saved shift', error)
  return normalizeShift(data as Shift & { assignments: ShiftAssignment[] })
}

export const supabaseBackend: SchedulerBackend = {
  async listProfiles(): Promise<Profile[]> {
    const supabase = getSupabase()
    // Liệt kê đúng các cột danh bạ: từ 011 chỉ chúng đọc được, `*` hay
    // `email` là bị từ chối cả truy vấn.
    const directory = (columns: string) =>
      supabase.from('profiles').select(columns).order('display_name')
    let { data, error } = await directory('id, display_name, displayed, created_at')
    // Chưa chạy 007 thì chưa có cột `displayed`.
    if (error?.code === '42703') {
      ;({ data, error } = await directory('id, display_name, created_at'))
    }
    if (error) fail('Could not load staff', error)
    return ((data ?? []) as unknown as Profile[]).map((row) => ({
      id: row.id,
      display_name: row.display_name,
      // Chưa chạy 007 thì cột chưa có: null, coi như hiện.
      displayed: row.displayed ?? null,
      created_at: row.created_at,
    }))
  },

  async listAccounts(): Promise<Account[] | null> {
    const { data, error } = await getSupabase().rpc('list_accounts')
    if (error) {
      if (isMissingFunction(error)) return null
      // list_accounts() tự kiểm tra admin và từ chối bằng 42501; anon thì
      // bị từ chối ngay ở quyền gọi hàm, cũng 42501.
      if (error.code === '42501') throw new ForbiddenError(error.message)
      fail('Không tải được danh sách tài khoản', error)
    }
    return ((data ?? []) as Account[]).map((row) => ({
      ...row,
      role: row.role ?? null,
      displayed: row.displayed ?? null,
    }))
  },

  async updateProfile(id: UUID, input: ProfileInput) {
    const supabase = getSupabase()
    // `select` để biết có dòng nào thật sự được sửa: RLS từ chối thì Supabase
    // không báo lỗi mà chỉ trả về 0 dòng.
    const { data, error } = await supabase
      .from('profiles')
      .update(input)
      .eq('id', id)
      .select('id')
    if (error) fail('Could not update the account', error)
    if (!data || data.length === 0) {
      throw new Error('Bạn không có quyền sửa tài khoản.')
    }
  },

  async listShifts(query: ShiftQuery): Promise<ShiftWithAssignments[]> {
    const supabase = getSupabase()
    const all = '*, assignments:shift_assignments(*)'

    // Lọc theo người / trạng thái: nhúng shift_assignments lần thứ hai dưới
    // tên `match` với !inner để lọc ca, còn `assignments` vẫn trả đủ người.
    // Lọc thẳng trên `assignments` sẽ cắt mất những người còn lại trong ca.
    let request
    if (query.kind === 'user') {
      request = supabase
        .from('shifts')
        .select(`${all}${staffMatchColumns([query.userId])}`)
        .eq('match_0.user_id', query.userId)
    } else if (query.kind === 'pending') {
      request = supabase
        .from('shifts')
        .select(`${all}, match_0:shift_assignments!inner(status)`)
        .eq('match_0.status', 'pending')
    } else if (query.kind === 'shift') {
      request = supabase.from('shifts').select(all).eq('id', query.shiftId)
    } else {
      const userIds = query.userIds ?? []
      request = supabase
        .from('shifts')
        .select(`${all}${staffMatchColumns(userIds)}`)
      for (const [i, id] of userIds.entries()) {
        request = request.eq(`match_${i}.user_id`, id)
      }
      if (query.from) request = request.gte('date', query.from)
      if (query.to) request = request.lte('date', query.to)
    }

    const { data, error } = await request.order('date').order('start_time')
    if (error) fail('Could not load shifts', error)
    return ((data ?? []) as (Shift & { assignments: ShiftAssignment[] })[]).map(
      (row) => normalizeShift(withoutMatches(row)),
    )
  },

  async shiftDateBounds(userIds: UUID[]): Promise<ShiftDateBounds> {
    const supabase = getSupabase()
    // Có index shifts_date_idx nên mỗi đầu chỉ là một lần đọc đầu index.
    const edge = (ascending: boolean) => {
      let base = supabase
        .from('shifts')
        .select(`date${staffMatchColumns(userIds)}`)
      userIds.forEach((id, i) => {
        base = base.eq(`match_${i}.user_id`, id)
      })
      return base.order('date', { ascending }).limit(1).maybeSingle()
    }
    const [first, last] = await Promise.all([edge(true), edge(false)])
    if (first.error) fail('Could not load the earliest shift', first.error)
    if (last.error) fail('Could not load the latest shift', last.error)
    const dateOf = (row: unknown) =>
      (row as { date?: string } | null)?.date ?? null
    return { earliest: dateOf(first.data), latest: dateOf(last.data) }
  },

  async createShift(input: ShiftInput, assignments: AssignmentInput[]) {
    const supabase = getSupabase()
    // `created_by` is filled in by the column default (auth.uid()).
    const { data, error } = await supabase
      .from('shifts')
      .insert(input)
      .select('id')
      .single()
    if (error) fail('Could not create the shift', error)

    const shiftId = data.id as UUID
    await reconcileAssignments(shiftId, assignments)
    return fetchShift(shiftId)
  },

  async updateShift(
    id: UUID,
    input: ShiftInput,
    assignments: AssignmentInput[],
  ) {
    const supabase = getSupabase()
    const { error } = await supabase.from('shifts').update(input).eq('id', id)
    if (error) fail('Could not update the shift', error)

    await reconcileAssignments(id, assignments)
    return fetchShift(id)
  },

  async deleteShift(id: UUID) {
    const supabase = getSupabase()
    // `on delete cascade` removes the assignments with it.
    const { error } = await supabase.from('shifts').delete().eq('id', id)
    if (error) fail('Could not delete the shift', error)
  },

  async setAssignmentStatus(assignmentId: UUID, status) {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('shift_assignments')
      .update({ status })
      .eq('id', assignmentId)
    if (error) fail('Could not update the status', error)
  },

  // ---- templates ----

  async listTemplates(): Promise<ShiftTemplate[] | null> {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .order('start_time')
    if (error) {
      // The rest of the app works fine without templates, so a missing table
      // switches the feature off instead of breaking the page.
      if (isMissingTable(error)) return null
      fail('Could not load templates', error)
    }
    return ((data ?? []) as ShiftTemplate[]).map((row) => ({
      ...row,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      weekdays: row.weekdays ?? [],
      color: row.color ?? null,
    }))
  },

  async createTemplate(input: TemplateInput) {
    const supabase = getSupabase()
    const { error } = await supabase.from('shift_templates').insert(input)
    if (error) fail('Could not create the template', error)
  },

  async updateTemplate(id: UUID, input: TemplateInput) {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('shift_templates')
      .update(input)
      .eq('id', id)
    if (error) fail('Could not update the template', error)
  },

  async deleteTemplate(id: UUID) {
    const supabase = getSupabase()
    // `on delete set null` on shifts.template_id keeps existing shifts.
    const { error } = await supabase
      .from('shift_templates')
      .delete()
      .eq('id', id)
    if (error) fail('Could not delete the template', error)
  },

  // ---- locations (012) ----

  async listLocations(): Promise<Location[] | null> {
    // `*` thay vì liệt kê cột: `short_name` (014) có thể chưa có, liệt kê
    // một cột không tồn tại thì cả truy vấn lỗi.
    const { data, error } = await getSupabase()
      .from('locations')
      .select('*')
      .order('sort_order')
      .order('name')
    if (error) {
      // Chưa chạy 012: tắt mọi thứ về nơi trực thay vì vỡ trang.
      if (isMissingTable(error)) {
        locationsInstalled = false
        return null
      }
      fail('Không tải được danh sách nơi trực', error)
    }
    locationsInstalled = true
    return ((data ?? []) as Location[]).map((row) => ({
      ...row,
      short_name: row.short_name ?? null,
      color: row.color ?? null,
    }))
  },

  async createLocation(input: LocationInput) {
    // `created_by` lấy từ default của cột (auth.uid()).
    const { error } = await withoutMissingShortName(input, (payload) =>
      getSupabase().from('locations').insert(payload),
    )
    if (error) fail('Không tạo được nơi trực', error)
  },

  async updateLocation(id: UUID, input: LocationInput) {
    const { error } = await withoutMissingShortName(input, (payload) =>
      getSupabase().from('locations').update(payload).eq('id', id),
    )
    if (error) fail('Không sửa được nơi trực', error)
  },

  async deleteLocation(id: UUID) {
    // Trigger của 012 từ chối khi còn lượt nào dùng nơi này.
    const { error } = await getSupabase().from('locations').delete().eq('id', id)
    if (error) fail('Không xoá được nơi trực', error)
  },

  async claimTemplate(
    templateId: UUID,
    date: string,
    userId: UUID,
    locationIds: UUID[],
  ) {
    const supabase = getSupabase()

    const { data: template, error: templateError } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', templateId)
      .single()
    if (templateError) fail('Could not load the template', templateError)

    // Chỉ đọc / gửi `location_ids` khi có chọn nơi trực: chưa chạy 012 thì
    // cột chưa có, nhắc tới nó là hỏng cả truy vấn.
    const withLocations = locationIds.length > 0
    if (withLocations) {
      // Kiểm tra trước khi ghi gì: nơi vừa bị ẩn / xoá mà để trigger 012 từ
      // chối lượt mới thì ca vừa tạo phải xoá đi, và việc xoá đó sinh một
      // dòng "Xoá ca" cho một thao tác đã thất bại. Áp cho mọi vai trò (ở đây
      // không biết vai trò) — hộp nhận ca vốn chỉ đưa nơi đang bật; bản mock
      // xét y như vậy.
      const { data: usable, error: usableError } = await supabase
        .from('locations')
        .select('id')
        .in('id', locationIds)
        .eq('is_active', true)
      if (usableError) fail('Không nhận được ca', usableError)
      const ok = new Set((usable ?? []).map((row) => row.id as UUID))
      if (locationIds.some((id) => !ok.has(id))) {
        throw new Error('Nơi trực không tồn tại hoặc đã bị ẩn.')
      }
    }

    // 015, luật R1: nhận ca cho chính mình phải có ít nhất một nơi trực. Nơi
    // chặn thật là trigger; ở đây chặn sớm (trước khi tạo ca, ngay trước khi
    // thêm lượt) để bị từ chối thì không có ca mồ côi phải xoá — việc xoá đó
    // sinh một dòng "Xoá ca" thừa. Chỉ chặn khi đã chạy 012
    // (`locationsInstalled`): chưa chạy thì giao diện gửi [] và nhận ca vẫn
    // phải được. Chưa biết (null — vd lúc vào app mất mạng, danh sách nơi
    // trực lấy từ bản lưu offline) thì hỏi máy chủ một lần trước khi ghi gì.
    // Nhận lại ca đã có trong đó vẫn là no-op như trước, giống bản thật.
    let claimNeedsLocation = false
    if (!withLocations) {
      if (locationsInstalled === null) {
        const { error: probeError } = await supabase
          .from('locations')
          .select('id')
          .limit(1)
        if (probeError && !isMissingTable(probeError)) {
          fail('Không nhận được ca', probeError)
        }
        locationsInstalled = !probeError
      }
      if (locationsInstalled) {
        const { data: auth } = await supabase.auth.getSession()
        claimNeedsLocation = auth.session?.user.id === userId
      }
    }

    // One shift per template per day: reuse it if someone already claimed.
    const { data: existing, error: findError } = await supabase
      .from('shifts')
      .select('id')
      .eq('template_id', templateId)
      .eq('date', date)
      .maybeSingle()
    if (findError) fail('Could not look up the shift', findError)

    let shiftId = existing?.id as UUID | undefined
    // Ca do chính lần nhận này tạo ra. Nếu bước thêm phân công thất bại thì
    // phải xoá đi: trigger cố ý không ghi log cho ca sinh từ ca mẫu (dòng
    // "Nhận ca" mới là dòng ghi việc đó), nên một ca mồ côi sẽ nằm ngoài
    // nhật ký. Xoá luôn vừa giữ dữ liệu sạch vừa không tạo lỗ hổng audit.
    let createdShiftId: UUID | null = null

    if (!shiftId) {
      // Ca chưa có thì chắc chắn chưa có lượt của mình: lần nhận này sẽ thêm.
      if (claimNeedsLocation) throw new Error(CLAIM_NEEDS_LOCATION_MESSAGE)
      const { data: created, error: createError } = await supabase
        .from('shifts')
        .insert({
          title: template.title,
          date,
          start_time: template.start_time,
          end_time: template.end_time,
          note: template.note,
          template_id: templateId,
        })
        .select('id')
        .single()

      if (createError) {
        // Someone else claimed the same template for this day in the gap
        // between our lookup and insert — take their shift instead.
        const { data: raced } = await supabase
          .from('shifts')
          .select('id')
          .eq('template_id', templateId)
          .eq('date', date)
          .maybeSingle()
        if (!raced) fail('Could not create the shift', createError)
        shiftId = raced.id as UUID
      } else {
        shiftId = created.id as UUID
        createdShiftId = shiftId
      }
    }

    const { data: mine, error: mineError } = await supabase
      .from('shift_assignments')
      .select(withLocations ? 'id, status, location_ids' : 'id, status')
      .eq('shift_id', shiftId)
      .eq('user_id', userId)
      .maybeSingle()
    if (mineError) fail('Could not check the roster', mineError)
    if (mine) {
      // Đã có trong ca: nhận lại với nơi trực mới thì gộp vào lượt đang có
      // (một người một lượt mỗi ca), không có gì mới thì thôi như trước.
      // Đã điểm danh thì nhận lại là no-op như trước: trigger 012 từ chối
      // nhân viên đổi nơi trực lúc này, và lỗi sẽ dừng các ngày sau của lần
      // nhận nhiều ngày. Admin sửa nơi trực trong form ca.
      const row = mine as unknown as {
        id: UUID
        status: string
        location_ids?: UUID[] | null
      }
      if (row.status === 'confirmed') return
      const current = row.location_ids ?? []
      const added = locationIds.filter((id) => !current.includes(id))
      if (added.length === 0) return
      const { error: mergeError } = await supabase
        .from('shift_assignments')
        .update({ location_ids: [...current, ...added] })
        .eq('id', row.id)
      if (mergeError) fail('Không nhận được ca', mergeError)
      return
    }
    // Ca đã có từ trước (ca mới thì đã chặn ở trên) mà chưa có lượt của mình:
    // đây là lượt mới, chưa ghi gì nên dừng ở đây không để lại gì.
    if (claimNeedsLocation) throw new Error(CLAIM_NEEDS_LOCATION_MESSAGE)

    const { error: assignError } = await supabase
      .from('shift_assignments')
      .insert({
        shift_id: shiftId,
        user_id: userId,
        start_time: template.start_time,
        end_time: template.end_time,
        status: 'pending',
        note: null,
        ...(withLocations ? { location_ids: locationIds } : {}),
      })

    if (assignError) {
      // Dọn ca vừa tạo — xem ghi chú ở chỗ khai báo createdShiftId.
      if (createdShiftId) {
        await supabase.from('shifts').delete().eq('id', createdShiftId)
      }
      // Câu của luật 015 trả nguyên văn, trùng với lần chặn sớm ở trên và
      // bản mock.
      if (assignError.message === CLAIM_NEEDS_LOCATION_MESSAGE) {
        throw new Error(CLAIM_NEEDS_LOCATION_MESSAGE)
      }
      fail('Không nhận được ca', assignError)
    }
  },

  // ---- action log ----

  async listActionLogs(query: ActionLogQuery): Promise<ActionLogPage | null> {
    const supabase = getSupabase()

    // `count: 'exact'` để biết tổng số dòng khớp bộ lọc mà không phải tải hết.
    // Liệt kê cột thay vì `*`: từ 011 `actor_email` không đọc được.
    let q = supabase
      .from('action_logs')
      .select(
        'id, created_at, actor_id, actor_name, action, entity_type, entity_id, summary, old_data, new_data, metadata',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })

    // Ngày người dùng nhập là giờ máy họ; đổi sang mốc tuyệt đối để so sánh
    // với cột timestamptz cho đúng, kể cả khi máy chủ ở múi giờ khác.
    if (query.from) {
      q = q.gte('created_at', new Date(`${query.from}T00:00:00`).toISOString())
    }
    if (query.to) {
      q = q.lte('created_at', new Date(`${query.to}T23:59:59.999`).toISOString())
    }
    // AND giữa các nhân viên: mỗi người một nhóm or(), gộp trong and().
    if (query.staffIds.length === 1) {
      q = q.or(involvesStaff(query.staffIds[0]))
    } else if (query.staffIds.length > 1) {
      q = q.or(
        `and(${query.staffIds.map((id) => `or(${involvesStaff(id)})`).join(',')})`,
      )
    }
    if (query.action) q = q.eq('action', query.action)
    if (query.entityType) q = q.eq('entity_type', query.entityType)
    if (query.search) {
      // Dấu % và _ trong chuỗi tìm kiếm phải được thoát, nếu không người dùng
      // gõ '%' sẽ khớp mọi dòng.
      const escaped = query.search.replace(/[%_\\]/g, (c) => `\\${c}`)
      q = q.ilike('summary', `%${escaped}%`)
    }

    const start = query.page * query.pageSize
    q = q.range(start, start + query.pageSize - 1)

    const { data, error, count } = await q
    if (error) {
      if (isMissingTable(error)) return null
      fail('Không tải được nhật ký thao tác', error)
    }

    return {
      rows: ((data ?? []) as ActionLog[]).map((row) => ({
        ...row,
        metadata: row.metadata ?? {},
      })),
      total: count ?? 0,
    }
  },

  async serverTime() {
    const { data, error } = await getSupabase().rpc('server_now')
    if (error) {
      if (isMissingFunction(error)) return null
      fail('Không lấy được giờ máy chủ', error)
    }
    // timestamptz tới micro giây; cắt còn mili giây cho chắc mọi trình duyệt
    // đều đọc được.
    const at = new Date(String(data).replace(/(\.\d{3})\d+/, '$1'))
    return Number.isNaN(at.getTime()) ? null : at
  },

  subscribe(onChange: () => void) {
    const supabase = getSupabase()

    // One save touches a shift plus several assignments, so a burst of events
    // arrives together. Coalesce them into a single refetch.
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, 150)
    }

    const channel = supabase
      .channel('scheduler-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        schedule,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_assignments' },
        schedule,
      )
      .subscribe()

    // Templates live on their own channel: if the migration hasn't been run,
    // this one errors on its own without taking the shifts channel down.
    const templateChannel = supabase
      .channel('scheduler-template-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_templates' },
        schedule,
      )
      .subscribe()

    // Nơi trực cũng kênh riêng, cùng lý do: chưa chạy 012 thì chỉ kênh này lỗi.
    const locationChannel = supabase
      .channel('scheduler-location-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'locations' },
        schedule,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(templateChannel)
      void supabase.removeChannel(locationChannel)
    }
  },
}
