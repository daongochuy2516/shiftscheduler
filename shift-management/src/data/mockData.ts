import { addDays } from 'date-fns'
import type {
  Account,
  Location,
  Shift,
  ShiftAssignment,
  ShiftTemplate,
} from '../types'
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
export const MOCK_PROFILES: Account[] = [
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
  template_id: string | null = null,
): Shift {
  return {
    id,
    title,
    date,
    start_time,
    end_time,
    note,
    created_by: MOCK_CURRENT_USER_ID,
    template_id,
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
  location_ids: string[] = [],
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
    // Cùng dạng trigger của 012 lưu: không trùng, sắp theo id.
    location_ids: [...location_ids].sort(),
    created_at: ts,
    updated_at: ts,
  }
}

/** Hai nơi trực như dữ liệu thật sau 013. */
export const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc-fanpage',
    name: 'Fanpage',
    short_name: 'Page',
    color: 'indigo',
    sort_order: 0,
    is_active: true,
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
  {
    id: 'loc-discord',
    name: 'Discord',
    short_name: 'Dis',
    color: 'teal',
    sort_order: 1,
    is_active: true,
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  },
]

const FANPAGE = 'loc-fanpage'
const DISCORD = 'loc-discord'

function template(
  id: string,
  title: string,
  start_time: string,
  end_time: string,
  color: string,
): ShiftTemplate {
  return {
    id,
    title,
    start_time,
    end_time,
    note: null,
    // Rỗng = lặp mọi ngày.
    weekdays: [],
    is_active: true,
    color,
    created_by: MOCK_CURRENT_USER_ID,
    created_at: ts,
    updated_at: ts,
  }
}

/**
 * Ba khung giờ như dữ liệu thật sau 013; nơi trực chọn lúc nhận ca, không
 * nằm trong ca mẫu.
 */
export const MOCK_TEMPLATES: ShiftTemplate[] = [
  template('t-sang', 'Sáng', '08:00', '13:00', 'amber'),
  template('t-chieu', 'Chiều', '13:00', '18:00', 'sky'),
  template('t-toi', 'Tối', '18:00', '23:00', 'violet'),
]

export const MOCK_SHIFTS: Shift[] = [
  shift(
    's-sang-today',
    'Sáng',
    TODAY,
    '08:00',
    '13:00',
    'Bàn giao trong kênh trước khi rời ca.',
    't-sang',
  ),
  shift('s-chieu-today', 'Chiều', TODAY, '13:00', '18:00', null, 't-chieu'),
  shift('s-toi-today', 'Tối', TODAY, '18:00', '23:00', null, 't-toi'),
  shift('s-meeting-today', 'Họp đầu tuần', TODAY, '11:00', '12:00'),
  shift('s-sang-yesterday', 'Sáng', YESTERDAY, '08:00', '13:00', null, 't-sang'),
  shift('s-toi-yesterday', 'Tối', YESTERDAY, '18:00', '23:00', null, 't-toi'),
  shift('s-sang-tomorrow', 'Sáng', TOMORROW, '08:00', '13:00', null, 't-sang'),
  shift(
    's-training-tomorrow',
    'Đào tạo nhân viên mới',
    TOMORROW,
    '13:00',
    '17:00',
    'Phòng 2B.',
  ),
]

export const MOCK_ASSIGNMENTS: ShiftAssignment[] = [
  // Sáng — ba người, giờ khác nhau; Thien trực cả hai nơi cùng lúc.
  assignment('a-1', 's-sang-today', 'u-huy', '08:00', '13:00', 'confirmed', [FANPAGE]),
  assignment('a-2', 's-sang-today', 'u-thien', '08:00', '13:00', 'confirmed', [FANPAGE, DISCORD]),
  assignment('a-3', 's-sang-today', 'u-an', '10:00', '13:00', 'pending', [DISCORD]),

  assignment('a-4', 's-chieu-today', 'u-mai', '13:00', '18:00', 'pending', [FANPAGE]),
  assignment('a-5', 's-chieu-today', 'u-huy', '13:00', '15:00', 'pending', [DISCORD]),

  assignment('a-6', 's-toi-today', 'u-long', '18:00', '23:00', 'confirmed', [FANPAGE, DISCORD]),
  assignment('a-7', 's-toi-today', 'u-ngoc', '19:00', '23:00', 'pending', [DISCORD]),

  // Trùng giờ với ca Sáng của Huy — để thử phần xếp chồng. Ca không phải
  // trực nên không có nơi trực.
  assignment('a-8', 's-meeting-today', 'u-huy', '11:00', '12:00', 'pending'),
  assignment('a-9', 's-meeting-today', 'u-mai', '11:00', '12:00'),

  assignment('a-10', 's-sang-yesterday', 'u-huy', '08:00', '13:00', 'confirmed', [FANPAGE]),
  assignment('a-11', 's-sang-yesterday', 'u-ngoc', '08:00', '13:00', 'confirmed', [DISCORD]),
  assignment('a-12', 's-toi-yesterday', 'u-thien', '18:00', '23:00', 'confirmed', [FANPAGE, DISCORD]),

  assignment('a-13', 's-sang-tomorrow', 'u-thien', '08:00', '13:00', 'pending', [FANPAGE]),
  assignment('a-14', 's-sang-tomorrow', 'u-huy', '08:00', '13:00', 'pending', [DISCORD]),
  assignment('a-15', 's-training-tomorrow', 'u-an', '13:00', '17:00'),
  assignment('a-16', 's-training-tomorrow', 'u-long', '13:00', '15:00', 'pending'),
]
