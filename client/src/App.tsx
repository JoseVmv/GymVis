import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, PublicOnly, RequireAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { AboutPage } from './pages/AboutPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { RetentionPage } from './pages/RetentionPage';
import { StudentProfilePage } from './pages/StudentProfilePage';
import { StudentsPage } from './pages/StudentsPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="/alunos" element={<StudentsPage />} />
              <Route path="/alunos/:id" element={<StudentProfilePage />} />
              <Route path="/retencao" element={<RetentionPage />} />
              <Route path="/sobre" element={<AboutPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
