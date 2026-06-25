import { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import {
  previewImport,
  executeImport,
  type StatementTransaction,
  type ImportPreviewSummary,
  type PreviewRow,
  type ImportResult,
} from '../api/bankStatementImport';
import { detectBankTemplateClient, parseExcelRowsClient, parseCsvRowsClient, detectCsvDelimiterClient, CLIENT_STATEMENT_CONFIGS } from '../utils/bankStatementParser';

// ── Wizard steps ──────────────────────────────────────────────────────────────

type Step = 'upload' | 'detect' | 'preview' | 'confirm' | 'done';

const STEPS: { id: Step; labelAr: string }[] = [
  { id: 'upload',  labelAr: 'رفع الملف' },
  { id: 'detect',  labelAr: 'كشف البنك' },
  { id: 'preview', labelAr: 'معاينة' },
  { id: 'confirm', labelAr: 'تأكيد' },
  { id: 'done',    labelAr: 'مكتمل' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('ar-KW');
}

const STATUS_BADGE: Record<string, string> = {
  KWD:     'bg-green-100 text-green-800',
  USD:     'bg-blue-100  text-blue-800',
  UNMATCHED: 'bg-gray-100   text-gray-700',
  MATCHED:   'bg-green-100  text-green-700',
  REVIEW:    'bg-yellow-100 text-yellow-700',
  error:     'bg-red-100    text-red-700',
  warning:   'bg-yellow-100 text-yellow-700',
};

const BANK_NAMES: Record<string, string> = {
  NBK:         'بنك الكويت الوطني',
  KFH:         'بيت التمويل الكويتي',
  GULF_BANK:   'بنك الخليج',
  BOUBYAN:     'بنك بوبيان',
  WARBA:       'بنك وربة',
  AHLI_UNITED: 'البنك الأهلي المتحد',
  UNKNOWN:     'بنك غير معروف',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function BankStatementImport() {
  const { hasPermission } = useAuth();
  const fileInputRef  = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<Step>('upload');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // File state
  const [fileName, setFileName]   = useState('');
  const [fileType, setFileType]   = useState<'excel' | 'csv' | null>(null);

  // Detected bank
  const [detectedBank, setDetectedBank] = useState<string>('UNKNOWN');
  const [parsedRows, setParsedRows]     = useState<StatementTransaction[]>([]);
  const [headers, setHeaders]           = useState<string[]>([]);

  // Preview state
  const [preview, setPreview]     = useState<ImportPreviewSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Import result
  const [result, setResult]       = useState<ImportResult | null>(null);

  // ── File parsing ────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);

    if (file.size > MAX_FILE_SIZE) {
      setError('حجم الملف يتجاوز 10 ميغابايت — حدّ الاستيراد هو 10 ميغابايت');
      return;
    }

    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isCsv   = name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      setError('نوع الملف غير مدعوم — يُرجى رفع ملف Excel (.xlsx) أو CSV (.csv)');
      return;
    }

    setFileName(file.name);
    setFileType(isExcel ? 'excel' : 'csv');

    try {
      let detectedHeaders: string[] = [];
      let rows: StatementTransaction[] = [];

      if (isExcel) {
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]!]!;
        const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

        // Get headers from first non-empty row
        const headerRow = (data[0] ?? []) as unknown[];
        detectedHeaders = headerRow.map((h) => (h != null ? String(h).trim() : '')).filter(Boolean);
        const tpl = detectBankTemplateClient(detectedHeaders);
        setDetectedBank(tpl.bankName);
        rows = parseExcelRowsClient(data, tpl);
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        const delimiter = lines[0] ? detectCsvDelimiterClient(lines[0]) : ',';
        detectedHeaders = (lines[0] ?? '').split(delimiter).map((h) => h.replace(/^"|"$/g, '').trim());
        const tpl = detectBankTemplateClient(detectedHeaders);
        setDetectedBank(tpl.bankName);
        rows = parseCsvRowsClient(text, tpl);
      }

      setHeaders(detectedHeaders);
      setParsedRows(rows);
      setStep('detect');
    } catch (err) {
      setError(`فشل قراءة الملف: ${errorMessage(err)}`);
    }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // ── Preview request ─────────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const summary = await previewImport({
        bankName: detectedBank,
        fileName,
        rows:     parsedRows,
      });
      setPreview(summary);
      setStep('preview');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  }, [detectedBank, fileName, parsedRows]);

  // ── Execute import ──────────────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    if (!preview?.canImport) return;
    setLoading(true);
    setError(null);
    try {
      const importResult = await executeImport({
        bankName: detectedBank,
        fileName,
        fromDate: preview.fromDate ?? undefined,
        toDate:   preview.toDate   ?? undefined,
        rows:     parsedRows,
      });
      setResult(importResult);
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [preview, detectedBank, fileName, parsedRows]);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setFileType(null);
    setDetectedBank('UNKNOWN');
    setParsedRows([]);
    setHeaders([]);
    setPreview(null);
    setResult(null);
    setError(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasPermission('bankStatementImport.create')) {
    return (
      <div className="p-8 text-center text-gray-500" dir="rtl">
        ليس لديك صلاحية لاستيراد كشوف الحسابات البنكية.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6" dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">استيراد كشف الحساب البنكي</h1>
        <p className="text-gray-500 mt-1">رفع كشف الحساب وإجراء المطابقة الذكية مع السجلات المالية</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold
              ${step === s.id ? 'bg-blue-600 text-white' :
                STEPS.findIndex((x) => x.id === step) > i ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {STEPS.findIndex((x) => x.id === step) > i ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${step === s.id ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
              {s.labelAr}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-gray-300 mx-1" />}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ── Step: Upload ── */}
      {step === 'upload' && (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-5xl mb-4">📂</div>
          <p className="text-lg font-medium text-gray-700">اسحب ملف كشف الحساب أو انقر للاختيار</p>
          <p className="text-sm text-gray-400 mt-2">Excel (.xlsx) أو CSV — الحد الأقصى 10 ميغابايت، 10,000 صف</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      )}

      {/* ── Step: Detect template ── */}
      {step === 'detect' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">نتيجة كشف البنك</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">الملف</p>
                <p className="font-medium">{fileName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">البنك المكتشف</p>
                <p className="font-medium text-blue-700">{BANK_NAMES[detectedBank] ?? detectedBank}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">عدد الصفوف</p>
                <p className="font-medium">{parsedRows.length.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">النوع</p>
                <p className="font-medium">{fileType === 'excel' ? 'Excel' : 'CSV'}</p>
              </div>
            </div>
          </div>

          {/* Override bank selection */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="font-medium mb-3">تغيير البنك يدوياً (اختياري)</h3>
            <select
              value={detectedBank}
              onChange={(e) => setDetectedBank(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Object.entries(BANK_NAMES).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Column headers preview */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="font-medium mb-3">أعمدة الكشف المكتشفة</h3>
            <div className="flex flex-wrap gap-2">
              {headers.map((h) => (
                <span key={h} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">{h}</span>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={previewLoading || parsedRows.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {previewLoading ? 'جارٍ التحليل…' : 'تحليل الكشف'}
            </button>
            <button onClick={reset} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              إعادة تعيين
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Preview ── */}
      {step === 'preview' && preview && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'إجمالي الصفوف', value: preview.totalRows.toLocaleString(), color: 'blue' },
              { label: 'صالحة',         value: preview.valid.toLocaleString(),      color: 'green' },
              { label: 'بها أخطاء',     value: preview.invalid.toLocaleString(),    color: 'red' },
              { label: 'مطابقة',        value: preview.matched.toLocaleString(),    color: 'indigo' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4`}>
                <p className="text-sm text-gray-500">{label}</p>
                <p className={`text-2xl font-bold text-${color}-700 mt-1`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Financial summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">إجمالي المدين (د.ك)</p>
                <p className="text-lg font-bold text-red-600">{fmtAmount(preview.totalDebits)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">إجمالي الدائن (د.ك)</p>
                <p className="text-lg font-bold text-green-600">{fmtAmount(preview.totalCredits)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">المصاريف البنكية</p>
                <p className="text-lg font-bold text-gray-700">{preview.bankFees}</p>
              </div>
            </div>
          </div>

          {/* Cannot import warning */}
          {!preview.canImport && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              لا يمكن استيراد هذا الكشف — يوجد {preview.invalid} صف(وف) بها أخطاء. يرجى مراجعة الملف وإعادة رفعه.
            </div>
          )}

          {/* Transaction preview table — virtualized at > 200 rows */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium">معاينة المعاملات ({preview.rows.length} صف)</h3>
            </div>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">التاريخ</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">الوصف</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">مدين</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">دائن</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">حالة</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-600">مطابقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rows.slice(0, 500).map((row: PreviewRow) => (
                    <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''}>
                      <td className="px-3 py-2 text-gray-400">{row.rowIndex + 1}</td>
                      <td className="px-3 py-2">{fmtDate(row.statementDate)}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={row.description}>{row.description}</td>
                      <td className="px-3 py-2 text-red-600">{row.debit > 0 ? fmtAmount(row.debit) : ''}</td>
                      <td className="px-3 py-2 text-green-600">{row.credit > 0 ? fmtAmount(row.credit) : ''}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">خطأ</span>
                        ) : row.warnings.length > 0 ? (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">تحذير</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">صالح</span>
                        )}
                        {row.isBankFee && (
                          <span className="mr-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">رسوم</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.matchResult.best ? (
                          <span className="text-xs text-blue-700">
                            {row.matchResult.best.confidence}% — {row.matchResult.best.ref}
                          </span>
                        ) : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                  {preview.rows.length > 500 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-3 text-center text-gray-400 text-sm">
                        يُعرض 500 من {preview.rows.length} صف — جميع الصفوف ستُستورد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('confirm')}
              disabled={!preview.canImport}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              متابعة للتأكيد
            </button>
            <button onClick={reset} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Confirm ── */}
      {step === 'confirm' && preview && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-amber-800 mb-2">تأكيد الاستيراد</h2>
            <p className="text-amber-700 text-sm">
              سيتم استيراد <strong>{preview.totalRows}</strong> معاملة بنكية من كشف{' '}
              <strong>{BANK_NAMES[preview.bankName] ?? preview.bankName}</strong>.
              لا يمكن التراجع عن هذه العملية بعد التأكيد.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 grid grid-cols-2 gap-4">
            <div><p className="text-sm text-gray-500">البنك</p><p className="font-medium">{BANK_NAMES[preview.bankName] ?? preview.bankName}</p></div>
            <div><p className="text-sm text-gray-500">الملف</p><p className="font-medium">{fileName}</p></div>
            <div><p className="text-sm text-gray-500">من تاريخ</p><p className="font-medium">{fmtDate(preview.fromDate)}</p></div>
            <div><p className="text-sm text-gray-500">إلى تاريخ</p><p className="font-medium">{fmtDate(preview.toDate)}</p></div>
            <div><p className="text-sm text-gray-500">المدين الإجمالي (د.ك)</p><p className="font-bold text-red-600">{fmtAmount(preview.totalDebits)}</p></div>
            <div><p className="text-sm text-gray-500">الدائن الإجمالي (د.ك)</p><p className="font-bold text-green-600">{fmtAmount(preview.totalCredits)}</p></div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleExecute}
              disabled={loading}
              className="px-8 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-bold"
            >
              {loading ? 'جارٍ الاستيراد…' : 'تأكيد الاستيراد'}
            </button>
            <button onClick={() => setStep('preview')} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              رجوع
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === 'done' && result && (
        <div className="text-center space-y-6 py-8">
          <div className="text-6xl">✅</div>
          <h2 className="text-2xl font-bold text-green-700">تم الاستيراد بنجاح!</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-right max-w-md mx-auto">
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-500">البنك</span><span className="font-medium">{BANK_NAMES[result.bankName] ?? result.bankName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">إجمالي الصفوف</span><span className="font-medium">{result.totalRows.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">المدين (د.ك)</span><span className="font-bold text-red-600">{fmtAmount(result.totalDebits)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">الدائن (د.ك)</span><span className="font-bold text-green-600">{fmtAmount(result.totalCredits)}</span></div>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <a
              href={`#/bank-reconciliation/${result.importId}`}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              الانتقال إلى مساحة المطابقة
            </a>
            <button onClick={reset} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              استيراد كشف آخر
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
