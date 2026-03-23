import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import AppLayout from '../components/layout/AppLayout';

import LoginPage           from '../pages/auth/LoginPage';
import ChangePasswordPage  from '../pages/auth/ChangePasswordPage';
import DashboardPage       from '../pages/dashboard/DashboardPage';
import PensionerListPage   from '../pages/pensioners/PensionerListPage';
import PensionerFormPage   from '../pages/pensioners/PensionerFormPage';
import PensionerDetailPage from '../pages/pensioners/PensionerDetailPage';
import PaymentRunListPage   from '../pages/payments/PaymentRunListPage';
import PaymentRunDetailPage from '../pages/payments/PaymentRunDetailPage';
import GratuityListPage    from '../pages/gratuity/GratuityListPage';
import GratuityFormPage    from '../pages/gratuity/GratuityFormPage';
import ArrearListPage      from '../pages/arrears/ArrearListPage';
import ArrearFormPage      from '../pages/arrears/ArrearFormPage';
import DeceasedPage        from '../pages/deceased/DeceasedPage';
import ReportsPage         from '../pages/reports/ReportsPage';
import AdminPage           from '../pages/admin/AdminPage';
import SettingsPage        from '../pages/settings/SettingsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
}
function Placeholder({ title }: { title: string }) {
  return (
    <div className="card text-center py-20">
      <div className="text-5xl mb-4">🚧</div>
      <h2 className="font-display text-2xl text-navy mb-2">{title}</h2>
      <p className="text-slate-400 text-sm">Scaffolded page — connect to API to complete.</p>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/login',           element: <LoginPage /> },
  { path: '/change-password', element: <RequireAuth><ChangePasswordPage /></RequireAuth> },
  {
    path: '/',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true,                  element: <DashboardPage /> },
      { path: 'pensioners',           element: <PensionerListPage /> },
      { path: 'pensioners/new',       element: <PensionerFormPage /> },
      { path: 'pensioners/:id',       element: <PensionerDetailPage /> },
      { path: 'pensioners/:id/edit',  element: <PensionerFormPage /> },
      { path: 'payments',             element: <PaymentRunListPage /> },
      { path: 'payments/:id',         element: <PaymentRunDetailPage /> },
      { path: 'gratuity',             element: <GratuityListPage /> },
      { path: 'gratuity/new',         element: <GratuityFormPage /> },
      { path: 'gratuity/:id',         element: <Placeholder title="Gratuity Detail" /> },
      { path: 'arrears',              element: <ArrearListPage /> },
      { path: 'arrears/new',          element: <ArrearFormPage /> },
      { path: 'deceased',             element: <DeceasedPage /> },
      { path: 'reports',              element: <ReportsPage /> },
      { path: 'admin',                element: <RequireAdmin><AdminPage /></RequireAdmin> },
      { path: 'settings',             element: <RequireAdmin><SettingsPage /></RequireAdmin> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
