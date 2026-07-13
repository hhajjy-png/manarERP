// @vitest-environment jsdom
/**
 * Collapsible Sidebar Workspace Pack v1 — العقد الذي تحرسه هذه الاختبارات.
 *
 *   1. الافتراضي `expanded`، والتخزين الفاسد لا يُصدَّق.
 *   2. الزر يقلب الحالة، والحالة تُحفظ وتُستعاد بعد إعادة التركيب.
 *   3. المطوي يُخفي النص **بصريًا** ويُبقيه لقارئات الشاشة، ويُظهر تلميحًا.
 *   4. الموسّع لا يُظهر تلميحًا أبدًا.
 *   5. التنقّل والصلاحيات: لم يُمسّا — نفس القائمة المفلترة في الحالتين.
 *   6. RTL/LTR: اتجاه سهم الزرّ يشتقّ من اللغة والحالة معًا.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

import Layout from '../components/Layout';
import { useUI } from '../stores/uiStore';

// الشاشة تُركّب داخل قشرة التطبيق فقط — نعزل ما لا علاقة له بالقائمة.
vi.mock('../components/GlobalSearch', () => ({ default: () => <div data-testid="global-search" /> }));
vi.mock('../components/Toast', () => ({ default: () => null }));
vi.mock('../stores/settingsStore', () => ({
  useSettings: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ loadCompanySettings: () => {}, loaded: true, currencyLanguage: 'english' }),
}));

const PERMS = new Set(['invoices.read', 'customers.read']);
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    user: { fullName: 'مدير النظام', role: { displayName: 'مدير' } },
    logout: vi.fn(),
    hasPermission: (p: string) => PERMS.has(p),
  }),
}));

const SIDEBAR_KEY = 'manarERP.sidebar.mode';

function renderShell() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/']}>
      <Layout />
    </MemoryRouter>,
  );
}

/** matchMedia غير موجود في jsdom — نزرعه، والنافذة واسعة افتراضيًا (غير ضيّقة). */
function installMatchMedia(narrow = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: narrow,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })) as unknown as typeof window.matchMedia;
}

const toggle = () => screen.getByRole('button', { name: /القائمة الجانبية|sidebar/i });
const htmlMode = () => document.documentElement.getAttribute('data-sidebar');

