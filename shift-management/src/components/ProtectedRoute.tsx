import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import { ScheduleProvider } from '../data/ScheduleContext'
import { ShiftEditorProvider } from './ShiftEditorProvider'
import { AppLayout } from './AppLayout'

/**
 * Gate for every app page. Until the session check resolves nothing renders,
 * and no schedule data is fetched — `ScheduleProvider` only mounts for a
 * signed-in user.
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <ScheduleProvider>
      <ShiftEditorProvider>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </ShiftEditorProvider>
    </ScheduleProvider>
  )
}
