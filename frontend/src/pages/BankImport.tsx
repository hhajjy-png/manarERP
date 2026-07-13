import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { formatNumber } from '../lib/format';
import { formatDate } from '../lib/date';
import { money } from '../config/modules';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankImportInputRow {
  transactionId: string;
  beneficiaryAccount: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  paymentType: string;
  status: string;
  paymentDate: string;
  errorDescription?: string;
  civilId?: string;
  payrollMonth: number;
  payrollYear: number;
  _sheetName: string;
  _rowIndex: number;
}

interface BankPreviewRow {
  rowIndex: number;
  sheetName: string;
  payrollMonth: number;
  payrollYear: number;
  transactionId: string;
  civilId: string | null;
  employeeId: number | null;
  employeeName: string | null;
  matchedBankAccount: string | null;
  beneficiaryAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  paymentDate: string | null;
  paymentType: string | null;
  matchMethod: 'civilId' | 'bankAccount' | null;
  isValid: boolean;
  errors: string[];
  isDuplicate: boolean;
  isMatched: boolean;
}

interface BankPreviewSummary {
  totalRows: number;
  matched: number;
  unmatched: number;
  invalid: number;
  duplicate: number;
  totalAmount: number;
  canExecute: boolean;
  rows: BankPreviewRow[];
}

interface ExecuteResult {
  imported: number;
  totalAmount: number;
}

type Step = 'idle' | 'file_loaded' | 'previewing' | 'previewed' | 'executing' | 'done';

// ── Excel helpers ─────────────────────────────────────────────────────────────

// Normalize a raw Excel header for case/space-tolerant matching.
// "  Civil ID  " → "civil id",  "Transaction ID" → "transaction id"
function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Build a normalized-key lookup from a raw row object.
function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    out[normalizeHeader(key)] = raw[key];
  }
  return out;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// Format A: sheet named "mar-2025" → { month: 3, year: 2025 }
function parseSheetName(name: string): { month: number; year: number } | null {
  const clean = name.trim().toLowerCase();
  const match = clean.match(/^([a-z]+)[-\s](\d{4})$/);
  if (!match) return null;
  const month = MONTH_MAP[match[1]];
  if (!month) return null;
  const year = parseInt(match[2], 10);
  if (year < 2000 || year > 2100) return null;
  return { month, year };
}

// Format B: Month column value "Mar-25" → { month: 3, year: 2025 }
// Also handles Date objects: XLSX with cellDates:true parses date-formatted cells
// (e.g. a cell formatted as "MMM-YY") as Date objects rather than strings.
function parseMonthColumn(value: unknown): { month: number; year: number } | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const month = value.getMonth() + 1;
    const year = value.getFullYear();
    if (year < 2000 || year > 2100) return null;
    return { month, year };
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim().toLowerCase();
  const match = cleaned.match(/^([a-z]+)-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_MAP[match[1]];
  if (!month) return null;
  const year = 2000 + parseInt(match[2], 10);
  if (year > 2100) return null;
  return { month, year };
}

function parseDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  const s = String(v).trim();
  if (!s) return '';
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Try DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return s;
}

function buildInputRow(
  r: Record<string, unknown>,
  rowIndex: number,
  sheetName: string,
  payrollMonth: number,
  payrollYear: number,
): BankImportInputRow {
  return {
    transactionId: String(r['transaction id'] ?? '').trim(),
    beneficiaryAccount: String(r['beneficiary account number'] ?? '').trim(),
    beneficiaryName: String(r['beneficiary account name'] ?? '').trim(),
    amount: parseFloat(String(r['payment amount'] ?? '0')) || 0,
    currency: String(r['currency'] ?? '').trim().toUpperCase(),
    paymentType: String(r['payment type'] ?? '').trim(),
    status: String(r['status'] ?? '').trim().toUpperCase(),
    paymentDate: parseDate(r['payment date']),
    errorDescription: String(r['error description'] ?? '').trim() || undefined,
    civilId: String(r['civil id'] ?? '').trim() || undefined,
    payrollMonth,
    payrollYear,
    _sheetName: sheetName,
    _rowIndex: rowIndex,
  };
}

function parseSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  payrollMonth: number,
  payrollYear: number,
): BankImportInputRow[] {
  const ws = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const out: BankImportInputRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const r = normalizeRow(rawRows[i]);
    const txId = String(r['transaction id'] ?? '').trim();
    if (!txId || txId === '- -') continue;
    out.push(buildInputRow(r, i, sheetName, payrollMonth, payrollYear));
  }
  return out;
}

