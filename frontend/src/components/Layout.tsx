import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NAV } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import { useT } from '../lib/i18n';
import almanarLogo from '../assets/almanar-logo.png';
import './layout-polish.css';

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggleTheme, sidebarOpen, toggleSidebar, closeSidebar, lang, setLang } = useUI();
  const { t } = useT();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app stitch-full-theme">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src={almanarLogo} alt="شركة المنار" className="brand-logo" />
        </div>
        <nav className="nav">
          {NAV.map((section) => {
            const items = section.items.filter((it) => !it.permission || hasPermission(it.permission));
            if (items.length === 0) return null;
            return (
              <div key={section.group || 'main'}>
                {section.group && <div className="group">{t(section.group)}</div>}
                {items.map((it) => (
                  <NavLink
                    key={it.key}
                    to={it.key === 'dashboard' ? '/' : `/${it.key}`}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                    onClick={closeSidebar}
                  >
                    <span className="material-symbols-outlined ic">{it.icon}</span> {t(it.label)}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={toggleSidebar} aria-label={t('layout.menu')}>☰</button>
          <div className="search"><input placeholder={t('layout.search')} /></div>
          <div className="top-actions">
            <button className="icon-btn" onClick={toggleTheme} title={t('layout.toggle_theme')}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button
              className="icon-btn"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={t('layout.toggle_lang')}
              style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <div className="user" onClick={onLogout} title={t('layout.logout')}>
              <div className="user-info">
                <strong>{user?.fullName ?? 'مستخدم'}</strong>
                <small>{user?.role.displayName}</small>
              </div>
              <div className="avatar">{(user?.fullName ?? 'م').charAt(0)}</div>
            </div>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
