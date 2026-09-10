import type { PostgrestError } from '@supabase/supabase-js'
import type {
  ActionLog,
  ActionLogPage,
  ActionLogQuery,
  AssignmentInput,
  Profile,
  Shift,
  ShiftAssignment,
  ShiftInput,
  ShiftTemplate,
  ShiftWithAssignments,
  TemplateInput,
  UUID,
} from '../types'
import { getSupabase } from '../lib/supabaseClient'
import { normalizeTime } from '../lib/time'
import type { SchedulerBackend } from './backend'

/** Postgres `time` comes back as "HH:mm:ss"; the UI works in "HH:mm". */
function normalizeAssignment(row: ShiftAssignment): ShiftAssignment {
  return {
    ...row,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
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

/** Columns sent to `shift_assignments`, minus the local-only `id`. */
function assignmentRow(shiftId: UUID, input: AssignmentInput) {
  return {
    shift_id: shiftId,
    user_id: input.user_id,
    start_time: input.start_time,
    end_time: input.end_time,
    status: input.status,
    note: input.note,
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

  const newRows = inputs
    .filter((input) => !input.id)
    .map((input) => assignmentRow(shiftId, input))
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
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, created_at')
      .order('display_name')
    if (error) fail('Could not load staff', error)
    return (data ?? []) as Profile[]
  },

  async listShifts(): Promise<ShiftWithAssignments[]> {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('shifts')
      .select('*, assignments:shift_assignments(*)')
      .order('date')
      .order('start_time')
    if (error) fail('Could not load shifts', error)
    return ((data ?? []) as (Shift & { assignments: ShiftAssignment[] })[]).map(
      normalizeShift,
    )
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

  async claimTemplate(templateId: UUID, date: string, userId: UUID) {
    const supabase = getSupabase()

    const { data: template, error: templateError } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', templateId)
      .single()
    if (templateError) fail('Could not load the template', templateError)

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
      .select('id')
      .eq('shift_id', shiftId)
      .eq('user_id', userId)
      .maybeSingle()
    if (mineError) fail('Could not check the roster', mineError)
    if (mine) return // already claimed

    const { error: assignError } = await supabase
      .from('shift_assignments')
      .insert({
        shift_id: shiftId,
        user_id: userId,
        start_time: template.start_time,
        end_time: template.end_time,
        status: 'pending',
        note: null,
      })

    if (assignError) {
      // Dọn ca vừa tạo — xem ghi chú ở chỗ khai báo createdShiftId.
      if (createdShiftId) {
        await supabase.from('shifts').delete().eq('id', createdShiftId)
      }
      fail('Không nhận được ca', assignError)
    }
  },

  // ---- action log ----

  async listActionLogs(query: ActionLogQuery): Promise<ActionLogPage | null> {
    const supabase = getSupabase()

    // `count: 'exact'` để biết tổng số dòng khớp bộ lọc mà không phải tải hết.
    let q = supabase
      .from('action_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Ngày người dùng nhập là giờ máy họ; đổi sang mốc tuyệt đối để so sánh
    // với cột timestamptz cho đúng, kể cả khi máy chủ ở múi giờ khác.
    if (query.from) {
      q = q.gte('created_at', new Date(`${query.from}T00:00:00`).toISOString())
    }
    if (query.to) {
      q = q.lte('created_at', new Date(`${query.to}T23:59:59.999`).toISOString())
    }
    if (query.actorId) q = q.eq('actor_id', query.actorId)
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

    return () => {
      if (timer) clearTimeout(timer)
      void supabase.removeChannel(channel)
      void supabase.removeChannel(templateChannel)
    }
  },
}