function parseRows(workbook: XLSX.WorkBook): { rows: BankImportInputRow[]; skippedSheets: string[] } {
  // Priority 1: sheets with monthly names (e.g. "mar-2025")
  const monthlySheets = workbook.SheetNames.filter((n) => parseSheetName(n) !== null);

  if (monthlySheets.length > 0) {
    const rows: BankImportInputRow[] = [];
    for (const sheetName of monthlySheets) {
      const { month, year } = parseSheetName(sheetName)!;
      rows.push(...parseSheetRows(workbook, sheetName, month, year));
    }
    const skippedSheets = workbook.SheetNames.filter((n) => !monthlySheets.includes(n));
    return { rows, skippedSheets };
  }

  // Priority 2: All_Transactions sheet with a Month column
  const allTxName = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'all_transactions');
  if (allTxName) {
    const ws = workbook.Sheets[allTxName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const rows: BankImportInputRow[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const r = normalizeRow(rawRows[i]);
      const txId = String(r['transaction id'] ?? '').trim();
      if (!txId || txId === '- -') continue;
      const parsed = parseMonthColumn(r['month']);
      rows.push(buildInputRow(r, i, allTxName, parsed?.month ?? 0, parsed?.year ?? 0));
    }
    return { rows, skippedSheets: [] };
  }

  return { rows: [], skippedSheets: workbook.SheetNames };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 18px', minWidth: 100, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RowStatusPill({ row }: { row: BankPreviewRow }) {
  if (!row.isValid) return <span style={pill('#dc2626')}>خطأ</span>;
  if (row.isDuplicate) return <span style={pill('#ca8a04')}>مكرر</span>;
  if (!row.isMatched) return <span style={pill('#dc2626')}>غير مطابق</span>;
  return <span style={pill('#16a34a')}>صالح</span>;
}

