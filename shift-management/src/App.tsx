import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { TimelinePage } from './pages/TimelinePage'
import { AllShiftsPage } from './pages/AllShiftsPage'
import { MyShiftsPage } from './pages/MyShiftsPage'
import { PendingPage } from './pages/PendingPage'

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Everything below requires a session. */}
            <Route element={<ProtectedRoute />}>
              <Route index element={<TimelinePage />} />
              <Route path="shifts" element={<AllShiftsPage />} />
              <Route path="my-shifts" element={<MyShiftsPage />} />
              <Route path="pending" element={<PendingPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  )
}
