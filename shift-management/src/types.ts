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

/** A shift together with its assignments — the shape the UI works with. */
export interface ShiftWithAssignments extends Shift {
  assignments: ShiftAssignment[]
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