beforeEach(() => {
  localStorage.clear();
  installMatchMedia(false);
  // الحالة الابتدائية تُقرأ عند تحميل الوحدة؛ نُعيدها صراحةً لعزل كل اختبار.
  act(() => { useUI.setState({ sidebarMode: 'expanded', sidebarNarrow: false, lang: 'ar' }); });
  document.documentElement.setAttribute('data-sidebar', 'expanded');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('الحالة الافتراضية والتخزين', () => {
  it('الافتراضي expanded حين لا توجد قيمة محفوظة', () => {
    renderShell();
    expect(useUI.getState().sidebarMode).toBe('expanded');
    expect(htmlMode()).toBe('expanded');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('الطيّ يحفظ القيمة فورًا في localStorage', () => {
    renderShell();
    fireEvent.click(toggle());
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('collapsed');
    expect(htmlMode()).toBe('collapsed');
  });

  it('الضغط مرة أخرى يعيد expanded ويحفظه', () => {
    renderShell();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(useUI.getState().sidebarMode).toBe('expanded');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('expanded');
    expect(htmlMode()).toBe('expanded');
  });

  it('الحالة تُستعاد بعد إعادة التركيب (لا تعتمد على شجرة React)', () => {
    renderShell();
    fireEvent.click(toggle());
    cleanup();

    // إعادة التركيب: المخزن هو مصدر الحقيقة، والقيمة محفوظة أيضًا للتشغيل التالي.
    renderShell();
    expect(useUI.getState().sidebarMode).toBe('collapsed');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('collapsed');
  });

  it('قيمة مخزَّنة غير صالحة ⇒ expanded (لا نثق بالتخزين)', async () => {
    localStorage.setItem(SIDEBAR_KEY, 'nonsense');
    vi.resetModules();
    const fresh = await import('../stores/uiStore');
    expect(fresh.useUI.getState().sidebarMode).toBe('expanded');
  });
});

describe('الوضع المطوي — الأيقونات والنصوص والتلميح', () => {
  it('اسم العنصر يبقى في الـ DOM حين يُطوى (قارئات الشاشة لا تفقده)', () => {
    renderShell();
    fireEvent.click(toggle());
    // النص مخفيّ **بصريًا** عبر CSS، لا محذوفًا من الشجرة.
    expect(screen.getByRole('link', { name: /الفواتير/ })).toBeInTheDocument();
  });

  it('التلميح يظهر عند المرور على عنصر وهو مطوي', () => {
    renderShell();
    fireEvent.click(toggle());
    fireEvent.mouseEnter(screen.getByRole('link', { name: /الفواتير/ }));
    const tip = document.querySelector('.sidebar-tip');
    expect(tip).toBeInTheDocument();
    expect(tip).toHaveTextContent('الفواتير');
    expect(tip).toHaveAttribute('aria-hidden', 'true'); // تكرار بصري، لا اسم بديل
  });

  it('التلميح يظهر أيضًا بالتركيز بلوحة المفاتيح، ويختفي عند مغادرتها', () => {
    renderShell();
    fireEvent.click(toggle());
    const link = screen.getByRole('link', { name: /الفواتير/ });
    fireEvent.focus(link);
    expect(document.querySelector('.sidebar-tip')).toBeInTheDocument();
    fireEvent.blur(link);
    expect(document.querySelector('.sidebar-tip')).not.toBeInTheDocument();
  });

  it('لا تلميح إطلاقًا في الوضع الموسّع', () => {
    renderShell();
    fireEvent.mouseEnter(screen.getByRole('link', { name: /الفواتير/ }));
    expect(document.querySelector('.sidebar-tip')).not.toBeInTheDocument();
  });
});

describe('التنقّل والصلاحيات — لم تُمسّ', () => {
  it('نفس المسارات في الحالتين، ولا عنصر يظهر بلا صلاحيته', () => {
    renderShell();
    const linksExpanded = Array.from(document.querySelectorAll('.nav a')).map((a) => a.getAttribute('href'));

    fireEvent.click(toggle());
    const linksCollapsed = Array.from(document.querySelectorAll('.nav a')).map((a) => a.getAttribute('href'));

    expect(linksCollapsed).toEqual(linksExpanded); // الطيّ لا يضيف ولا يحذف عنصرًا
    expect(linksExpanded).toContain('/invoices');  // ممنوحة
    expect(linksExpanded).toContain('/customers'); // ممنوحة
    expect(linksExpanded).not.toContain('/employees'); // غير ممنوحة ⇒ غائبة في الحالتين
    expect(linksCollapsed).not.toContain('/employees');
  });

  it('العنصر النشط يبقى مُعلَّمًا وهو مطوي', () => {
    renderShell();
    fireEvent.click(toggle());
    const active = document.querySelector('.nav a.active');
    expect(active).toBeInTheDocument();
    expect(active).toHaveAttribute('href', '/'); // لوحة المعلومات هي المسار الحالي
  });
});

describe('الوصولية واتجاه السهم', () => {
  it('الزرّ زرّ فعلي باسم متغيّر و aria-expanded صحيح', () => {
    renderShell();
    expect(toggle().tagName).toBe('BUTTON');
    expect(toggle()).toHaveAccessibleName('طي القائمة الجانبية');
    fireEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName('توسيع القائمة الجانبية');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('العربية (القائمة يمينًا): الطيّ يشير يمينًا، والتوسيع يسارًا', () => {
    renderShell();
    expect(toggle().textContent).toContain('chevron_right');
    fireEvent.click(toggle());
    expect(toggle().textContent).toContain('chevron_left');
  });

  it('الإنجليزية (القائمة يسارًا): الاتجاه معكوس تمامًا', () => {
    act(() => { useUI.setState({ lang: 'en' }); });
    renderShell();
    expect(toggle().textContent).toContain('chevron_left');
    fireEvent.click(toggle());
    expect(toggle().textContent).toContain('chevron_right');
  });
});

describe('النافذة الضيّقة', () => {
  it('تطوي العرض دون أن تكتب فوق اختيار المستخدم المحفوظ', () => {
    installMatchMedia(true); // نافذة ضيّقة
    renderShell();

    expect(useUI.getState().sidebarNarrow).toBe(true);
    expect(htmlMode()).toBe('collapsed');          // المعروض: مطوي
    expect(useUI.getState().sidebarMode).toBe('expanded'); // التفضيل: كما هو
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull();  // لم يُكتب شيء
  });
});
