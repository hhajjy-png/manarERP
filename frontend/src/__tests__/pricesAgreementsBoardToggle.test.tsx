// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true, isSystemAdmin: () => false }),
}));

import Prices from '../pages/Prices';
import { api } from '../api/client';

const mockGet = api.get as unknown as ReturnType<typeof vi.fn>;

const BOARD_ROW = {
  id: 1, asphaltPlant: 'مصنع الشمال', companyName: 'شركة أ', contractLocation: 'الجهراء',
  contractUnit: 'طن', unitPrice: 12, validUntil: null, customer: null,
  usageCount: 0, totalQuantity: 0, totalAmount: 0,
};
const DASHBOARD = {
  totalAgreements: 1, unusedCount: 1, expiringCount: 0,
  unused: [BOARD_ROW], expiring: [], top5: [], least5: [],
};

function routeGet(url: string) {
  if (url === '/prices/agreements-dashboard') return Promise.resolve({ data: { data: DASHBOARD } });
  if (url === '/prices/stats') return Promise.resolve({ data: { data: { count: 1, customerCount: 0, lastUpdatedAt: null } } });
  if (url === '/prices') return Promise.resolve({ data: { data: { data: [], meta: null } } });
  if (url === '/customers') return Promise.resolve({ data: { data: { data: [] } } });
  return Promise.resolve({ data: { data: {} } });
}

function renderPage() {
  return render(<MemoryRouter future={ROUTER_FUTURE}><Prices /></MemoryRouter>);
}

const STORAGE_KEY = 'manarERP.prices.agreementsBoard';

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockGet.mockImplementation(routeGet);
});
afterEach(cleanup);

describe('لوحة الاتفاقيات — مفتاح العرض/الإخفاء', () => {
  it('تظهر افتراضيًا (لا تفضيل محفوظ) والمفتاح يعرض «إخفاء»', async () => {
    renderPage();
    expect(await screen.findByText('مصنع الشمال')).toBeVisible();
    expect(screen.getByRole('button', { name: 'إخفاء' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('الضغط على «إخفاء» يُخفي جدول اللوحة ويحفظ الاختيار', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'إخفاء' }));

    expect(screen.getByText('مصنع الشمال')).not.toBeVisible();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('hidden');
    // عنوان القسم والمفتاح يبقيان ظاهرين حتى يمكن إرجاع اللوحة.
    expect(screen.getByText('لوحة الاتفاقيات')).toBeVisible();
    expect(screen.getByRole('button', { name: 'عرض' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('التفضيل يستمر بعد إعادة فتح الصفحة، والضغط على «عرض» يعيد الجدول', async () => {
    localStorage.setItem(STORAGE_KEY, 'hidden');
    renderPage();

    expect(await screen.findByText('مصنع الشمال')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'عرض' }));

    expect(screen.getByText('مصنع الشمال')).toBeVisible();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('shown');
  });

  it('قيمة مخزّنة تالفة ⇒ اللوحة ظاهرة (السلوك الافتراضي)', async () => {
    localStorage.setItem(STORAGE_KEY, '{{ليست قيمة صالحة');
    renderPage();
    expect(await screen.findByText('مصنع الشمال')).toBeVisible();
  });
});
