// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { flushAsyncUpdates } from './helpers/flush';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useUI } from '../stores/uiStore';
import { t } from '../lib/i18n';
import PrivateAmount from '../components/PrivateAmount';
import { MoneyText } from '../config/modules';

/**
 * زرّ القفل في الشريط العلوي — لا الطبقة الصافية (`togglePrivacy`) وحدها، بل الزرّ
 * كما يراه المستخدم فعلًا داخل `Layout` الحقيقي: يبدّل عند كل ضغطة، يعكس حالته في
 * الأيقونة والعنوان فورًا، ويبقى متّسقًا عبر التبديل المتكرر والتنقّل بين الصفحات.
 */

const label = (key: string) => t(key, 'ar');

async function renderApp(initialPath = '/') {
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]} future={ROUTER_FUTURE}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>لوحة التحكّم <PrivateAmount value={1000} /></div>} />
          <Route path="/invoices" element={<div>الفواتير <MoneyText value={2500} /></div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await flushAsyncUpdates();
  return utils;
}

/** زرّ القفل الوحيد — عنوانه يتغيّر بحسب الحالة، فلا نبحث باسم ثابت. */
function privacyButton(): HTMLElement {
  const buttons = document.querySelectorAll('.privacy-btn');
  expect(buttons).toHaveLength(1); // «زرّ واحد بالضبط» — عقد التعليق في Layout.tsx
  return buttons[0] as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(api, 'get').mockResolvedValue({ data: { data: { settings: [] } } } as never);
  // jsdom لا يوفّر matchMedia — Layout يقرأه لتحديد الطيّ عند النوافذ الضيّقة.
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
  useUI.setState({ hiddenNavKeys: [], lang: 'ar', privacyMode: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useUI.setState({ privacyMode: true });
});

describe('زرّ الخصوصية في الشريط العلوي', () => {
  it('يبدأ مقفلًا افتراضيًا — أيقونة وعنوان القفل، وزرّ واحد بالضبط', async () => {
    await renderApp();
    const btn = privacyButton();
    expect(btn).toHaveTextContent('🔒');
    expect(btn).toHaveAttribute('title', label('layout.privacy_on_title'));
    expect(useUI.getState().privacyMode).toBe(true);
  });

  it('الضغطة تبدّل الحالة فورًا — بلا Refresh وبلا انتظار', async () => {
    await renderApp();
    fireEvent.click(privacyButton());

    expect(useUI.getState().privacyMode).toBe(false);
    const btn = privacyButton();
    expect(btn).toHaveTextContent('🔓');
    expect(btn).toHaveAttribute('title', label('layout.privacy_rehide_title'));
  });

  it('إخفاء ← إظهار ← إخفاء ← إظهار: كل ضغطة تُبدّل الحالة، لا تفشل بصمت', async () => {
    await renderApp();
    const expectedAfterEachClick = [false, true, false, true];
    for (const expectedState of expectedAfterEachClick) {
      fireEvent.click(privacyButton());
      expect(useUI.getState().privacyMode).toBe(expectedState);
    }
    // بعد أربع ضغطات (زوجي) نعود إلى الحالة المقفلة الأصلية
    expect(useUI.getState().privacyMode).toBe(true);
    expect(privacyButton()).toHaveTextContent('🔒');
  });

  it('الضغط يكشف القيم المالية المعروضة فعليًا في الصفحة، لا الزرّ وحده', async () => {
    await renderApp();
    const amount = screen.getByText('1,000.000 KWD');
    expect(amount.closest('.pm-real')).not.toBeVisible();

    fireEvent.click(privacyButton());
    expect(amount.closest('.pm-real')).toBeVisible();
    expect(amount.closest('.money-cell')?.querySelector('.pm-mask')).not.toBeVisible();
  });

  it('التنقّل بين الصفحات لا يُعيد الحالة ولا يُفقد التزامن', async () => {
    await renderApp('/');
    fireEvent.click(privacyButton()); // كشف الأرقام
    expect(useUI.getState().privacyMode).toBe(false);

    fireEvent.click(screen.getByRole('link', { name: new RegExp(label('nav.invoices')) }));
    await flushAsyncUpdates();

    expect(screen.getByText('الفواتير')).toBeInTheDocument();
    // الحالة نفسها بقيت — لم يُعِد تركيب Layout المخزن أو الزرّ إلى الافتراضي
    expect(useUI.getState().privacyMode).toBe(false);
    const btn = privacyButton();
    expect(btn).toHaveTextContent('🔓');
    // والمبلغ المعروض في الصفحة الجديدة يتّبع نفس الحالة المكشوفة
    const newAmount = screen.getByText('2,500.000 KWD');
    expect(newAmount.closest('.pm-real')).toBeVisible();

    // إعادة الإخفاء من الصفحة الجديدة تعمل أيضًا
    fireEvent.click(privacyButton());
    expect(useUI.getState().privacyMode).toBe(true);
    expect(newAmount.closest('.pm-real')).not.toBeVisible();
  });
});
