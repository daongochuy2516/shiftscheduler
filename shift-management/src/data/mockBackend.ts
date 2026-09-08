import type {
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
import type { SchedulerBackend } from './backend'
import {
  MOCK_ASSIGNMENTS,
  MOCK_PROFILES,
  MOCK_SHIFTS,
  MOCK_TEMPLATES,
} from './mockData'

const STORAGE_KEY = 'scheduler.mock.v2'
const LATENCY_MS = 120

interface Snapshot {
  shifts: Shift[]
  assignments: ShiftAssignment[]
  templates: ShiftTemplate[]
}

function seed(): Snapshot {
  return {
    shifts: MOCK_SHIFTS,
    assignments: MOCK_ASSIGNMENTS,
    templates: MOCK_TEMPLATES,
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

  state.assignments = state.assignments.filter(
    (a) => a.shift_id !== shiftId || keptIds.has(a.id),
  )

  for (const input of inputs) {
    if (input.id) {
      state.assignments = state.assignments.map((a) =>
        a.id === input.id ? { ...a, ...input, id: a.id, updated_at: now } : a,
      )
    } else {
      state.assignments.push({
        id: uid('a'),
        shift_id: shiftId,
        user_id: input.user_id,
        start_time: input.start_time,
        end_time: input.end_time,
        status: input.status,
        note: input.note,
        created_at: now,
        updated_at: now,
      })
    }
  }
}

export const mockBackend: SchedulerBackend = {
  listProfiles(): Promise<Profile[]> {
    return delay(
      [...MOCK_PROFILES].sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      ),
    )
  },

  listShifts(): Promise<ShiftWithAssignments[]> {
    return delay(state.shifts.map(withAssignments))
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
    reconcileAssignments(shift.id, assignments)
    persist()
    return delay(withAssignments(shift))
  },

  async updateShift(id: UUID, input: ShiftInput, assignments: AssignmentInput[]) {
    const now = new Date().toISOString()
    state.shifts = state.shifts.map((s) =>
      s.id === id ? { ...s, ...input, updated_at: now } : s,
    )
    reconcileAssignments(id, assignments)
    persist()
    const saved = state.shifts.find((s) => s.id === id)
    if (!saved) throw new Error('Shift not found')
    return delay(withAssignments(saved))
  },

  async deleteShift(id: UUID) {
    state.shifts = state.shifts.filter((s) => s.id !== id)
    // Mirrors `on delete cascade` in the real schema.
    state.assignments = state.assignments.filter((a) => a.shift_id !== id)
    persist()
    await delay(null)
  },

  async setAssignmentStatus(assignmentId: UUID, status) {
    const now = new Date().toISOString()
    state.assignments = state.assignments.map((a) =>
      a.id === assignmentId ? { ...a, status, updated_at: now } : a,
    )
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
    state.templates = [
      ...state.templates,
      {
        id: uid('t'),
        ...input,
        created_by: null,
        created_at: now,
        updated_at: now,
      },
    ]
    persist()
    await delay(null)
  },

  async updateTemplate(id: UUID, input: TemplateInput) {
    const now = new Date().toISOString()
    state.templates = state.templates.map((t) =>
      t.id === id ? { ...t, ...input, updated_at: now } : t,
    )
    persist()
    await delay(null)
  },

  async deleteTemplate(id: UUID) {
    state.templates = state.templates.filter((t) => t.id !== id)
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
      state.assignments.push({
        id: uid('a'),
        shift_id: shift.id,
        user_id: userId,
        start_time: template.start_time,
        end_time: template.end_time,
        status: 'pending',
        note: null,
        created_at: now,
        updated_at: now,
      })
    }

    persist()
    await delay(null)
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
