import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { IS_MOCK_BACKEND } from '../data'
import { resetOfflineData } from '../data/offlineCache'
import {
  NotificationProvider,
  clearStoredNotifications,
} from '../notifications/NotificationContext'
import { APP_NAME } from '../lib/brand'
import { ProfilePage } from '../pages/ProfilePage'
import { ChangePasswordModal } from './ChangePasswordModal'
import { OfflineBanner } from './OfflineBanner'
import { useTwoStep } from './useTwoStep'

/**
 * Toàn bộ app của người đã nghỉ việc (016): trang Hồ sơ, Đổi mật khẩu (tài
 * khoản Auth của chính họ, không đụng dữ liệu app) và Đăng xuất.
 * Không có ScheduleProvider — database trả rỗng mọi bảng cho họ, tải lịch chỉ
 * ra màn hình trống và lỗi ghi. Header giữ ba điều kiện của thanh trạng thái
 * iOS như AppLayout: sticky top-0, rộng hết màn hình, nền đặc.
 */
export function FormerStaffLayout() {
  const { user, signOut } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const userId = user?.id ?? null
  const [signingOut, setSigningOut] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  // Hai lần bấm, như nút Đăng xuất ở menu chính.
  const signOutStep = useTwoStep(async () => {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  })

  // Lịch lưu offline (IndexedDB) và thông báo (localStorage) là dữ liệu từ
  // lúc còn làm: không hiện ở đây, nhưng mở DevTools vẫn đọc được — xoá luôn.
  useEffect(() => {
    void resetOfflineData()
    if (userId) clearStoredNotifications(userId)
  }, [userId])

  if (!userId) return null

  return (
    // Chỉ để báo kết quả đổi mật khẩu; không đọc lại thông báo cũ (ephemeral).
    <NotificationProvider key={userId} userId={userId} ephemeral>
      <div className="flex min-h-dvh flex-col">
        {/* Không gắn .app-header: lớp đó lùi lề phải theo thanh cuộn của
            #app-scroll, còn ở đây cả trang cuộn. */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div
            className="safe-x mx-auto flex max-w-[1600px] items-center justify-between gap-4 py-3"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <CalendarClock className="h-4.5 w-4.5" />
              </span>
              <span className="truncate text-sm font-medium text-slate-900">
                {APP_NAME}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {/* Điện thoại chỉ còn biểu tượng: header không đủ chỗ cho tên
                  app và hai nút có chữ. Đăng xuất giữ chữ vì lần bấm thứ hai
                  cần câu "Bấm lần nữa…". */}
              <button
                type="button"
                onClick={() => setChangingPassword(true)}
                aria-label={t('pwd.title')}
                data-tooltip={t('pwd.title')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:min-h-0 sm:min-w-0 sm:py-1.5"
              >
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">{t('pwd.title')}</span>
              </button>
              <button
                type="button"
                onClick={signOutStep.press}
                disabled={signingOut}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:opacity-50 sm:min-h-0 sm:py-1.5 ${
                  signOutStep.armed
                    ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
                    : 'text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                }`}
              >
                <LogOut className="h-4 w-4" />
                {signOutStep.armed ? t('auth.signOutAgain') : t('auth.signOut')}
              </button>
            </div>
          </div>
          {IS_MOCK_BACKEND && (
            <p className="safe-x bg-amber-50 py-1 text-center text-[11px] font-medium text-amber-800">
              {t('auth.mockBanner')}
            </p>
          )}
          <OfflineBanner />
        </header>

        <main className="safe-x mx-auto w-full max-w-[1600px] flex-1 pt-4 pb-8 sm:pt-5">
          <ProfilePage />
        </main>

        {changingPassword && (
          <ChangePasswordModal onClose={() => setChangingPassword(false)} />
        )}
      </div>
    </NotificationProvider>
  )
}
