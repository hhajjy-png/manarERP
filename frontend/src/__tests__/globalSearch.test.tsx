// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import GlobalSearch from '../components/GlobalSearch';
import { api } from '../api/client';
import { useAuth } from '../stores/authStore';

/**
 * البحث الشامل — من زينة إلى ميزة.
 *
 * الحقل في الشريط العلوي كان `<input>` بلا `value` ولا `onChange` ولا معالِج: يكتب فيه
 * المستخدم فلا يقع شيء. هذه الاختبارات تُثبت أنه صار يبحث، ويفتح، ويحترم الصلاحيات.
 */

const HITS = [
  { type: 'customer', id: 3, title: 'شركة الوفاق', subtitle: 'C-003', route: '/customers?highlight=3' },
  { type: 'invoice',  id: 1, title: 'INV-2026-001', subtitle: 'الوفاق', route: '/invoices?highlight=1' },
];

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

let get: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigate.mockReset();
  get = vi.fn(async () => ({ data: { data: HITS } }));
  vi.spyOn(api, 'get').mockImplementation(get as never);
  // مستخدم يملك كل شيء ما لم يُقيَّد في اختباره.
  useAuth.setState({ hasPermission: () => true } as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderSearch = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <GlobalSearch />
    </MemoryRouter>,
  );

const input = () => screen.getByRole('combobox') as HTMLInputElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('البحث', () => {
  it('الحقل مضبوط — الكتابة تُغيّر قيمته فعلًا (لم يعد زينة)', () => {
    renderSearch();
    type('الوفاق');
    expect(input().value).toBe('الوفاق');
  });

  it('حرف واحد لا يستدعي الخادم — يطابق كل شيء ولا يفيد أحدًا', async () => {
    renderSearch();
    type('ا');
    await new Promise((r) => setTimeout(r, 400));
    expect(get).not.toHaveBeenCalled();
  });

  it('الكتابة العربية تُرجع نتائج، ولكلٍّ سياقها', async () => {
    renderSearch();
    type('الوفاق');
    expect(await screen.findByText('شركة الوفاق')).toBeInTheDocument();
    expect(screen.getByText('C-003')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/search', expect.objectContaining({ params: { q: 'الوفاق' } }));
  });

  it('البحث برقم الفاتورة (أرقام لاتينية) يعمل كذلك', async () => {
    renderSearch();
    type('INV-2026');
    expect(await screen.findByText('INV-2026-001')).toBeInTheDocument();
  });

  it('الاستدعاء مؤجَّل — لا طلب لكل حرف', async () => {
    renderSearch();
    type('ال');
    type('الو');
    type('الوفا');
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(get.mock.calls[0][1].params.q).toBe('الوفا'); // آخر ما كُتب، لا أوّله
  });
});

describe('التنقّل', () => {
  it('اختيار نتيجة يفتح شاشتها ويُفرغ الحقل', async () => {
    renderSearch();
    type('الوفاق');
    fireEvent.click(await screen.findByText('شركة الوفاق'));
    expect(navigate).toHaveBeenCalledWith('/customers?highlight=3');
    expect(input().value).toBe('');
  });

  it('الصفحات نفسها نتائج — تُفتح بلا انتظار الخادم', async () => {
    renderSearch();
    type('الفواتير');
    const page = await screen.findByText('الفواتير');
    fireEvent.click(page);
    expect(navigate).toHaveBeenCalledWith('/invoices');
  });

  it('صفحة بلا صلاحية لا تظهر أصلًا', async () => {
    useAuth.setState({ hasPermission: (k: string) => k !== 'invoices.read' } as never);
    get.mockResolvedValue({ data: { data: [] } });
    renderSearch();
    type('الفواتير');
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByText('الفواتير')).toBeNull(); // لا صفحة، ولا نتيجة
  });
});

describe('لوحة المفاتيح', () => {
  it('الأسهم تنقل، وEnter يفتح المُحدَّد', async () => {
    renderSearch();
    type('الوفاق');
    await screen.findByText('شركة الوفاق');

    fireEvent.keyDown(input(), { key: 'ArrowDown' }); // من الأول إلى الثاني
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/invoices?highlight=1');
  });

  it('Escape يغلق اللوحة بلا تنقّل', async () => {
    renderSearch();
    type('الوفاق');
    await screen.findByText('شركة الوفاق');

    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByText('شركة الوفاق')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Ctrl+K يركّز الحقل من أي مكان', () => {
    renderSearch();
    expect(document.activeElement).not.toBe(input());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(input());
  });
});

describe('الحالات الفارغة والفاشلة', () => {
  it('لا نتائج: رسالة صريحة تذكر المصطلح — لا لوحة فارغة صامتة', async () => {
    get.mockResolvedValue({ data: { data: [] } });
    renderSearch();
    type('زقزقة');
    expect(await screen.findByText(/لا نتائج/)).toBeInTheDocument();
  });

  it('فشل الطلب: خطأ معروض، لا انهيار ولا نتائج قديمة عالقة', async () => {
    renderSearch();
    type('الوفاق');
    await screen.findByText('شركة الوفاق');

    get.mockRejectedValueOnce(new Error('network'));
    type('الخليج');
    expect(await screen.findByText(/تعذّر البحث/)).toBeInTheDocument();
    expect(screen.queryByText('شركة الوفاق')).toBeNull(); // النتائج القديمة أُزيلت
  });
});
