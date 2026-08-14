// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

/* ════════════════════════════════════════════════════════════════════════════
   عقد واجهة تبويب «كشف المستحقات الشهرية».

   يحرس ما لا يظهر في اختبارات الخادم:
     • الجدول يعرض الأرقام الثلاثة (الصافي، الأساسي، مبلغ التحويل) وحالة كل موظف.
     • التحديد: فردي، متعدد، تحديد الكل، وحالة indeterminate.
     • الموظف غير المؤهل يبقى ظاهرًا وصندوقه معطَّل، وسببه مفهوم.
     • الاعتماد يشمل **الموظفين المحددين فقط**، ولا اعتماد بلا تحديد.
     • التحديد لا يعبر الفترات، ولا تصدير قبل الاعتماد.
     • حارس السباق: استجابة شهر أقدم لا تستبدل نتيجة شهر أحدث.
   ════════════════════════════════════════════════════════════════════════════ */

const api = vi.hoisted(() => ({
  getEntitlementsProfiles: vi.fn(),
  getEntitlementsMonth: vi.fn(),
  getEntitlementsPreview: vi.fn(),
  approveEntitlementsStatement: vi.fn(),
  unapproveEntitlementsStatement: vi.fn(),
}));

vi.mock('../../../api/entitlementsBankExport', () => api);

import EntitlementsBankExport from '../EntitlementsBankExport';
import { bankExportFileName } from '../../../utils/payrollBankExportXls';
import type { EntitlementsMonth } from '../../../api/entitlementsBankExport';

function row(over: Record<string, unknown> = {}) {
  return {
    employeeId: 1, employeeCode: 'EMP-1', employeeName: 'محمد علي', employeeNameEn: 'Mohammed Ali',
    civilId: '290010112345', bankAccount: '1234567890', employeeStatus: 'ACTIVE',
    calculationId: 100, calculationStatus: 'APPROVED',
    netAmount: 350, basicSalary: 150, transferAmount: 200,
    eligibility: 'READY' as const, blockers: [] as string[], ...over,
  };
}
function month(over: Partial<EntitlementsMonth> = {}): EntitlementsMonth {
  return { year: 2026, month: 8, rows: [row()], statement: null, statementLines: [], ...over } as EntitlementsMonth;
}

/** ثلاثة صفوف: مؤهّلان + واحد غير مؤهّل — أساس اختبارات التحديد. */
function threeRows() {
  return month({
    rows: [
      row({ employeeId: 1, employeeCode: 'EMP-1', transferAmount: 200 }),
      row({ employeeId: 2, employeeCode: 'EMP-2', employeeName: 'علي حسن', transferAmount: 125.5 }),
      row({ employeeId: 3, employeeCode: 'EMP-3', employeeName: 'غير معتمد', calculationStatus: 'DRAFT',
        eligibility: 'NOT_APPROVED', blockers: ['كشف المستحقات غير معتمد'] }),
    ],
  });
}

/** قيمة «إجمالي مبلغ التحويل» في شريط الملخّص — لا تلتبس بأرقام صفوف الجدول. */
function transferTotal(): string {
  return document.querySelector('.ebx-stat--amount .ebx-stat-value')?.textContent ?? '';
}
function selectedCount(): string {
  return document.querySelector('.ebx-stat:not(.ebx-stat--amount) .ebx-stat-value')?.textContent ?? '';
}
function rowBoxes(): HTMLInputElement[] {
  return screen.getAllByRole('checkbox', { name: /تحديد الموظف/ }) as HTMLInputElement[];
}
function selectAllBox(): HTMLInputElement {
  return screen.getByRole('checkbox', { name: /تحديد كل الموظفين/ }) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getEntitlementsProfiles.mockResolvedValue([
    { id: 'nbk_entitlements_xls', label: 'NBK — كشف المستحقات الشهرية (XLS)', fileExtension: 'xls', currency: 'KWD' },
  ]);
  api.getEntitlementsMonth.mockResolvedValue(month());
});
afterEach(cleanup);

