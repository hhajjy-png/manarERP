// @vitest-environment jsdom
/**
 * الطباعة الفعلية = حبر البيانات وحده.
 *
 * ورقة الشيك الحقيقية تحمل خلفيتها وشعارها مطبوعَين من البنك. أي خلفية أو شعار
 * أو صورة شيك يخرج من الطابعة يطبع فوق ورقة بنكية حقيقية ويُتلفها. الصور في هذا
 * النظام **مرجع بصري للمعاينة والمعايرة فقط**.
 *
 * هذه المجموعة تثبّت ذلك على المخرَج الفعلي لا على النية:
 *   • مسار Classic: الصورة موجودة على الشاشة، ومحجوبة داخل `@media print`.
 *   • مسار القوالب (Designer): سطح الطباعة يُركَّب بلا خلفية إطلاقًا.
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

describe('Classic print output carries ink only', () => {
  it('hides the cheque background image inside @media print', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cheque-print-only')).toBeInTheDocument());

    const printCss = Array.from(container.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');

    // القاعدة نفسها، داخل كتلة الطباعة تحديدًا — لا مجرد وجود الاسم في الملف.
    const printBlock = printCss.slice(printCss.indexOf('@media print'));
    expect(printBlock).toMatch(/\.cheque-bg-img\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('still shows the background on screen — it is a preview reference', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cheque-print-only')).toBeInTheDocument());
    const img = container.querySelector('.cheque-bg-img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    // موجود في DOM المعاينة، ومحجوب بالطباعة عبر القاعدة أعلاه.
    expect(img!.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks the background purely decorative, so it carries no printed meaning', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cheque-print-only')).toBeInTheDocument());
    const img = container.querySelector('.cheque-bg-img') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
  });
});

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

describe('the print page never opts into printing backgrounds', () => {
  it('keeps the print layer free of any logo or emblem asset', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelector('.cheque-print-only')).toBeInTheDocument());
    const layer = container.querySelector('.cheque-print-only')!;
    // صورة الخلفية الوحيدة المسموح بوجودها هي مرجع المعاينة المحجوب بالطباعة؛
    // أي أصل آخر (شعار/ختم) لا مكان له في طبقة الطباعة إطلاقًا.
    const images = Array.from(layer.querySelectorAll('img'));
    expect(images.every((img) => img.classList.contains('cheque-bg-img'))).toBe(true);
  });
});
