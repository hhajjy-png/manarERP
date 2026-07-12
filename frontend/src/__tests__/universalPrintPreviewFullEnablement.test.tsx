// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { api } from '../api/client';
import {
  isFlagEnabled,
  isPhase2Enabled,
  isLegacyFormsPreviewEnabled,
  setFlagOverride,
  PRINT_CENTER_FOUNDATION_V1,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_INVOICE,
  PRINT_CENTER_PHASE2_QUOTATION,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
  PRINT_PREVIEW_LEGACY_FORMS_V1,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL,
  PRINT_PREVIEW_LEGACY_FORMS_HR,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE,
  type FlagName,
} from '../printing';
import SalaryCertificate from '../pages/SalaryCertificate';
import EmployeeWarning from '../pages/EmployeeWarning';
import LeaveRequest from '../pages/LeaveRequest';
import PaymentVoucher from '../pages/PaymentVoucher';
import PurchaseRequest from '../pages/PurchaseRequest';
import ReceiptVoucher from '../pages/ReceiptVoucher';

/**
 * Universal Print Preview — التفعيل الكامل.
 *
 * الأعلام التسعة صارت ON افتراضيًا. التغيير الإنتاجي **ثلاث قيم** في `flags.ts`، ولا شيء
 * غيرها: لا محرك طباعة، لا مُركِّب، لا حوار، لا صفحة.
 *
 * ما تثبته هذه الاختبارات على **المكوّنات الحقيقية** لا على harness:
 *   • المعاينة تفتح افتراضيًا في مجموعات B و C و D.
 *   • الطباعة الفعلية ما زالت المسار القديم — نداء واحد، بنفس الإعدادات والهوية.
 *   • الإغلاق لا يطبع، والنقر المزدوج لا يكرّر المهمة.
 *   • إطفاء علم — رئيسيًا كان أو فرعيًا — يعيد السلوك القديم **حرفيًا**.
 *
 * تغطية OFF لم تُحذف؛ صارت تُطفئ العلم **صراحةً** بدل الاتّكاء على افتراض قديم.
 */

// ── بيانات وهمية للخادم ─────────────────────────────────────────────────────────
const EMPLOYEE = {
  id: 7,
  code: 'E-007',
  fullName: 'أحمد المنصور',
  fullNameEn: 'Ahmed Almansour',
  civilId: '290010112345',
  jobTitle: 'مشرف موقع',
  department: 'العمليات',
  salary: 450,
  hireDate: '2020-03-01',
  nationality: 'كويتي',
};

const CHEQUE = {
  id: 9,
  chequeNumber: '000123',
  chequeDate: '2026-07-01',
  beneficiaryName: 'مؤسسة الخليج للتوريدات',
  amount: 1250.5,
  bankName: 'بنك الكويت الوطني',
  description: 'دفعة مقاولة',
  paymentVoucherNumber: 'PV-2026-0009',
  status: 'ISSUED',
};

const RCV_NUMBER = 'RCV-2026-0004';

type PrintJobLike = { docType: string; copies: number; destination: string; documentId?: string };

let printSubmit: ReturnType<typeof vi.fn>;
let post: ReturnType<typeof vi.fn>;
let windowPrint: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear(); // ← لا overrides: نختبر DEFAULTS الحقيقية
  printSubmit = vi.fn(async (_job: PrintJobLike) => ({ status: 'printed' as const }));
  (window as unknown as { manar: unknown }).manar = { printSubmit };
  windowPrint = vi.spyOn(window, 'print').mockImplementation(() => {});

  vi.spyOn(api, 'get').mockImplementation((async (url: string) => {
    if (url.includes('/forms/salary-certificate/'))
      return { data: { data: { employee: EMPLOYEE, latestPayroll: { month: 6, year: 2026, netSalary: 450, snapshotBaseSalary: 400 } } } };
    if (url.includes('/forms/leave-request/')) return { data: { data: { employee: EMPLOYEE, latestLeave: null } } };
    if (url.includes('/forms/employee-warning/')) return { data: { data: { employee: EMPLOYEE } } };
    if (url.includes('/cheques/')) return { data: { data: CHEQUE } };
    return { data: { data: {} } };
  }) as never);

  post = vi.fn(async (url: string) =>
    url.includes('receipt-voucher-number')
      ? { data: { data: { rcvNumber: RCV_NUMBER } } }
      : { data: { data: {} } },
  );
  vi.spyOn(api, 'post').mockImplementation(post as never);
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { manar?: unknown }).manar;
  localStorage.clear();
  vi.restoreAllMocks();
});

