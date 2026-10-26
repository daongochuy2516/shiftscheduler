import type { Account } from '../types'
import { canManageTemplates, isRestricted } from './attendance'

/**
 * Chế độ thử luật database: `localStorage.bypassuirestrict = 'true'` thì giao
 * diện mở mọi khoá như admin, dù vai trò là staff — để bấm thẳng những thao
 * tác mà RLS / trigger phải từ chối và xem câu từ chối qua thông báo.
 *
 * Chỉ giao diện bỏ khoá. Database (và bản mock, vốn đóng vai database) vẫn xét
 * vai trò thật, nên bản mock dùng thẳng `isRestricted`, không dùng file này.
 * Đọc một lần lúc tải trang: đổi cờ thì tải lại.
 */
export const UI_BYPASS_KEY = 'bypassuirestrict'

export const UI_BYPASS: boolean = (() => {
  try {
    return localStorage.getItem(UI_BYPASS_KEY) === 'true'
  } catch {
    return false
  }
})()

/** `isRestricted` cho giao diện: cờ bật thì không khoá gì. */
export function uiRestricted(user: Pick<Account, 'role'> | null): boolean {
  return !UI_BYPASS && isRestricted(user)
}

/** `canManageTemplates` cho giao diện. */
export function uiCanManageTemplates(user: Pick<Account, 'role'> | null): boolean {
  return UI_BYPASS || canManageTemplates(user)
}

/**
 * Hiện lối vào chỉ dành cho admin (ô Tài khoản trong menu, mục Hướng dẫn
 * admin…). Dữ liệu trang Tài khoản thì máy chủ mới quyết định (`useAccounts`).
 */
export function uiIsAdmin(user: Pick<Account, 'role'> | null): boolean {
  return UI_BYPASS || user?.role === 'admin'
}
