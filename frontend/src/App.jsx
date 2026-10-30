import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './hooks/useAuth.js'
import { AppShell } from './layout/AppShell.jsx'
import { CataloguePage, DashboardPage, LoginPage, NotificationsPage } from './pages/Workspace.jsx'
import { CirculationPage, MembersPage } from './pages/Operations.jsx'
import { FinesPage, ReservationsPage } from './pages/FinancePages.jsx'
import { MemberAccountPage } from './pages/MemberAccountPage.jsx'
import { InventoryPage } from './pages/InventoryPage.jsx'
import { AdminPage } from './pages/AdminPage.jsx'
import { ForgotPasswordPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages.jsx'
import './App.css'
import './workspace.css'

const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx').then((module) => ({ default: module.ReportsPage })))

function Protected({ children }) {
  const { user, status } = useAuth()
  if (status === 'loading') return <div className="full-loading">Connecting to LibraCore…</div>
  return user ? children : <Navigate to="/login" replace />
}

function PermissionProtected({ permission, children }) {
  const { user } = useAuth()
  return user.permissions?.includes(permission) ? children : <Navigate to="/" replace />
}

function AnyPermissionProtected({ permissions, children }) {
  const { user } = useAuth()
  return permissions.some((permission) => user.permissions?.includes(permission)) ? children : <Navigate to="/" replace />
}

function MemberOnly({ children }) {
  const { user } = useAuth()
  return user.role === 'member' ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  return <>
    <Toaster position="top-right" richColors />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<Protected><AppShell /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="catalogue" element={<CataloguePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="members" element={<PermissionProtected permission="members.read"><MembersPage /></PermissionProtected>} />
        <Route path="inventory" element={<PermissionProtected permission="books.write"><InventoryPage /></PermissionProtected>} />
        <Route path="administration" element={<AnyPermissionProtected permissions={['settings.manage', 'users.manage', 'audit.view', 'branches.manage']}><AdminPage /></AnyPermissionProtected>} />
        <Route path="circulation" element={<PermissionProtected permission="circulation.manage"><CirculationPage /></PermissionProtected>} />
        <Route path="reports" element={<PermissionProtected permission="reports.view"><Suspense fallback={<div className="loading-state">Loading reports…</div>}><ReportsPage /></Suspense></PermissionProtected>} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="account" element={<MemberOnly><MemberAccountPage /></MemberOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>
}