// ── محدِّدات ────────────────────────────────────────────────────────────────────
const dialogOpen = () => document.querySelector('.pc-scrim') !== null;
const dialogCount = () => document.querySelectorAll('.pc-scrim').length;
/** زر الطباعة **على الشاشة** — لا زر شريط المعاينة (كلاهما يحمل نفس النص). */
const screenPrintBtn = () =>
  screen
    .getAllByRole('button')
    .find(
      (b) =>
        !b.closest('.pc-toolbar') &&
        /🖨️\s*(طباعة|Print)/.test(b.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
    )!;
/** أزرار شريط المعاينة تحديدًا. */
const pcBtn = (label: string) =>
  [...document.querySelectorAll('.pc-toolbar button')].find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(label),
  ) as HTMLButtonElement;
const previewPrintBtn = () => pcBtn('طباعة');

// ═══════════════════════════════════════════════════════════════════════════════
// السياسة — الأعلام التسعة
// ═══════════════════════════════════════════════════════════════════════════════
const ALL_FLAGS: FlagName[] = [
  PRINT_CENTER_FOUNDATION_V1,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_INVOICE,
  PRINT_CENTER_PHASE2_QUOTATION,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
  PRINT_PREVIEW_LEGACY_FORMS_V1,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL,
  PRINT_PREVIEW_LEGACY_FORMS_HR,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE,
];

describe('الأعلام التسعة — ON افتراضيًا', () => {
  it('العدد تسعة بالضبط، ولا علم عاشر مخفي', () => {
    expect(new Set(ALL_FLAGS).size).toBe(9);
  });

  it('كل واحد منها ON بلا أي override', () => {
    for (const flag of ALL_FLAGS) expect(isFlagEnabled(flag)).toBe(true);
  });

  it('كل مستند مفعّل عبر بوابته المركّبة (رئيسي AND فرعي)', () => {
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE)).toBe(true);
  });
});

