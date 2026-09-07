import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './ui';

function NavIcon({ name }: { name: 'overview' | 'students' | 'retention' | 'about' }) {
  const paths = {
    overview: (
      <>
        <rect x="3" y="10" width="4" height="8" rx="1" />
        <rect x="10" y="6" width="4" height="12" rx="1" />
        <rect x="17" y="3" width="4" height="15" rx="1" />
      </>
    ),
    students: (
      <>
        <circle cx="9" cy="8" r="3.2" fill="none" strokeWidth="1.8" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" fill="none" strokeWidth="1.8" />
        <path d="M15.5 5.6a3.2 3.2 0 1 1 1.4 6.1M16.6 14.2c2.3.5 3.9 2.2 3.9 4.8" fill="none" strokeWidth="1.8" />
      </>
    ),
    retention: (
      <>
        <path d="M4 5v11a3 3 0 0 0 3 3h13" fill="none" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7.5 13.5 11 10l3 3 5.5-5.5" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    about: (
      <>
        <circle cx="12" cy="12" r="8.5" fill="none" strokeWidth="1.8" />
        <path d="M12 11v5.5" fill="none" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="7.8" r="1.05" strokeWidth="0" />
      </>
    ),
  };
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" stroke="currentColor" fill="currentColor" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="side__brand">
          <Logo size={26} />
          <span>GymVis</span>
        </div>
        <nav className="side__nav">
          <NavLink to="/" end className={({ isActive }) => `side__link${isActive ? ' is-active' : ''}`}>
            <NavIcon name="overview" />
            Visão geral
          </NavLink>
          <NavLink to="/alunos" className={({ isActive }) => `side__link${isActive ? ' is-active' : ''}`}>
            <NavIcon name="students" />
            Alunos
          </NavLink>
          <NavLink to="/retencao" className={({ isActive }) => `side__link${isActive ? ' is-active' : ''}`}>
            <NavIcon name="retention" />
            Retenção
          </NavLink>
          <NavLink to="/sobre" className={({ isActive }) => `side__link${isActive ? ' is-active' : ''}`}>
            <NavIcon name="about" />
            Sobre
          </NavLink>
        </nav>
        <div className="side__foot">
          <div className="side__academy">{user?.academyNome}</div>
          <div className="side__user">{user?.email}</div>
          <button type="button" className="btn btn--sm side__logout" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="main__inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
