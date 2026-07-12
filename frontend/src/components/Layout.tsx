import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '../config/modules';
import RootErrorBoundary from './RootErrorBoundary';
import PageLoader from './PageLoader';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import { useSettings } from '../stores/settingsStore';
import { useT } from '../lib/i18n';
import almanarLogo from '../assets/almanar-logo.png';
// نفس الشعار بخلفية شفافة (RGBA) — الأصل بخلفية بيضاء صلبة تظهر كمربّع في الوضع الداكن.
// نفس النسبة (2.393 مقابل 2.396) ⇒ لا فرق في الارتفاع المحسوب ولا انزياح.
import almanarLogoDark from '../assets/almanar-logo-dark.png';
import GlobalSearch from './GlobalSearch';
import Toast from './Toast';
import './layout-polish.css';
import './privacy.css';

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const { theme, toggleTheme, sidebarOpen, toggleSidebar, closeSidebar, lang, setLang, privacyMode, togglePrivacy } = useUI();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // تحميل إعدادات الشركة بعد المصادقة (لغة عرض العملة). قراءة currencyLanguage تُشترِك
  // في المخزن فتُعاد صياغة كل المبالغ فورًا عند تغيير الإعداد.
  const loadCompanySettings = useSettings((s) => s.loadCompanySettings);
  const settingsLoaded = useSettings((s) => s.loaded);
  useSettings((s) => s.currencyLanguage); // اشتراك لإعادة الرسم عند التغيير
  useEffect(() => {
    if (user && !settingsLoaded) loadCompanySettings();
  }, [user, settingsLoaded, loadCompanySettings]);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app stitch-full-theme">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <img
            src={theme === 'dark' ? almanarLogoDark : almanarLogo}
            alt="شركة المنار"
            className="brand-logo"
          />
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
                    <span className="material-symbols-outlined ic">{it.icon}</span><span className="nav-label">{t(it.label)}</span>
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
          {/* كان حقلًا بلا value ولا onChange ولا معالِج — زينة تُوهم بميزة. صار يبحث فعلًا. */}
          <GlobalSearch />
          <div className="top-actions">
            {/* Privacy Mode toggle — UI-only, hidden in print. Always exactly ONE button. */}
            <span className="pm-ui-only privacy-toggle-strip">
              {privacyMode ? (
                <button
                  type="button"
                  className="icon-btn privacy-btn privacy-btn--on"
                  onClick={togglePrivacy}
                  title={t('layout.privacy_on_title')}
                >
                  🔒
                </button>
              ) : (
                <button
                  type="button"
                  className="icon-btn privacy-btn privacy-btn--off"
                  onClick={togglePrivacy}
                  title={t('layout.privacy_rehide_title')}
                >
                  🔓
                </button>
              )}
            </span>
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
        <main className="content">
          <RootErrorBoundary scope="page" resetKey={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </RootErrorBoundary>
        </main>
      </div>
      <Toast />
    </div>
  );
}