describe('Kill switches — override يتقدّم على الافتراض ON', () => {
  it('PRINT_CENTER_PHASE2 = off يُطفئ الفاتورة وعرض السعر وسند القبض معًا', () => {
    setFlagOverride(PRINT_CENTER_PHASE2, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false);
    // ولا يمتدّ أثره إلى مجموعة النماذج القديمة — مفتاحان مستقلّان.
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
  });

  it('PRINT_PREVIEW_LEGACY_FORMS_V1 = off يُطفئ HR وFinance وعقد العمل وقسيمة الراتب معًا', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE)).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true); // مجموعة أخرى — لم تتأثّر
  });

  it('تعطيل علم فرعي يُطفئ مستنده/مجموعته وحدها', () => {
    for (const [target, others] of [
      [PRINT_PREVIEW_LEGACY_FORMS_HR, [PRINT_PREVIEW_LEGACY_FORMS_FINANCE, PRINT_PREVIEW_LEGACY_FORMS_SPECIAL]],
      [PRINT_PREVIEW_LEGACY_FORMS_FINANCE, [PRINT_PREVIEW_LEGACY_FORMS_HR, PRINT_PREVIEW_LEGACY_FORMS_SPECIAL]],
    ] as [FlagName, FlagName[]][]) {
      setFlagOverride(target, false);
      expect(isLegacyFormsPreviewEnabled(target)).toBe(false);
      for (const other of others) expect(isLegacyFormsPreviewEnabled(other)).toBe(true);
      setFlagOverride(target, null);
    }
    setFlagOverride(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
  });

  it('إزالة الـ override تُعيد الافتراض ON — لا حالة عالقة', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, false);
    expect(isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, null);
    expect(isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
  });

  it('قيمة localStorage غير صالحة تُتجاهَل ولا تكسر شيئًا', () => {
    for (const junk of ['', 'true', 'ON', '1', 'off ', '{"a":1}', 'null']) {
      localStorage.setItem(`manar:flag:${PRINT_PREVIEW_LEGACY_FORMS_HR}`, junk);
      // 'on' و'off' وحدهما مقبولتان؛ ما عداهما يسقط إلى الافتراض بلا رمي.
      expect(isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
    }
    localStorage.setItem(`manar:flag:${PRINT_PREVIEW_LEGACY_FORMS_HR}`, 'off'); // القيمة الصالحة وحدها تعمل
    expect(isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase B — نماذج الموارد البشرية (مكوّنات حقيقية)
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * ثلاثة نماذج فعلية تختلف في بياناتها وحقولها: شهادة راتب (تعتمد على آخر مسيّر)، إنذار
 * (حقول طباعة وحالة داخلية)، طلب إجازة (سجلّ إجازة سابق). وكلها `ready` ⇒ تطبع تلقائيًا
 * عند الجاهزية — وهو **المسار الذي كان يتجاوز المعاينة**، فيُختبر هنا على المكوّن نفسه.
 */
const HR_FORMS = [
  ['شهادة الراتب', SalaryCertificate, '/forms/salary-certificate/7', '/forms/salary-certificate/:employeeId'],
  ['الإنذار', EmployeeWarning, '/forms/employee-warning/7', '/forms/employee-warning/:employeeId'],
  ['طلب الإجازة', LeaveRequest, '/forms/leave-request/7', '/forms/leave-request/:employeeId'],
] as const;

function renderPage(Page: () => JSX.Element, entry: string, path: string) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** ينتظر خروج الشاشة من حالة التحميل (تُجلب بياناتها من الخادم). */
const awaitLoaded = async () => {
  await flushAsyncUpdates();
  await waitFor(() => expect(document.querySelector('.form-page')).not.toBeNull(), { timeout: 4000 });
};

describe.each(HR_FORMS)('Phase B — %s', (_name, Page, entry, path) => {
  it('المعاينة تفتح تلقائيًا افتراضيًا — ولا حوار طباعة ولا مهمة طباعة', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });
    expect(printSubmit).not.toHaveBeenCalled();
    expect(windowPrint).not.toHaveBeenCalled();
  });

  it('«طباعة» داخل المعاينة تفوّض إلى المسار القديم مرة واحدة', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0] as PrintJobLike;
    expect(job.docType).toBe('form');
    expect(job.destination).toBe('printer');
    expect(job.copies).toBe(1);
  });

  it('النقر المزدوج داخل المعاينة لا يكرّر المهمة', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    const btn = previewPrintBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit).toHaveBeenCalledTimes(1);
  });

  it('الإغلاق لا يطبع', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    fireEvent.click(pcBtn('إغلاق'));
    expect(dialogOpen()).toBe(false);
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('الطباعة المباشرة من الشاشة تبقى متاحة بعد إغلاق المعاينة', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });
    fireEvent.click(pcBtn('إغلاق'));

    fireEvent.click(screenPrintBtn()); // المستخدم يضغط «طباعة» على الشاشة
    await flushAsyncUpdates();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 }); // نفس البوابة
    expect(dialogCount()).toBe(1); // نافذة واحدة، لا ثانية
    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  it('العلم الرئيسي OFF ⇒ السلوك القديم حرفيًا: طباعة تلقائية بلا معاينة', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, false);
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(windowPrint).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
  });

  it('علم المجموعة OFF وحده ⇒ نفس السلوك القديم', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, false);
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    await waitFor(() => expect(windowPrint).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase C — سند الصرف · طلب الشراء (مكوّنات حقيقية)
// ═══════════════════════════════════════════════════════════════════════════════
const FINANCE_FORMS = [
  ['سند الصرف', PaymentVoucher, '/forms/payment-voucher/9', '/forms/payment-voucher/:chequeId'],
  ['طلب الشراء', PurchaseRequest, '/forms/purchase-request', '/forms/purchase-request'],
] as const;

describe.each(FINANCE_FORMS)('Phase C — %s', (_name, Page, entry, path) => {
  it('لا معاينة تلقائية (ready=false) ولا طباعة تلقائية', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    expect(dialogOpen()).toBe(false);
    expect(printSubmit).not.toHaveBeenCalled();
    expect(windowPrint).not.toHaveBeenCalled();
  });

  it('«طباعة» تفتح المعاينة افتراضيًا ولا تطبع', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    expect(dialogOpen()).toBe(true);
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('«طباعة» داخل المعاينة تنفّذ مهمة واحدة، والنقر المزدوج لا يكرّرها', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();

    const btn = previewPrintBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0] as PrintJobLike;
    expect(job.docType).toBe('form');
    expect(job.copies).toBe(1);
  });

  it('الإغلاق لا يطبع', async () => {
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    fireEvent.click(pcBtn('إغلاق'));
    expect(dialogOpen()).toBe(false);
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('العلم OFF ⇒ الزر يطبع مباشرة بلا معاينة (السلوك القديم)', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_FINANCE, false);
    renderPage(Page as never, entry, path);
    await awaitLoaded();
    fireEvent.click(screenPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase D — سند القبض (مساره الخاص: submitPrintJob مباشرةً)
// ═══════════════════════════════════════════════════════════════════════════════
/** يملأ الحقول الإلزامية: الجهة والمبلغ والبيان (التاريخ افتراضه اليوم). */
function fillReceiptVoucher() {
  fireEvent.change(screen.getByPlaceholderText('استلمنا من السيد / السادة…'), {
    target: { value: 'شركة الوفاق' },
  });
  fireEvent.change(screen.getByPlaceholderText('0.000'), { target: { value: '75.500' } });
  fireEvent.change(screen.getByPlaceholderText('وذلك عن…'), { target: { value: 'دفعة أولى' } });
}

const rvNumberCalls = () =>
  post.mock.calls.filter(([url]) => String(url).includes('receipt-voucher-number')).length;

async function openReceiptVoucher() {
  render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/receipt-voucher']}>
      <ReceiptVoucher />
    </MemoryRouter>,
  );
  await flushAsyncUpdates();
  fillReceiptVoucher();
  fireEvent.click(screenPrintBtn());
  await flushAsyncUpdates();
}

describe('Phase D — سند القبض', () => {
  it('المعاينة تفتح افتراضيًا بعد إصدار الرقم — ولا مهمة طباعة', async () => {
    await openReceiptVoucher();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });
    expect(rvNumberCalls()).toBe(1); // رقم واحد فقط
    expect(printSubmit).not.toHaveBeenCalled();
    expect(windowPrint).not.toHaveBeenCalled();
  });

  it('«طباعة» داخل المعاينة تُرسل مهمة واحدة بنفس رقم السند', async () => {
    await openReceiptVoucher();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0] as PrintJobLike;
    expect(job.docType).toBe('receipt-voucher');
    expect(job.documentId).toBe(RCV_NUMBER);
    expect(job.copies).toBe(1);
    expect(rvNumberCalls()).toBe(1); // ولا رقم ثانٍ عند الطباعة
  });

  it('النقر المزدوج لا يكرّر مهمة الطباعة ولا رقم السند', async () => {
    await openReceiptVoucher();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    const btn = previewPrintBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit).toHaveBeenCalledTimes(1);
    expect(rvNumberCalls()).toBe(1);
  });

  it('الإغلاق لا يطبع', async () => {
    await openReceiptVoucher();
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });
    fireEvent.click(pcBtn('إغلاق'));
    expect(dialogOpen()).toBe(false);
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('العلم الرئيسي OFF ⇒ يعود إلى مسار Phase 1: طباعة مباشرة بلا معاينة', async () => {
    setFlagOverride(PRINT_CENTER_PHASE2, false);
    await openReceiptVoucher();
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
    const job = printSubmit.mock.calls[0][0] as PrintJobLike;
    expect(job.docType).toBe('receipt-voucher');
    expect(job.documentId).toBe(RCV_NUMBER);
  });

  it('علمه وحده OFF ⇒ نفس المسار القديم، وبقية المستندات لم تتأثّر', async () => {
    setFlagOverride(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER, false);
    await openReceiptVoucher();
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase A — انحدار
// ═══════════════════════════════════════════════════════════════════════════════
describe('Phase A — ما زالت مفعّلة ولم يمسّها التغيير', () => {
  it('الفاتورة وعرض السعر وعقد العمل وقسيمة الراتب ON', () => {
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(true);
  });

  it('كل علم Phase A ما زال قابلًا للإطفاء وحده', () => {
    for (const flag of [PRINT_CENTER_PHASE2_INVOICE, PRINT_CENTER_PHASE2_QUOTATION] as FlagName[]) {
      setFlagOverride(flag, false);
      expect(isPhase2Enabled(flag)).toBe(false);
      setFlagOverride(flag, null);
      expect(isPhase2Enabled(flag)).toBe(true);
    }
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL, false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true); // مستقلّة
  });
});
