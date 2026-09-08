import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, PublicOnly, RequireAuth, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { PageLoading } from './components/ui';
import { LandingPage } from './pages/LandingPage';
import { AboutPage } from './pages/AboutPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancePage } from './pages/FinancePage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RetentionPage } from './pages/RetentionPage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { StudentsPage } from './pages/StudentsPage';

/**
 * A raiz serve a vitrine para quem chega de fora e o painel para quem já
 * entrou — depois do login a apresentação nunca mais aparece.
 */
function HomeGate() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (user) return <Navigate to="/painel" replace />;
  return <LandingPage />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomeGate />} />
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/painel" element={<DashboardPage />} />
              <Route path="/alunos" element={<StudentsPage />} />
              <Route path="/alunos/:id" element={<StudentProfilePage />} />
              <Route path="/rendimentos" element={<FinancePage />} />
              <Route path="/retencao" element={<RetentionPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/sobre" element={<AboutPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
