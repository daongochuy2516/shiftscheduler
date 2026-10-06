import { addDays } from 'date-fns'
import type { Profile, Shift, ShiftAssignment, ShiftTemplate } from '../types'
import { toDateKey } from '../lib/time'

const now = new Date()
export const TODAY = toDateKey(now)
export const YESTERDAY = toDateKey(addDays(now, -1))
export const TOMORROW = toDateKey(addDays(now, 1))

const ts = now.toISOString()

/**
 * Huy là admin để thử được cả hai phía của luật chấm công; còn lại là staff.
 * Quản lý là admin đang ẩn (displayed = false): vào được web nhưng không hiện
 * trong các bảng xếp ca.
 */
export const MOCK_PROFILES: Profile[] = [
  {
    id: 'u-huy',
    email: 'huy@thinkwork.test',
    display_name: 'Huy Nguyen',
    role: 'admin',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-thien',
    email: 'thien@thinkwork.test',
    display_name: 'Thien Pham',
    role: 'staff',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-an',
    email: 'an@thinkwork.test',
    display_name: 'An Tran',
    role: 'staff',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-mai',
    email: 'mai@thinkwork.test',
    display_name: 'Mai Le',
    role: 'staff',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-long',
    email: 'long@thinkwork.test',
    display_name: 'Long Vo',
    role: 'staff',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-ngoc',
    email: 'ngoc@thinkwork.test',
    display_name: 'Ngoc Bui',
    role: 'staff',
    displayed: true,
    created_at: ts,
  },
  {
    id: 'u-manager',
    email: 'manager@thinkwork.test',
    display_name: 'Quản lý',
    role: 'admin',
    displayed: false,
    created_at: ts,
  },
]

/** The signed-in user while running on mock data. */
export const MOCK_CURRENT_USER_ID = 'u-huy'

function shift(
  id: string,
  title: string,
  date: string,
  start_time: string,
  end_time: string,
  note: string | null = null,
): Shift {
  return {
    id,
    title,
    date,
    start_time,
    end_time,
    note,
    created_by: MOCK_CURRENT_USER_ID,
    template_id: null,
    created_at: ts,
    updated_at: ts,
  }
}

function assignment(
  id: string,
  shift_id: string,
  user_id: string,
  start_time: string,
  end_time: string,
  status: ShiftAssignment['status'] = 'confirmed',
  note: string | null = null,
): ShiftAssignment {
  return {
    id,
    shift_id,
    user_id,
    start_time,
    end_time,
    status,
    confirmed_at: status === 'confirmed' ? ts : null,
    note,
    created_at: ts,
    updated_at: ts,
  }
}

export const MOCK_SHIFTS: Shift[] = [
  shift(
    's-page-support',
    'Page Support',
    TODAY,
    '08:00',
    '18:00',
    'Front desk + inbound pages. Hand over notes in the channel.',
  ),
  shift('s-standup', 'Standup Coverage', TODAY, '11:00', '13:00'),
  shift('s-late-desk', 'Late Desk', TODAY, '16:00', '22:00', 'Close the office.'),
  shift('s-morning-prep', 'Morning Prep', TODAY, '06:00', '09:00'),
  shift('s-yesterday-support', 'Page Support', YESTERDAY, '08:00', '18:00'),
  shift('s-tomorrow-support', 'Page Support', TOMORROW, '08:00', '18:00'),
  shift('s-tomorrow-training', 'New Hire Training', TOMORROW, '13:00', '17:00', 'Room 2B.'),
]

/** Weekday numbers follow JS: 0 = Sunday … 6 = Saturday. */
export const MOCK_TEMPLATES: ShiftTemplate[] = [
  {
    id: 't-page-support',
    title: 'Page Support',
    start_time: '08:00',
    end_time: '18:00',
    note: 'Front desk + inbound pages.',
    weekdays: [1, 2, 3, 4, 5],
    is_active: true,
    color: 'teal',
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
  {
    id: 't-late-desk',
    title: 'Late Desk',
    start_time: '16:00',
    end_time: '22:00',
    note: 'Close the office.',
    weekdays: [1, 2, 3, 4, 5],
    is_active: true,
    color: 'violet',
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
  {
    id: 't-weekend-oncall',
    title: 'Weekend On-call',
    start_time: '09:00',
    end_time: '17:00',
    note: null,
    weekdays: [0, 6],
    is_active: true,
    color: 'amber',
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
  {
    id: 't-morning-prep',
    title: 'Morning Prep',
    start_time: '06:00',
    end_time: '09:00',
    note: null,
    weekdays: [],
    is_active: true,
    color: null,
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
]

export const MOCK_ASSIGNMENTS: ShiftAssignment[] = [
  // Page Support 08:00–18:00 — three staff, three different ranges.
  assignment('a-1', 's-page-support', 'u-huy', '08:00', '12:00'),
  assignment('a-2', 's-page-support', 'u-thien', '10:00', '16:00'),
  assignment('a-3', 's-page-support', 'u-an', '15:00', '18:00', 'pending'),

  // Overlaps with Huy's Page Support block — exercises the stacking logic.
  assignment('a-4', 's-standup', 'u-huy', '11:00', '13:00', 'pending'),
  assignment('a-5', 's-standup', 'u-mai', '11:00', '12:00'),

  assignment('a-6', 's-late-desk', 'u-long', '16:00', '22:00'),
  assignment('a-7', 's-late-desk', 'u-ngoc', '18:00', '22:00', 'pending'),

  assignment('a-8', 's-morning-prep', 'u-mai', '06:00', '09:00'),

  assignment('a-9', 's-yesterday-support', 'u-huy', '08:00', '14:00'),
  assignment('a-10', 's-yesterday-support', 'u-ngoc', '13:00', '18:00'),

  assignment('a-11', 's-tomorrow-support', 'u-thien', '08:00', '13:00', 'pending'),
  assignment('a-12', 's-tomorrow-support', 'u-huy', '12:00', '18:00', 'pending'),
  assignment('a-13', 's-tomorrow-training', 'u-an', '13:00', '17:00'),
  assignment('a-14', 's-tomorrow-training', 'u-long', '13:00', '15:00', 'pending'),
]
