import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'
import type { Account } from '../types'
import { fromDateKey, toDateKey } from './time'

/**
 * Tình trạng làm việc, bản phía client của `is_active_member()` trong
 * `supabase/016_employment.sql`. Database mới là nơi chặn thật (policy
 * restrictive trên mọi bảng); ở đây để giao diện không mở những màn hình mà
 * máy chủ sẽ trả rỗng, và để bản mock hành xử giống.
 *
 * Database so theo giờ Việt Nam, client theo giờ máy — người dùng ở Việt Nam
 * nên hai bên trùng nhau.
 */

/** Người mới: vào chưa tới ngần này ngày. */
export const NEW_HIRE_DAYS = 30

export function todayKey(): string {
  return toDateKey(new Date())
}

/**
 * Đã nghỉ việc chưa: có ngày nghỉ và đã tới ngày đó. Ngày nghỉ ở tương lai
 * (báo trước) thì vẫn đang làm. `left_on` vắng mặt (016 chưa chạy) = đang làm.
 */
export function hasLeft(
  account: Pick<Account, 'left_on'> | null,
  today: string = todayKey(),
): boolean {
  return !!account?.left_on && account.left_on <= today
}

/**
 * Bản sao `is_admin()` của 016: admin đã nghỉ không còn là admin. `role` null
 * (005 chưa chạy) thì không có admin nào.
 */
export function isActiveAdmin(account: Pick<Account, 'role' | 'left_on'> | null): boolean {
  return account?.role === 'admin' && !hasLeft(account)
}

export interface Tenure {
  years: number
  months: number
  /** Chỉ dùng khi chưa đủ một tháng. */
  days: number
}

/**
 * Thời gian làm việc từ `from` tới `to` (hôm nay, hoặc ngày nghỉ). `null` khi
 * `to` trước `from` — ngày vào ở tương lai.
 */
export function tenure(from: string, to: string): Tenure | null {
  const start = fromDateKey(from)
  const end = fromDateKey(to)
  const days = differenceInCalendarDays(end, start)
  if (days < 0) return null
  let months = differenceInCalendarMonths(end, start)
  // differenceInCalendarMonths chỉ nhìn tháng: 31/1 → 1/2 là "1 tháng".
  if (end.getDate() < start.getDate()) months -= 1
  months = Math.max(0, months)
  return { years: Math.floor(months / 12), months: months % 12, days }
}
