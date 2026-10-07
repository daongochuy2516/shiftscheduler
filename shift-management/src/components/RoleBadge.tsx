import type { Profile } from '../types'
import { useI18n } from '../i18n/I18nContext'

/**
 * Nhãn vai trò: Admin / Staff — giữ tiếng Anh ở cả hai ngôn ngữ. Dùng ở
 * header (cạnh tên người đang đăng nhập) và trang Tài khoản. `role` là `null` khi migration 005 chưa chạy —
 * chưa có vai trò thì không hiện gì.
 */
export function RoleBadge({ role }: { role: Profile['role'] }) {
  const { t } = useI18n()
  if (role === null) return null
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold ring-1 ring-inset ${
        role === 'admin'
          ? 'bg-violet-50 text-violet-700 ring-violet-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200'
      }`}
    >
      {role === 'admin' ? t('accounts.roleAdmin') : t('accounts.roleStaff')}
    </span>
  )
}