describe('EntitlementsBankExport — table & amounts', () => {
  it('shows net, basic and the transfer amount for an eligible employee', async () => {
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    const tr = screen.getByText('محمد علي').closest('tr')!;
    expect(within(tr).getByText(/350\.000/)).toBeInTheDocument();
    expect(within(tr).getByText(/150\.000/)).toBeInTheDocument();
    expect(within(tr).getByText(/200\.000/)).toBeInTheDocument();
  });

  it('isolates every money value in an LTR wrapper so BiDi cannot reorder it', async () => {
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    const tr = screen.getByText('محمد علي').closest('tr')!;
    // الأرقام الثلاثة كلها داخل `.money-cell` (عزل LTR) لا كنصّ عربي حرّ.
    expect(tr.querySelectorAll('.money-cell')).toHaveLength(3);
    // العملة في رأس العمود، لا داخل الخليّة — فلا يختلط الرقم بالرمز.
    expect(screen.getByText(/صافي المستحق الشهري \(/)).toBeInTheDocument();
    expect(document.querySelector('.ebx-stat--amount .money-cell')).not.toBeNull();
  });

  it('names the state of every ineligible employee instead of hiding them', async () => {
    api.getEntitlementsMonth.mockResolvedValue(month({
      rows: [
        row({ employeeId: 1, employeeCode: 'EMP-1', employeeName: 'بلا حسبة', calculationId: null, calculationStatus: null,
          netAmount: null, basicSalary: null, transferAmount: null,
          eligibility: 'NO_CALCULATION', blockers: ['لا يوجد كشف مستحقات لهذا الشهر'] }),
        row({ employeeId: 2, employeeCode: 'EMP-2', employeeName: 'غير معتمد', calculationStatus: 'DRAFT',
          eligibility: 'NOT_APPROVED', blockers: ['كشف المستحقات غير معتمد'] }),
        row({ employeeId: 3, employeeCode: 'EMP-3', employeeName: 'بلا بنك',
          eligibility: 'BANK_DATA_INCOMPLETE', blockers: ['الموظف EMP-3: الرقم المدني مفقود'] }),
        row({ employeeId: 4, employeeCode: 'EMP-4', employeeName: 'بلا مبلغ', netAmount: 150, basicSalary: 150, transferAmount: 0,
          eligibility: 'NO_AMOUNT', blockers: ['لا يوجد مبلغ مستحق للتحويل'] }),
      ],
    }));

    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('بلا حسبة');

    expect(screen.getByText('لا يوجد كشف')).toBeInTheDocument();
    expect(screen.getByText('غير معتمد', { selector: '.xpl-chip' })).toBeInTheDocument();
    expect(screen.getByText('بيانات بنكية ناقصة')).toBeInTheDocument();
    expect(screen.getByText('لا يوجد مبلغ للتحويل')).toBeInTheDocument();
  });

  it('does not repeat the chip text as a reason, but keeps the informative one', async () => {
    api.getEntitlementsMonth.mockResolvedValue(month({
      rows: [
        row({ employeeId: 1, employeeName: 'غير معتمد', calculationStatus: 'DRAFT',
          eligibility: 'NOT_APPROVED', blockers: ['كشف المستحقات غير معتمد'] }),
        row({ employeeId: 2, employeeCode: 'EMP-2', employeeName: 'بلا بنك',
          eligibility: 'BANK_DATA_INCOMPLETE', blockers: ['الموظف EMP-2: الرقم المدني مفقود'] }),
      ],
    }));

    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('غير معتمد', { selector: '.ebx-emp-name' });

    // الشريحة تشرح نفسها ⇒ لا سطر سبب تحتها.
    const draftRow = screen.getByText('غير معتمد', { selector: '.ebx-emp-name' }).closest('tr')!;
    expect(draftRow.querySelector('.ebx-reason')).toBeNull();
    // نقص البيانات البنكية يحمل معلومة إضافية (أي حقل بالضبط) ⇒ يبقى معروضًا.
    const bankRow = screen.getByText('بلا بنك').closest('tr')!;
    expect(bankRow.querySelector('.ebx-reason')?.textContent).toContain('الرقم المدني مفقود');
  });

  it('mutes ineligible rows and keeps ready rows visually clearer — no loud row colours', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(screen.getByText('محمد علي').closest('tr')!.className).toContain('ebx-row--ready');
    expect(screen.getByText('غير معتمد', { selector: '.ebx-emp-name' }).closest('tr')!.className).toContain('ebx-row--muted');
  });
});

