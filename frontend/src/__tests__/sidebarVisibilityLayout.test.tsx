// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { flushAsyncUpdates } from './helpers/flush';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import { t } from '../lib/i18n';

/**
 * الشريط الجانبي نفسه — لا الطبقة الصافية وحدها.
 *
 * تُثبت هذه الاختبارات أن تفضيل الإظهار يصل فعلًا إلى ما يُصيَّر في `Layout`:
 * الافتراضي كما هو، والإخفاء يزيل مدخل التنقّل فقط، والإعادة تُرجعه إلى موضعه،
 * والمجموعة التي لا عنصر ظاهر فيها لا تترك عنوانًا.
 */

/** الاسم المعروض لعنصر قائمة بمفتاح i18n — لا نكتب النص مرتين. */
const label = (key: string) => t(key, 'ar');

/** يُصيّر القائمة ثم يُفرغ تحميل إعدادات الشركة غير المتزامن (تأثير تركيب في `Layout`). */
async function renderLayout() {
  const utils = render(
    <MemoryRouter initialEntries={['/']} future={ROUTER_FUTURE}>
      <Layout />
    </MemoryRouter>,
  );
  await flushAsyncUpdates();
  return utils;
}

/** أسماء عناصر التنقّل بترتيب ظهورها — نصّ `.nav-label` وحده (بلا اسم الأيقونة). */
const navLinkNames = () =>
  screen.getAllByRole('link').map((el) => el.querySelector('.nav-label')?.textContent?.trim() ?? '');

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { settings: [] } } } as never);
  // jsdom لا يوفّر matchMedia — القائمة تقرأه لتحديد الطيّ عند النوافذ الضيّقة.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as never;
  useAuth.setState({
    user: {
      id: 1, username: 'admin', fullName: 'مدير', role: { id: 1, name: 'SYSTEM_ADMIN', displayName: 'مدير النظام' }, permissions: [],
    },
    hasPermission: () => true,
  } as never);
  useUI.setState({ hiddenNavKeys: [], lang: 'ar' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useUI.setState({ hiddenNavKeys: [] });
});

describe('Layout sidebar — visibility preference', () => {
  it('الافتراضي: كل الصفحات المسموح بها تظهر كما هي اليوم', async () => {
    await renderLayout();
    const names = navLinkNames();
    expect(names).toContain(label('nav.invoices'));
    expect(names).toContain(label('nav.inventory'));
    expect(names).toContain(label('nav.settings'));
    expect(screen.getByText(label('nav.group.warehouse'))).toBeInTheDocument();
  });

  it('إخفاء صفحة يزيلها من الشريط، وإعادة إظهارها تعيدها إلى موضعها الأصلي', async () => {
    await renderLayout();
    const before = navLinkNames();
    const originalIndex = before.indexOf(label('nav.invoices'));
    expect(originalIndex).toBeGreaterThan(-1);

    act(() => useUI.getState().toggleNavItemVisibility('invoices'));
    expect(navLinkNames()).not.toContain(label('nav.invoices'));
    // الصفحات الأخرى لم تتأثّر.
    expect(navLinkNames()).toContain(label('nav.expenses'));

    act(() => useUI.getState().toggleNavItemVisibility('invoices'));
    const after = navLinkNames();
    expect(after).toEqual(before);
    expect(after.indexOf(label('nav.invoices'))).toBe(originalIndex);
  });

  it('مجموعة أُخفي كل عناصرها لا تترك عنوان مجموعة فارغًا', async () => {
    await renderLayout();
    expect(screen.getByText(label('nav.group.warehouse'))).toBeInTheDocument();

    act(() => useUI.getState().toggleNavItemVisibility('inventory'));
    expect(screen.queryByText(label('nav.group.warehouse'))).not.toBeInTheDocument();

    act(() => useUI.getState().showAllNavItems());
    expect(screen.getByText(label('nav.group.warehouse'))).toBeInTheDocument();
  });

  it('«الإعدادات» تبقى ظاهرة — لا يمكن إخفاؤها', async () => {
    await renderLayout();
    act(() => useUI.getState().toggleNavItemVisibility('settings'));
    expect(navLinkNames()).toContain(label('nav.settings'));
  });

  it('صفحة بلا صلاحية لا تظهر ولو لم تكن مخفية', async () => {
    useAuth.setState({ hasPermission: (p: string) => p !== 'inventory.read' } as never);
    await renderLayout();
    expect(navLinkNames()).not.toContain(label('nav.inventory'));
    expect(navLinkNames()).toContain(label('nav.invoices'));
  });

  it('التفضيل محفوظ بمفتاح ثابت: تغيير لغة العرض لا يُعيد الصفحة المخفية', async () => {
    await renderLayout();
    act(() => useUI.getState().toggleNavItemVisibility('invoices'));
    act(() => useUI.getState().setLang('en'));
    expect(navLinkNames()).not.toContain(t('nav.invoices', 'en'));
    expect(navLinkNames()).toContain(t('nav.expenses', 'en'));
  });
});
