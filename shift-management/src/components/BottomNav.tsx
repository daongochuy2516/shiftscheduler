import { NavLink } from 'react-router-dom'
import { CalendarDays, Clock3, LayoutList, User } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

interface Destination {
  to: string
  label: TranslationKey
  icon: typeof CalendarDays
  end: boolean
}

/**
 * Bốn đích đến chính. Nhật ký cố ý không có ở đây: nó là thứ tra cứu thỉnh
 * thoảng mới mở, thuộc về sheet tài khoản chứ không phải thanh chính.
 */
const DESTINATIONS: Destination[] = [
  { to: '/', label: 'nav.timeline', icon: CalendarDays, end: true },
  { to: '/shifts', label: 'nav.allShifts', icon: LayoutList, end: false },
  { to: '/my-shifts', label: 'nav.myShifts', icon: User, end: false },
  { to: '/pending', label: 'nav.pending', icon: Clock3, end: false },
]

/** Chỉ hiện dưới 640px; từ đó trở lên dùng thanh điều hướng trên như cũ. */
export function BottomNav({ pendingCount }: { pendingCount: number }) {
  const { t } = useI18n()

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex">
        {DESTINATIONS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                // min-h-14 giữ vùng chạm trên 44px kể cả khi nhãn xuống dòng.
                `relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Đích đang mở được đánh dấu bằng cả gạch trên, màu và độ
                      đậm — không chỉ bằng màu, để người khó phân biệt màu vẫn
                      nhận ra. */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-3 top-0 h-0.5 rounded-full transition ${
                      isActive ? 'bg-indigo-600' : 'bg-transparent'
                    }`}
                  />
                  <span className="relative">
                    <Icon className="h-5 w-5" />
                    {to === '/pending' && pendingCount > 0 && (
                      <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-semibold text-white">
                        {pendingCount > 9 ? '9+' : pendingCount}
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-[11px] leading-tight ${
                      isActive ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {t(label)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
