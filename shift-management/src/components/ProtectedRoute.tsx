import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
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
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
