import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { ScheduleProvider } from '../data/ScheduleContext'
import { NotificationProvider } from '../notifications/NotificationContext'
import { TourProvider } from '../help/TourProvider'
import type { Account } from '../types'
import { hasLeft, todayKey } from '../lib/employment'
import { FormerStaffLayout } from './FormerStaffLayout'
import { ShiftEditorProvider } from './ShiftEditorProvider'
import { AppLayout } from './AppLayout'

/**
 * Gate for every app page. Until the session check resolves nothing renders,
 * and no schedule data is fetched — `ScheduleProvider` only mounts for a
 * signed-in user.
 */
/**
 * Đã nghỉ việc chưa, tính lại khi qua ngày. Ngày nghỉ đặt trước (ở tương lai)
 * thì hồ sơ không đổi gì lúc tới ngày, nên phải tự nhìn đồng hồ: tab mở qua
 * nửa đêm vẫn khoá đúng lúc. Mỗi phút so ngày một lần — state chỉ đổi (và vẽ
 * lại) đúng lúc sang ngày mới; đồng hồ hẹn giờ không chạy khi máy ngủ, còn
 * vòng này bắt kịp ngay khi máy thức.
 */
function useHasLeft(user: Account | null): boolean {
  const leftOn = user?.left_on ?? null
  const [, setToday] = useState(todayKey)
  useEffect(() => {
    if (!leftOn) return
    const id = window.setInterval(() => setToday(todayKey()), 60_000)
    return () => window.clearInterval(id)
  }, [leftOn])
  return hasLeft(user, todayKey())
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const left = useHasLeft(user)

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex items-center gap-2.5 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="text-sm font-medium">{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  if (!user) {
    // Cả query lẫn hash: link gửi nhau (ca đang mở, bộ lọc) phải còn nguyên
    // sau khi đăng nhập xong.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    )
  }

  // Đã nghỉ việc (016): chỉ còn trang Hồ sơ. Không mount ScheduleProvider —
  // database trả rỗng mọi bảng cho người này. URL đổi về /me để luôn trỏ
  // đúng thứ đang hiện.
  if (left) {
    if (location.pathname !== '/me') return <Navigate to="/me" replace />
    return <FormerStaffLayout />
  }

  // `key`: đổi tài khoản là mount lại, đọc đúng ngăn thông báo của người đó.
  return (
    <NotificationProvider key={user.id} userId={user.id}>
      <ScheduleProvider>
        <ShiftEditorProvider>
          <TourProvider>
            <AppLayout>
              <Outlet />
            </AppLayout>
          </TourProvider>
        </ShiftEditorProvider>
      </ScheduleProvider>
    </NotificationProvider>
  )
}