describe('EntitlementsBankExport — selecting employees', () => {
  it('renders one checkbox per employee: enabled when ready, disabled when not', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    const boxes = rowBoxes();
    expect(boxes).toHaveLength(3);          // الموظف غير المؤهل ظاهر، لا مخفي
    expect(boxes[0].disabled).toBe(false);
    expect(boxes[1].disabled).toBe(false);
    expect(boxes[2].disabled).toBe(true);   // غير مؤهّل ⇒ معطَّل
  });

  it('selects a single employee and updates the count and total immediately', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(selectedCount()).toBe('0');
    fireEvent.click(rowBoxes()[0]);
    await waitFor(() => expect(selectedCount()).toBe('1'));
    expect(transferTotal()).toContain('200.000');
  });

  it('selects several employees and totals them correctly', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(rowBoxes()[0]);
    await waitFor(() => expect(transferTotal()).toContain('200.000'));
    fireEvent.click(rowBoxes()[1]);
    await waitFor(() => expect(transferTotal()).toContain('325.500'));
    expect(selectedCount()).toBe('2');
  });

  it('deselects an employee and rolls the total back', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[1]);
    await waitFor(() => expect(selectedCount()).toBe('2'));

    fireEvent.click(rowBoxes()[1]);
    await waitFor(() => expect(selectedCount()).toBe('1'));
    expect(transferTotal()).toContain('200.000');
  });

  it('a disabled checkbox cannot add an ineligible employee to the selection', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(rowBoxes()[2]);
    await new Promise((r) => setTimeout(r, 0));
    expect(selectedCount()).toBe('0');
    expect(transferTotal()).toContain('0.000');
  });

  it('select-all picks exactly the READY employees, and clears them again', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(selectAllBox());
    await waitFor(() => expect(selectedCount()).toBe('2')); // NOT 3 — the DRAFT row is excluded
    expect(transferTotal()).toContain('325.500');

    fireEvent.click(selectAllBox());
    await waitFor(() => expect(selectedCount()).toBe('0'));
  });

  it('drives the select-all indeterminate state from a partial selection', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(selectAllBox().indeterminate).toBe(false);
    expect(selectAllBox().checked).toBe(false);

    fireEvent.click(rowBoxes()[0]);                       // 1 of 2 ready
    await waitFor(() => expect(selectAllBox().indeterminate).toBe(true));
    expect(selectAllBox().checked).toBe(false);

    fireEvent.click(rowBoxes()[1]);                       // 2 of 2 ready
    await waitFor(() => expect(selectAllBox().checked).toBe(true));
    expect(selectAllBox().indeterminate).toBe(false);
  });

  it('disables select-all when no employee is eligible', async () => {
    api.getEntitlementsMonth.mockResolvedValue(month({
      rows: [row({ eligibility: 'NOT_APPROVED', calculationStatus: 'DRAFT', blockers: ['كشف المستحقات غير معتمد'] })],
    }));
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(selectAllBox().disabled).toBe(true);
  });

  it('drops the selection when the period changes — it never crosses months', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(selectAllBox());
    await waitFor(() => expect(selectedCount()).toBe('2'));

    fireEvent.change(screen.getByLabelText('الشهر'), { target: { value: '9' } });
    await waitFor(() => expect(selectedCount()).toBe('0'));
    expect(transferTotal()).toContain('0.000');
  });
});

