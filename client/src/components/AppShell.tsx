import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './ui';

type IconName = 'overview' | 'students' | 'finance' | 'retention' | 'settings' | 'about';

function NavIcon({ name }: { name: IconName }) {
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
    finance: (
      <>
        <path d="M12 3v18" fill="none" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3.1" fill="none" strokeWidth="1.8" />
        <path
          d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.7 6.7 5 5M19 19l-1.7-1.7M6.7 17.3 5 19M19 5l-1.7 1.7"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
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

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Separado do bloco principal por uma linha, no menu lateral. */
  secondary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Visão geral', icon: 'overview', end: true },
  { to: '/alunos', label: 'Alunos', icon: 'students' },
  { to: '/rendimentos', label: 'Rendimentos', icon: 'finance' },
  { to: '/retencao', label: 'Retenção', icon: 'retention' },
  { to: '/configuracoes', label: 'Configurações', icon: 'settings', secondary: true },
  { to: '/sobre', label: 'Sobre', icon: 'about' },
];

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
        {/* O nome da academia fica acima do menu: o painel é da operação do
            dono, e o GymVis é só o instrumento que ele usa. */}
        <div className="side__academy">
          <div className="side__academy-name">{user?.academyNome}</div>
          <div className="side__user">{user?.email}</div>
        </div>
        <nav className="side__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `side__link${isActive ? ' is-active' : ''}${item.secondary ? ' side__link--secondary' : ''}`
              }
            >
              <NavIcon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side__foot">
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
