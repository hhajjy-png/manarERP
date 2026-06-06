import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NAV } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import './layout-polish.css';

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggleTheme, sidebarOpen, toggleSidebar, closeSidebar } = useUI();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="logo">م</div>
          <div><h1>شركة المنار</h1><span>إدارة مقاولات الطرق</span></div>
        </div>
        <nav className="nav">
          {NAV.map((section) => {
            const items = section.items.filter((it) => !it.permission || hasPermission(it.permission));
            if (items.length === 0) return null;
            return (
              <div key={section.group || 'main'}>
                {section.group && <div className="group">{section.group}</div>}
                {items.map((it) => (
                  <NavLink
                    key={it.key}
                    to={it.key === 'dashboard' ? '/' : `/${it.key}`}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                    onClick={closeSidebar}
                  >
                    <span className="ic">{it.icon}</span> {it.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={toggleSidebar} aria-label="القائمة">☰</button>
          <div className="search"><input placeholder="بحث في النظام…" /></div>
          <div className="top-actions">
            <button className="icon-btn" onClick={toggleTheme} title="تغيير المظهر">{theme === 'dark' ? '☀️' : '🌙'}</button>
            <div className="user" onClick={onLogout} title="تسجيل الخروج">
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