describe('EntitlementsBankExport — approval gates the export', () => {
  it('cannot approve with nothing selected', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(screen.getByRole('button', { name: /اعتماد كشف المستحقات/ })).toBeDisabled();
    expect(api.approveEntitlementsStatement).not.toHaveBeenCalled();
  });

  it('approves ONLY the selected employees', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    api.approveEntitlementsStatement.mockResolvedValue({ employeeCount: 1 });
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(rowBoxes()[1]);            // علي حسن وحده (employeeId 2)
    fireEvent.click(screen.getByRole('button', { name: /اعتماد كشف المستحقات/ }));

    await waitFor(() => expect(api.approveEntitlementsStatement).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), [2], 'nbk_entitlements_xls',
    ));
  });

  it('sends every selected id — and no unselected or ineligible one', async () => {
    api.getEntitlementsMonth.mockResolvedValue(threeRows());
    api.approveEntitlementsStatement.mockResolvedValue({ employeeCount: 2 });
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    fireEvent.click(selectAllBox());
    fireEvent.click(screen.getByRole('button', { name: /اعتماد كشف المستحقات/ }));

    await waitFor(() => expect(api.approveEntitlementsStatement).toHaveBeenCalledTimes(1));
    const ids = api.approveEntitlementsStatement.mock.calls[0][2] as number[];
    expect([...ids].sort()).toEqual([1, 2]);   // 3 is the ineligible DRAFT employee
  });

  it('keeps the export disabled — and never fetches the file — while unapproved', async () => {
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    expect(screen.getByRole('button', { name: /تصدير كشف المستحقات البنكي/ })).toBeDisabled();
    expect(api.getEntitlementsPreview).not.toHaveBeenCalled();
  });

  it('presents approve as the primary action before approval, and export as secondary', async () => {
    render(<EntitlementsBankExport canApprove />);
    await screen.findByText('محمد علي');

    const approve = screen.getByRole('button', { name: /اعتماد كشف المستحقات/ });
    const exportBtn = screen.getByRole('button', { name: /تصدير كشف المستحقات البنكي/ });
    expect(approve.className).toContain('primary');
    expect(exportBtn.className).not.toContain('primary');
    // ترتيب سير العمل: الاعتماد أولًا ثم التصدير.
    expect(approve.compareDocumentPosition(exportBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('enables the export as the primary action once approved, and shows the frozen lines', async () => {
    api.getEntitlementsMonth.mockResolvedValue(month({
      statement: {
        id: 5, year: 2026, month: 8, profileId: 'nbk_entitlements_xls', currency: 'KWD', status: 'APPROVED',
        employeeCount: 1, totalAmount: 200, approvedAt: '2026-08-14T00:00:00.000Z', approvedByName: 'hr',
      },
      statementLines: [{
        employeeId: 1, calculationId: 100, employeeCode: 'EMP-1', employeeName: 'محمد علي',
        employeeNameEn: 'Mohammed Ali', civilId: '290010112345', bankAccount: '1234567890',
        netAmount: 350, basicSalary: 150, transferAmount: 200,
      }],
    }));

    render(<EntitlementsBankExport canApprove />);
    await screen.findByText(/سطور الكشف المعتمد/);

    const exportBtn = screen.getByRole('button', { name: /تصدير كشف المستحقات البنكي/ });
    expect(exportBtn).not.toBeDisabled();
    expect(exportBtn.className).toContain('primary');
    expect(screen.getByRole('button', { name: /إلغاء الاعتماد/ })).toBeInTheDocument();
    expect(screen.getByText(/القيم مجمّدة كما اعتُمدت/)).toBeInTheDocument();
    // الكشف معتمد ⇒ لا تحديد بعد الآن، والإجماليات من اللقطة.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(transferTotal()).toContain('200.000');
  });

  it('hides approve/unapprove and the whole selection column without the approve permission', async () => {
    render(<EntitlementsBankExport canApprove={false} />);
    await screen.findByText('محمد علي');

    expect(screen.queryByRole('button', { name: /اعتماد كشف المستحقات/ })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('EntitlementsBankExport — race guard on month change', () => {
  it('a stale month response cannot overwrite a newer one', async () => {
    let resolveFirst: (v: EntitlementsMonth) => void = () => {};
    let resolveSecond: (v: EntitlementsMonth) => void = () => {};
    api.getEntitlementsMonth
      .mockImplementationOnce(() => new Promise<EntitlementsMonth>((r) => { resolveFirst = r; }))
      .mockImplementationOnce(() => new Promise<EntitlementsMonth>((r) => { resolveSecond = r; }));

    render(<EntitlementsBankExport canApprove />);

    // Switch month before the first request settles.
    fireEvent.change(screen.getByLabelText('الشهر'), { target: { value: '9' } });

    // Newer request lands first, then the stale one arrives late.
    resolveSecond(month({ month: 9, rows: [row({ employeeId: 9, employeeName: 'شهر أحدث' })] }));
    await screen.findByText('شهر أحدث');

    resolveFirst(month({ month: 8, rows: [row({ employeeId: 8, employeeName: 'شهر أقدم' })] }));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('شهر أحدث')).toBeInTheDocument();
    expect(screen.queryByText('شهر أقدم')).toBeNull();
  });
});

describe('bank file name — the entitlements file is never confused with the salary file', () => {
  const result = { month: 8, year: 2026, fileExtension: 'xls' } as never;

  it('defaults to the salary name and takes an explicit entitlements prefix', () => {
    expect(bankExportFileName(result)).toBe('NBK_Salary_2026_08.xls');
    expect(bankExportFileName(result, 'NBK_Entitlements')).toBe('NBK_Entitlements_2026_08.xls');
  });
});
