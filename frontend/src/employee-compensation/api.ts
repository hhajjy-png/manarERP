/**
 * عميل مسارات `/api/employee-compensation` — **نقطة الوصول الوحيدة** للوحدة في الواجهة.
 *
 * لا صفحة تنادي `api.get('/employee-compensation/…')` مباشرةً: تمرير المسارات من هنا
 * يجعل تغيير أيٍّ منها تعديلًا في ملف واحد، ويمنع أن تتسرّب صياغة مسار خاطئة إلى صفحة.
 */
import { api } from '../api/client';
import type {
  AnnualFile,
  Calculation,
  CalculationDraft,
  CompanyOvertimeSettings,
  Debt,
  DebtDetail,
  DebtLedger,
  DebtType,
  DetailedReportData,
  EmployeeSummary,
  OvertimeType,
  PreviewResult,
  ReverseResult,
  StatementData,
} from './types';

const BASE = '/employee-compensation';

/** كل استجابات النظام مغلَّفة بـ`{ success, data }` — نفكّها هنا مرة واحدة. */
async function unwrap<T>(promise: Promise<{ data: { data: T } }>): Promise<T> {
  return (await promise).data.data;
}

export const compensationApi = {
  listSummaries: (params: { year: number; search?: string; status?: string }) =>
    unwrap<{ year: number; employees: EmployeeSummary[] }>(api.get(`${BASE}/summaries`, { params })),

  annualFile: (employeeId: number, year: number) =>
    unwrap<AnnualFile>(api.get(`${BASE}/employees/${employeeId}/years/${year}`)),

  month: (employeeId: number, year: number, month: number) =>
    unwrap<Calculation | null>(api.get(`${BASE}/employees/${employeeId}/years/${year}/months/${month}`)),

  byId: (id: number) => unwrap<Calculation>(api.get(`${BASE}/calculations/${id}`)),

  create: (employeeId: number, year: number, month: number, body: CalculationDraft) =>
    unwrap<Calculation>(api.post(`${BASE}/employees/${employeeId}/years/${year}/months/${month}`, body)),

  update: (id: number, body: CalculationDraft) => unwrap<Calculation>(api.put(`${BASE}/calculations/${id}`, body)),

  approve: (id: number) => unwrap<Calculation>(api.post(`${BASE}/calculations/${id}/approve`)),

  remove: (id: number) =>
    unwrap<{ id: number; employeeId: number; year: number; month: number }>(api.delete(`${BASE}/calculations/${id}`)),

  copyPrevious: (employeeId: number, year: number, month: number) =>
    unwrap<Calculation>(api.post(`${BASE}/employees/${employeeId}/years/${year}/months/${month}/copy-previous`)),

  /** معاينة حيّة أثناء التحرير — نفس محرّك الحفظ، بلا كتابة. */
  preview: (body: CalculationDraft & { basicSalary: number; hourlyRateOverride?: number | null; priorRegularOvertimeHoursThisYear?: number }) =>
    unwrap<PreviewResult>(api.post(`${BASE}/preview`, body)),

  reverseOvertime: (body: {
    targetAmount: number;
    overtimeType: OvertimeType;
    basicSalary?: number;
    hourlyRate?: number;
    companyOvertimeBaseRate?: number | null;
  }) => unwrap<ReverseResult>(api.post(`${BASE}/reverse-overtime`, body)),

  // ── الافتراضي العام لسعر ساعة الإضافي ──────────────────────────────────────
  // إعداد إداري واحد للوحدة. تغييره **لا يمسّ أي شهر محفوظ** — كل شهر يحمل لقطته.
  overtimeRateSettings: () => unwrap<CompanyOvertimeSettings>(api.get(`${BASE}/settings/overtime-rate`)),

  setOvertimeRateSettings: (baseRate: number) =>
    unwrap<CompanyOvertimeSettings>(api.put(`${BASE}/settings/overtime-rate`, { baseRate })),

  statement: (id: number) => unwrap<StatementData>(api.get(`${BASE}/calculations/${id}/statement`)),

  detailed: (id: number) => unwrap<DetailedReportData>(api.get(`${BASE}/calculations/${id}/detailed`)),

  // ── سجل المديونيات والسلف ──────────────────────────────────────────────────
  // السجل **غير مرتبط بسنة**: مساره تحت الموظف، فمديونية ٢٠٢٦ تظهر في ٢٠٢٧ كما هي.
  debts: (employeeId: number) => unwrap<DebtLedger>(api.get(`${BASE}/employees/${employeeId}/debts`)),

  openDebts: (employeeId: number) => unwrap<Debt[]>(api.get(`${BASE}/employees/${employeeId}/debts/open`)),

  debt: (id: number) => unwrap<DebtDetail>(api.get(`${BASE}/debts/${id}`)),

  createDebt: (employeeId: number, body: { type: DebtType; label: string; originalAmount: number; debtDate: string; notes?: string | null }) =>
    unwrap<Debt>(api.post(`${BASE}/employees/${employeeId}/debts`, body)),

  updateDebt: (id: number, body: Partial<{ type: DebtType; label: string; originalAmount: number; debtDate: string; notes: string | null }>) =>
    unwrap<Debt>(api.put(`${BASE}/debts/${id}`, body)),

  deleteDebt: (id: number) => unwrap<{ id: number; employeeId: number }>(api.delete(`${BASE}/debts/${id}`)),

  addManualPayment: (debtId: number, body: { amount: number; paymentDate: string; notes?: string | null }) =>
    unwrap<DebtDetail>(api.post(`${BASE}/debts/${debtId}/payments`, body)),

  updateManualPayment: (paymentId: number, body: Partial<{ amount: number; paymentDate: string; notes: string | null }>) =>
    unwrap<DebtDetail>(api.put(`${BASE}/debt-payments/${paymentId}`, body)),

  deleteManualPayment: (paymentId: number) => unwrap<DebtDetail>(api.delete(`${BASE}/debt-payments/${paymentId}`)),
};
