// @vitest-environment jsdom
/**
 * الطباعة الفعلية = حبر البيانات وحده.
 *
 * ورقة الشيك الحقيقية تحمل خلفيتها وشعارها مطبوعَين من البنك. أي خلفية أو شعار
 * أو صورة شيك يخرج من الطابعة يطبع فوق ورقة بنكية حقيقية ويُتلفها. الصور في هذا
 * النظام **مرجع بصري للمعاينة والمعايرة فقط**.
 *
 * هذه المجموعة تثبّت ذلك على المخرَج الفعلي لا على النية:
 *   • سطح الطباعة (ChequeRenderSurface) يُركَّب بلا خلفية إطلاقًا.
 *
 * مسار Classic — الذي كان يُخفي الصورة عبر `@media print` — أُزيل مع قالبه
 * («Keep Gulf Bank Template Only»)، والضمان الباقي أقوى: لا عنصر صورة يُركَّب
 * أصلًا في شجرة الطباعة.
 *
 * إسقاط أيٍّ من هذه التأكيدات يعني أن حبرًا زائدًا سيصل ورق شيكات حقيقيًا.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { bankRegistryResponse, gulfChequeAccountFields } from './helpers/bankRegistry';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentViewWithResult: vi.fn() }));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' },
  }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }), t: (k: string) => k }));

import { api } from '../api/client';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';
import ChequeRenderSurface from '../components/chequeTemplateManager/ChequeRenderSurface';

const CHEQUE = {
  id: 1, chequeNumber: '000002', chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'مستفيد', amount: 1370, currency: 'KWD',
  description: null, bankName: 'بنك الخليج', status: 'DRAFT',
  printedAt: null, cancelledAt: null, notes: null, printCount: 0,
  paymentVoucherNumber: null, createdAt: '2026-07-30',
  ...gulfChequeAccountFields(),
};

function mockApi() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    const registry = bankRegistryResponse(url);
    if (registry) return Promise.resolve(registry as never);
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: [CHEQUE], meta: { total: 1 } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: 1, draft: 1, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [] } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

beforeEach(() => { vi.clearAllMocks(); mockApi(); });
afterEach(cleanup);

describe('Designer template print surface carries ink only', () => {
  // `visibleFields` هو ما يرسمه السطح فعلًا؛ فارغ هنا لأن موضوع الاختبار الخلفية.
  const model = {
    surface: { widthCm: 17.8, heightCm: 8.9 },
    visibleFields: [],
    meta: { hasErrors: false, issues: [] },
  } as never;

  it('renders no background element when printing', () => {
    const { container } = render(<ChequeRenderSurface model={model} showBackground={false} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the reference image only when the caller asks for a preview', () => {
    const { container } = render(
      <ChequeRenderSurface model={model} showBackground backgroundSrc="data:image/png;base64,AAAA" />,
    );
    expect(container.querySelector('img')).not.toBeNull();
  });
});
