import type { Account } from '../types'
import { useI18n } from '../i18n/I18nContext'

/**
 * Nhãn vai trò: Admin / Staff — giữ tiếng Anh ở cả hai ngôn ngữ. Dùng ở bảng avatar (mobile),
 * header (cạnh tên người đang đăng nhập) và trang Tài khoản. `role` là `null` khi migration 005 chưa chạy —
 * chưa có vai trò thì không hiện gì.
 */
export function RoleBadge({ role }: { role: Account['role'] }) {
  const { t } = useI18n()
  if (role === null) return null
  return (
    <span
      // Nhãn chữ trầm, không tô màu: vai trò là thông tin phụ cạnh tên, màu
      // nhấn để dành cho thao tác chính và lựa chọn. Admin đậm chữ hơn một bậc.
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium ring-1 ring-inset ${
        role === 'admin'
          ? 'bg-slate-100 text-slate-700 ring-slate-200'
          : 'text-slate-500 ring-slate-200'
      }`}
    >
      {role === 'admin' ? t('accounts.roleAdmin') : t('accounts.roleStaff')}
    </span>
  )
}
