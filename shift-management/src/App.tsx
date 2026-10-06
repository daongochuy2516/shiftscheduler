import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { I18nProvider } from './i18n/I18nContext'
import { ThemeProvider } from './theme/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { TimelinePage } from './pages/TimelinePage'
import { AllShiftsPage } from './pages/AllShiftsPage'
import { SummaryPage } from './pages/SummaryPage'
import { MyShiftsPage } from './pages/MyShiftsPage'
import { PendingPage } from './pages/PendingPage'
import { ActionLogPage } from './pages/ActionLogPage'
import { StatusPage } from './pages/StatusPage'
import { AccountsPage } from './pages/AccountsPage'

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Everything below requires a session. */}
              <Route element={<ProtectedRoute />}>
                <Route index element={<TimelinePage />} />
                <Route path="shifts" element={<AllShiftsPage />} />
                <Route path="summary" element={<SummaryPage />} />
                <Route path="my-shifts" element={<MyShiftsPage />} />
                <Route path="pending" element={<PendingPage />} />
                <Route path="logs" element={<ActionLogPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="accounts" element={<AccountsPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
