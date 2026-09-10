import type {
  ActionLogPage,
  ActionLogQuery,
  AssignmentInput,
  Profile,
  ShiftInput,
  ShiftTemplate,
  ShiftWithAssignments,
  TemplateInput,
  UUID,
} from '../types'

/**
 * The whole data surface the UI depends on. The mock backend and the Supabase
 * backend both implement this, so switching is a one-line change in
 * `data/index.ts`.
 */
export interface SchedulerBackend {
  /** Everyone who can be rostered. */
  listProfiles(): Promise<Profile[]>

  /** Every shift with its assignments attached. */
  listShifts(): Promise<ShiftWithAssignments[]>

  /**
   * Creates a shift and its roster in one call.
   * Returns the saved shift.
   */
  createShift(
    input: ShiftInput,
    assignments: AssignmentInput[],
  ): Promise<ShiftWithAssignments>

  /**
   * Updates a shift and reconciles its roster: assignments with an `id` are
   * updated, ones without are inserted, and any existing assignment missing
   * from the list is deleted.
   */
  updateShift(
    id: UUID,
    input: ShiftInput,
    assignments: AssignmentInput[],
  ): Promise<ShiftWithAssignments>

  deleteShift(id: UUID): Promise<void>

  /** Updates a single assignment's status without touching the rest. */
  setAssignmentStatus(
    assignmentId: UUID,
    status: AssignmentInput['status'],
  ): Promise<void>

  // ---- recurring shift templates ----

  /**
   * Returns every template, or `null` when the feature has not been installed
   * in the database yet (the migration hasn't been run). Returning null rather
   * than throwing keeps the rest of the app working.
   */
  listTemplates(): Promise<ShiftTemplate[] | null>

  createTemplate(input: TemplateInput): Promise<void>
  updateTemplate(id: UUID, input: TemplateInput): Promise<void>
  deleteTemplate(id: UUID): Promise<void>

  /**
   * Adds `userId` to the template's shift on `date`, creating that shift from
   * the template if nobody has claimed it yet. A second claim by the same
   * person is a no-op.
   */
  claimTemplate(templateId: UUID, date: string, userId: UUID): Promise<void>

  // ---- action log (chỉ đọc) ----

  /**
   * Một trang nhật ký thao tác, hoặc `null` khi migration 003 chưa được chạy.
   *
   * Cố ý chỉ có phương thức đọc: nhật ký do trigger trong database sinh ra và
   * vai trò `authenticated` không có quyền ghi, nên một hàm createActionLog
   * trong tầng này sẽ là lời hứa suông.
   */
  listActionLogs(query: ActionLogQuery): Promise<ActionLogPage | null>

  /**
   * Calls `onChange` whenever shifts or assignments change elsewhere.
   * Returns an unsubscribe function.
   */
  subscribe(onChange: () => void): () => void
}
