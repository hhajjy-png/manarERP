import { Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAV } from '../config/modules';
import { visibleNav } from '../config/navVisibility';
import RootErrorBoundary from './RootErrorBoundary';
import PageLoader from './PageLoader';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import { useSettings } from '../stores/settingsStore';
import { hydrateSyncedPreferences } from '../lib/syncedPreferences';
import { useT } from '../lib/i18n';
import almanarLogo from '../assets/almanar-logo.png';
// نفس الشعار بخلفية شفافة (RGBA) — الأصل بخلفية بيضاء صلبة تظهر كمربّع في الوضع الداكن.
// نفس النسبة (2.393 مقابل 2.396) ⇒ لا فرق في الارتفاع المحسوب ولا انزياح.
import almanarLogoDark from '../assets/almanar-logo-dark.png';
import GlobalSearch from './GlobalSearch';
import Toast from './Toast';
import './layout-polish.css';
import './sidebar-collapse.css';
import './privacy.css';

/** النافذة التي تحت عرضها لا تعود القائمة الموسّعة تكسب المستخدم شيئًا. */
const NARROW_QUERY = '(max-width: 1200px)';

export default function Layout() {
  const { user, logout, hasPermission } = useAuth();
  const {
    theme, toggleTheme, sidebarOpen, toggleSidebar, closeSidebar, lang, setLang,
    privacyMode, togglePrivacy, sidebarMode, sidebarNarrow, toggleSidebarMode, setSidebarNarrow,
    topbarRefreshHandler, topbarRefreshBusy, hiddenNavKeys,
  } = useUI();
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();

  // الوضع الفعلي: اختيار المستخدم، ما لم تفرض نافذة ضيّقة الطيّ. الاختيار المحفوظ
  // لا يُكتب فوقه أبدًا — يعود كما هو بمجرّد اتّساع النافذة.
  const collapsed = sidebarNarrow || sidebarMode === 'collapsed';

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setSidebarNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [setSidebarNarrow]);

  /**
   * تلميح اسم العنصر — يظهر في الوضع المطوي وحده.
   *
   * يُصيَّر خارج `.nav` بموضع ثابت، لأن `.nav` تُمرَّر رأسيًا فتقصّ ما يخرج منها
   * أفقيًا. لا مكتبة جديدة، ولا `title` أصلي بطيء الظهور، ولا تغيير في التخطيط:
   * الاسم نفسه يبقى في الـ DOM لقارئات الشاشة، والتلميح `aria-hidden` — تكرارٌ
   * بصري لا وسيلة تنقّل وحيدة.
   */
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const showTip = useCallback((label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2 - 14 });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);
  useEffect(() => { setTip(null); }, [location.pathname, collapsed]);

  // تحميل إعدادات الشركة بعد المصادقة (لغة عرض العملة). قراءة currencyLanguage تُشترِك
  // في المخزن فتُعاد صياغة كل المبالغ فورًا عند تغيير الإعداد.
  const loadCompanySettings = useSettings((s) => s.loadCompanySettings);
  const settingsLoaded = useSettings((s) => s.loaded);
  useSettings((s) => s.currencyLanguage); // اشتراك لإعادة الرسم عند التغيير
  useEffect(() => {
    if (user && !settingsLoaded) loadCompanySettings();
  }, [user, settingsLoaded, loadCompanySettings]);

  // مزامنة تفضيلات المستخدم مع قاعدة البيانات بعد المصادقة
  // (Zero Data Loss Certification Pack v1).
  //
  // هذه هي اللحظة التي تعود فيها تفضيلات المستخدم على **جهاز جديد**: القيم وصلت
  // داخل `manar.db` مع النسخة الاحتياطية أو مزامنة Google Drive، وهنا تُنزَّل إلى
  // المخبأ المحلي الذي تقرأ منه الشاشات بشكل متزامن. وفي أول تشغيل بعد الترقية
  // تُرفع التفضيلات المتراكمة محليًا إلى القاعدة — هجرة صامتة بلا أي إجراء من
  // المستخدم. لا يرمي أبدًا: تعذّر الاتصال يعني بقاء التفضيلات محلية هذه الجلسة،
  // وهو سلوك ما قبل الحزمة بالضبط.
  const preferencesUserId = user?.id;
  useEffect(() => {
    if (preferencesUserId === undefined) return;
    void hydrateSyncedPreferences();
  }, [preferencesUserId]);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app stitch-full-theme">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} onMouseLeave={hideTip}>
        <div className="brand">
          <img
            src={theme === 'dark' ? almanarLogoDark : almanarLogo}
            alt={t('layout.brand_name')}
            className="brand-logo"
          />
        </div>
        <nav className="nav">
          {/*
            الصلاحيات ثمّ تفضيل الإظهار — بنفس ترتيب `NAV` الأصلي، ومجموعة بلا عنصر
            ظاهر لا تُصيَّر أصلًا (لا عنوان مجموعة فارغ).
          */}
          {visibleNav(NAV, hasPermission, hiddenNavKeys).map((section) => {
            return (
              <div key={section.group || 'main'}>
                {section.group && <div className="group">{t(section.group)}</div>}
                {section.items.map((it) => (
                  <NavLink
                    key={it.key}
                    to={it.key === 'dashboard' ? '/' : `/${it.key}`}
                    className={({ isActive }) => (isActive ? 'active' : '')}
                    onClick={closeSidebar}
                    onMouseEnter={(e) => { if (collapsed) showTip(t(it.label), e.currentTarget); }}
                    onFocus={(e) => { if (collapsed) showTip(t(it.label), e.currentTarget); }}
                    onMouseLeave={hideTip}
                    onBlur={hideTip}
                  >
                    <span className="material-symbols-outlined ic" aria-hidden="true">{it.icon}</span><span className="nav-label">{t(it.label)}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/*
          زرّ الطيّ — عنصر `button` فعلي، باسم وصفي متغيّر و`aria-expanded`.
          اتجاه السهم مشتقّ من اللغة والحالة معًا: في العربية القائمة يمينًا فالطيّ
          يشير يمينًا والتوسيع يسارًا، وفي الإنجليزية العكس تمامًا.
        */}
        <div className="sidebar-foot">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebarMode}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')}
            title={collapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')}
            disabled={sidebarNarrow}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {(lang === 'ar') === collapsed ? 'chevron_left' : 'chevron_right'}
            </span>
            <span className="sidebar-toggle-text">
              {collapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')}
            </span>
          </button>
        </div>
      </aside>

      {collapsed && tip && (
        <div className="sidebar-tip" style={{ top: tip.top }} role="presentation" aria-hidden="true">
          {tip.label}
        </div>
      )}

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
            {topbarRefreshHandler && (
              <button
                type="button"
                className="icon-btn topbar-refresh-btn"
                disabled={topbarRefreshBusy}
                onClick={() => topbarRefreshHandler()}
                aria-label={t('page.dashboard.retry')}
              >
                <svg className="retry-loader" viewBox="25 25 50 50">
                  <circle cx="50" cy="50" r="20"></circle>
                </svg>
              </button>
            )}
            <button className="icon-btn" onClick={toggleTheme} title={t('layout.toggle_theme')}>{theme === 'dark' ? '☀️' : '🌙'}</button>
            <button
              className="icon-btn"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              title={t('layout.toggle_lang')}
              style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.5 }}
            >
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
            <div
              className="user"
              onClick={onLogout}
              title={t('layout.logout')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onLogout();
                }
              }}
            >
              <div className="user-info">
                <strong>{user?.fullName ?? t('layout.user_fallback')}</strong>
                <small>{user?.role.displayName}</small>
              </div>
              <div className="avatar">{(user?.fullName ?? t('layout.user_fallback')).charAt(0)}</div>
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