function pill(color: string): React.CSSProperties {
  return { background: color, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' };
}

function btnStyle(variant: 'primary' | 'danger' | 'secondary', disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = { padding: '9px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, border: 'none' };
  if (variant === 'primary') return { ...base, background: 'var(--primary, #1d4ed8)', color: '#fff' };
  if (variant === 'danger') return { ...base, background: '#dc2626', color: '#fff' };
  return { ...base, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' };
}

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmtDate(iso: string | null): string {
  return formatDate(iso);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BankImport() {
  const { hasPermission } = useAuth();

  const [step, setStep] = useState<Step>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BankImportInputRow[]>([]);
  const [skippedSheets, setSkippedSheets] = useState<string[]>([]);
  const [preview, setPreview] = useState<BankPreviewSummary | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!hasPermission('import.read')) {
    return <div style={{ padding: 32, color: 'var(--text-muted)' }}>ليس لديك صلاحية لعرض هذه الصفحة.</div>;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > 10 * 1024 * 1024) {
      setError('حجم الملف كبير جداً — الحد الأقصى 10 م.ب');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      setError('يرجى اختيار ملف Excel بصيغة .xlsx أو .xls');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        if (wb.SheetNames.length === 0) { setError('الملف فارغ'); return; }

        const { rows: parsed, skippedSheets: skipped } = parseRows(wb);
        if (parsed.length === 0) { setError('لم يتم العثور على صفوف قابلة للاستيراد. تأكد أن أسماء الأوراق بصيغة "mar-2025" أو أن الملف يحتوي على ورقة "All_Transactions"'); return; }

        setRows(parsed);
        setSkippedSheets(skipped);
        setFileName(file.name);
        setPreview(null);
        setResult(null);
        setStep('file_loaded');
      } catch {
        setError('تعذّر قراءة الملف — تأكد أنه ملف Excel صحيح');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handlePreview() {
    setError(null);
    setStep('previewing');
    try {
      const res = await api.post<{ data: BankPreviewSummary }>('/salaries/bank-import/preview', { rows });
      setPreview(res.data.data);
      setStep('previewed');
    } catch (err) {
      setError(errorMessage(err));
      setStep('file_loaded');
    }
  }

  async function handleExecute() {
    if (!preview?.canExecute) return;
    setError(null);
    setStep('executing');
    try {
      const res = await api.post<{ data: ExecuteResult }>('/salaries/bank-import/execute', { rows });
      setResult(res.data.data);
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
      setStep('previewed');
    }
  }

  function handleReset() {
    setStep('idle');
    setFileName('');
    setRows([]);
    setSkippedSheets([]);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const isLoading = step === 'previewing' || step === 'executing';

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300 }}>
      <div className="page-head">
        <div>
          <h2>استيراد الرواتب البنكية</h2>
          <p>استيراد ملف تحويلات البنك وربطه بسجلات الموظفين</p>
        </div>
      </div>

      {/* Upload area */}
      {step !== 'done' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
            <button onClick={() => fileRef.current?.click()} disabled={isLoading} style={btnStyle('secondary', isLoading)}>
              📂 اختر ملف Excel
            </button>
            {step !== 'idle' && (
              <button onClick={handlePreview} disabled={isLoading || rows.length === 0} style={btnStyle('primary', isLoading || rows.length === 0)}>
                {step === 'previewing' ? 'جارٍ المعاينة…' : '🔍 معاينة وتحقق'}
              </button>
            )}
            {step === 'previewed' && preview?.canExecute && hasPermission('import.create') && (
              <button onClick={handleExecute} disabled={false} style={btnStyle('danger', false)}>
                ⬆ تنفيذ الاستيراد
              </button>
            )}
            {step !== 'idle' && (
              <button onClick={handleReset} disabled={isLoading} style={btnStyle('secondary', isLoading)}>
                ✕ إعادة تعيين
              </button>
            )}
          </div>
          {fileName && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              الملف: <strong>{fileName}</strong> — {rows.length} صف قابل للاستيراد
              {skippedSheets.length > 0 && (
                <span style={{ color: '#ca8a04' }}> (تم تجاهل الأوراق: {skippedSheets.join(', ')})</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Format hint */}
      {step === 'idle' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          <strong>التنسيقات المدعومة:</strong>
          <div style={{ marginTop: 8 }}>
            <strong>تنسيق أ — أوراق شهرية:</strong> ملف Excel يحتوي على أوراق باسم مثل <code>mar-2025</code> أو <code>april-2026</code>.
            كل ورقة تمثل شهر استحقاق الراتب.
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>تنسيق ب — ورقة شاملة:</strong> ملف Excel يحتوي على ورقة واحدة باسم <code>All_Transactions</code> مع عمود <code>Month</code> بصيغة مثل <code>Mar-25</code>.
          </div>
          <div style={{ marginTop: 8 }}>
            الأعمدة المطلوبة:
            <code style={{ margin: '0 4px' }}>Transaction ID</code>
            <code style={{ margin: '0 4px' }}>Civil ID</code>
            <code style={{ margin: '0 4px' }}>Beneficiary Account Number</code>
            <code style={{ margin: '0 4px' }}>Payment Amount</code>
            <code style={{ margin: '0 4px' }}>Payment Date</code>
            <code style={{ margin: '0 4px' }}>Currency</code>
            <code style={{ margin: '0 4px' }}>status</code>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--danger-bg, #fef2f2)', border: '1px solid #dc2626', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Blocked execute warning */}
      {step === 'previewed' && preview && !preview.canExecute && (
        <div style={{ background: 'var(--warning-bg, #fefce8)', border: '1px solid #ca8a04', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#78350f', fontSize: 13 }}>
          لا يمكن التنفيذ — يجب أن تكون جميع الصفوف صحيحة ومطابقة لموظفين قبل الاستيراد. راجع الأخطاء أدناه.
        </div>
      )}

      {/* Summary cards */}
      {preview && step !== 'done' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <SummaryCard label="إجمالي الصفوف" value={preview.totalRows} color="var(--text)" />
          <SummaryCard label="مطابقون" value={preview.matched} color="#16a34a" />
          <SummaryCard label="غير مطابقين" value={preview.unmatched} color={preview.unmatched > 0 ? '#dc2626' : 'var(--text-muted)'} />
          <SummaryCard label="أخطاء" value={preview.invalid} color={preview.invalid > 0 ? '#dc2626' : 'var(--text-muted)'} />
          <SummaryCard label="مكررة" value={preview.duplicate} color={preview.duplicate > 0 ? '#ca8a04' : 'var(--text-muted)'} />
          <SummaryCard label="المبلغ الكلي" value={money(preview.totalAmount)} color="var(--primary, #1d4ed8)" />
        </div>
      )}

      {/* Preview table */}
      {preview && step !== 'done' && (
        <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-header, var(--bg))', borderBottom: '2px solid var(--border)' }}>
                {['شهر الرواتب', 'السنة', 'الرقم المدني', 'الموظف', 'رقم الحساب', 'اسم المستفيد', 'المبلغ', 'العملة', 'تاريخ الدفع', 'رقم المعاملة', 'التحقق'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: !row.isValid || !row.isMatched ? 'var(--danger-bg, #fef2f2)' : row.isDuplicate ? 'var(--warning-bg, #fefce8)' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>{MONTH_AR[(row.payrollMonth ?? 1) - 1]}</td>
                  <td style={tdStyle}>{row.payrollYear}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.civilId ?? '—'}</td>
                  <td style={tdStyle}>{row.employeeName ?? <span style={{ color: '#dc2626' }}>غير محدد</span>}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.beneficiaryAccount ?? '—'}</td>
                  <td style={tdStyle}>{row.beneficiaryName}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{formatNumber(row.amount)}</td>
                  <td style={tdStyle}>{row.currency}</td>
                  <td style={tdStyle}>{fmtDate(row.paymentDate)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.transactionId}</td>
                  <td style={tdStyle}>
                    <RowStatusPill row={row} />
                    {row.errors.length > 0 && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{row.errors.join(' · ')}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Success result */}
      {step === 'done' && result && (
        <div style={{ background: 'var(--success-bg, #f0fdf4)', border: '1px solid #16a34a', borderRadius: 8, padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', color: '#16a34a' }}>✅ تم الاستيراد بنجاح</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <SummaryCard label="تم استيراده" value={result.imported} color="#16a34a" />
            <SummaryCard label="إجمالي المبالغ" value={money(result.totalAmount)} color="var(--primary, #1d4ed8)" />
          </div>
          <button onClick={handleReset} style={btnStyle('primary', false)}>＋ استيراد جديد</button>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'start', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' };
