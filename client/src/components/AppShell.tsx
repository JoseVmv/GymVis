import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from './ui';

/** Acima daqui o menu lateral é fixo e a gaveta não existe. */
const DESKTOP = '(min-width: 861px)';

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
  { to: '/painel', label: 'Visão geral', icon: 'overview', end: true },
  { to: '/alunos', label: 'Alunos', icon: 'students' },
  { to: '/rendimentos', label: 'Rendimentos', icon: 'finance' },
  { to: '/retencao', label: 'Retenção', icon: 'retention' },
  { to: '/configuracoes', label: 'Configurações', icon: 'settings', secondary: true },
  { to: '/sobre', label: 'Sobre', icon: 'about' },
];

/** Três risquinhos que viram X quando a gaveta está aberta. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`burger${open ? ' is-open' : ''}`}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
      focusable="false"
    >
      <line className="burger__top" x1="3.5" y1="7" x2="20.5" y2="7" />
      <line className="burger__mid" x1="3.5" y1="12" x2="20.5" y2="12" />
      <line className="burger__bot" x1="3.5" y1="17" x2="20.5" y2="17" />
    </svg>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Escolher um destino é o fim da tarefa da gaveta: ela sai de cena sozinha.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // No desktop a gaveta não existe; se a janela cresce com ela aberta, o
  // estado (e a trava de rolagem) precisa ser desfeito.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    // Com a gaveta aberta, rolar a página atrás só desorienta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      {/* Barra de topo só do celular: abre a gaveta e mantém a marca à vista. */}
      <header className="topbar">
        <button
          type="button"
          className="topbar__menu"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="menu-lateral"
        >
          <MenuIcon open={menuOpen} />
        </button>
        <div className="topbar__brand">
          <Logo size={22} idSuffix="topo" />
          <span>GymVis</span>
        </div>
      </header>

      {/* Escurece e engole os cliques da página coberta pela gaveta. */}
      <div
        className={`scrim${menuOpen ? ' is-open' : ''}`}
        onClick={closeMenu}
        aria-hidden
      />

      <aside id="menu-lateral" className={`side${menuOpen ? ' is-open' : ''}`}>
        <div className="side__brand">
          <Logo size={26} />
          <span>GymVis</span>
          {/* Tocar fora fecha, mas nem todo mundo sabe disso. */}
          <button
            type="button"
            className="side__close"
            onClick={closeMenu}
            aria-label="Fechar menu"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
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
