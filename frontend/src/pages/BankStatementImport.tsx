import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PrivateAmount from '../components/PrivateAmount';
import * as XLSX from 'xlsx';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import {
  previewImport,
  executeImport,
  getTimeline,
  type StatementTransaction,
  type ImportPreviewSummary,
  type PreviewRow,
  type ImportResult,
  type TimelineResult,
} from '../api/bankStatementImport';
import {
  CLIENT_STATEMENT_CONFIGS,
  detectBankTemplateClient,
  parseExcelRowsClient,
  parseCsvRowsClient,
  detectCsvDelimiterClient,
} from '../utils/bankStatementParser';

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

// Arabic labels for validation rule codes shown in the preview table
const VALIDATION_LABELS: Record<string, string> = {
  INVALID_DATE:          'تاريخ غير صالح',
  INVALID_CURRENCY:      'عملة غير معروفة',
  NEGATIVE_AMOUNT:       'مبلغ سالب',
  ZERO_AMOUNT:           'المبلغ صفر',
  MISSING_DESCRIPTION:   'وصف مفقود',
  BALANCE_BREAK:         'عدم تطابق الرصيد',
  DUPLICATE_IN_FILE:     'مكرر في الملف',
  MISSING_TRANSACTION_ID:'رقم معاملة مفقود',
  DESCRIPTION_TOO_LONG:  'الوصف طويل جداً',
};

// Arabic labels for transaction category badges
const CATEGORY_LABELS: Record<string, string> = {
  CASH_WITHDRAWAL: 'سحب نقدي',
  CHEQUE_PAYMENT:  'دفع شيك',
  BANK_TRANSFER:   'تحويل بنكي',
};

function rowReasonLabel(row: PreviewRow): string {
  const all = [...row.errors, ...row.warnings];
  if (all.length === 0) return '';
  return all.map((r) => VALIDATION_LABELS[r] ?? r).join('، ');
}

const STATUS_BADGE: Record<string, string> = {
  KWD:       'bg-green-100 text-green-800',
  USD:       'bg-blue-100  text-blue-800',
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
  const navigate          = useNavigate();
  const fileInputRef      = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<Step>('upload');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // File state
  const [fileName, setFileName]   = useState('');
  const [fileType, setFileType]   = useState<'excel' | 'csv' | null>(null);

  // Raw data stored so we can re-parse when the user manually selects a bank
  const [rawSheetData, setRawSheetData] = useState<unknown[][] | null>(null);
  const [rawCsvText,   setRawCsvText]   = useState<string | null>(null);

  // Detected bank
  const [detectedBank, setDetectedBank] = useState<string>('UNKNOWN');
  const [parsedRows, setParsedRows]     = useState<StatementTransaction[]>([]);
  const [headers, setHeaders]           = useState<string[]>([]);

  // Preview state
  const [preview, setPreview]     = useState<ImportPreviewSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Import result
  const [result, setResult]       = useState<ImportResult | null>(null);

  // Timeline (unified account view)
  const [timeline, setTimeline]        = useState<TimelineResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showTimeline, setShowTimeline]  = useState(false);

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

        setRawSheetData(data);
        setRawCsvText(null);

        // Use all non-empty cells from row 0 as detected headers (for display only)
        const headerRow = (data[0] ?? []) as unknown[];
        detectedHeaders = headerRow.map((h) => (h != null ? String(h).trim() : '')).filter(Boolean);
        const tpl = detectBankTemplateClient(detectedHeaders);
        setDetectedBank(tpl.bankName);
        rows = parseExcelRowsClient(data, tpl);
      } else {
        const text = await file.text();
        setRawCsvText(text);
        setRawSheetData(null);

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

  // ── Re-parse with a different bank template ─────────────────────────────────

  const handleBankChange = useCallback((newBank: string) => {
    setDetectedBank(newBank);
    const tpl = CLIENT_STATEMENT_CONFIGS[newBank] ?? CLIENT_STATEMENT_CONFIGS.UNKNOWN!;
    let rows: StatementTransaction[] = [];
    if (fileType === 'excel' && rawSheetData) {
      rows = parseExcelRowsClient(rawSheetData, tpl);
    } else if (fileType === 'csv' && rawCsvText) {
      rows = parseCsvRowsClient(rawCsvText, tpl);
    }
    if (rows.length > 0) setParsedRows(rows);
  }, [fileType, rawSheetData, rawCsvText]);

  // ── Reset ───────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setFileType(null);
    setDetectedBank('UNKNOWN');
    setParsedRows([]);
    setHeaders([]);
    setRawSheetData(null);
    setRawCsvText(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setTimeline(null);
    setShowTimeline(false);
  }, []);

  const handleLoadTimeline = useCallback(async (accountKey: string) => {
    setTimelineLoading(true);
    try {
      const tl = await getTimeline(accountKey);
      setTimeline(tl);
      setShowTimeline(true);
    } catch {
      // Timeline load failure is non-blocking
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasPermission('bankStatementImport.create')) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }} dir="rtl">
        ليس لديك صلاحية لإضافة كشوف بنكية.
      </div>
    );
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="page-head">
        <div>
          <h2>إضافة كشف إلى الحساب البنكي</h2>
          <p>أضف كشوف بيانات بنكية لإثراء سجلك الزمني وتحليل عملياتك المالية</p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 8px' }}>

        {/* Step indicator */}
        <div className="card panel" style={{ marginBottom: 20, padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEPS.map((s, i) => {
              const currentIdx = STEPS.findIndex((x) => x.id === step);
              const isDone = currentIdx > i;
              const isActive = step === s.id;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13,
                      background: isDone ? 'var(--success, #22c55e)' : isActive ? 'var(--primary)' : 'var(--surface-2)',
                      color: isDone || isActive ? '#fff' : 'var(--text-muted)',
                    }}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {s.labelAr}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: isDone ? 'var(--success, #22c55e)' : 'var(--border)', margin: '0 8px', marginBottom: 20 }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card panel" style={{ marginBottom: 16, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', padding: '12px 16px', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>خطأ: </span>{error}
          </div>
        )}

        {/* ── Step: Upload ── */}
        {step === 'upload' && (
          <div className="card panel" style={{ textAlign: 'center', padding: 48, cursor: 'pointer', border: '2px dashed var(--border)', transition: 'border-color 0.2s' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: 52, marginBottom: 16 }}>📂</div>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>اسحب ملف كشف الحساب أو انقر للاختيار</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Excel (.xlsx) أو CSV — الحد الأقصى 10 ميغابايت، 10,000 صف</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFileChange} />
          </div>
        )}

        {/* ── Step: Detect template ── */}
        {step === 'detect' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Detected info card */}
            <div className="card panel">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>نتيجة كشف البنك</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'الملف', value: fileName },
                  { label: 'البنك المكتشف', value: BANK_NAMES[detectedBank] ?? detectedBank, highlight: true },
                  { label: 'عدد الصفوف', value: parsedRows.length.toLocaleString() },
                  { label: 'نوع الملف', value: fileType === 'excel' ? 'Excel' : 'CSV' },
                ].map(({ label, value, highlight }) => (
                  <div key={label}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: highlight ? 'var(--primary)' : 'var(--text)' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Override bank */}
            <div className="card panel">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>تغيير البنك يدوياً (اختياري)</h3>
              <select
                value={detectedBank}
                onChange={(e) => handleBankChange(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, background: 'var(--surface)' }}
                title="اختر البنك"
              >
                {Object.entries(BANK_NAMES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Column headers */}
            <div className="card panel">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>الأعمدة المكتشفة في الكشف</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {headers.map((h) => (
                  <span key={h} style={{ padding: '4px 10px', background: 'var(--surface-2)', borderRadius: 20, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{h}</span>
                ))}
              </div>
            </div>

            {parsedRows.length === 0 && (
              <div style={{ padding: '12px 16px', background: '#FEF9C3', borderRadius: 8, fontSize: 13, color: '#78350F', border: '1px solid #FDE68A' }}>
                لم يتم العثور على معاملات قابلة للتحليل داخل الملف. يرجى التحقق من نوع الملف والبنك المحدد.
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handlePreview} disabled={previewLoading || parsedRows.length === 0} className="btn" style={{ minWidth: 140 }}>
                {previewLoading ? 'جارٍ التحليل…' : 'تحليل الكشف'}
              </button>
              <button onClick={reset} className="btn btn-secondary">إعادة تعيين</button>
            </div>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'إجمالي الصفوف', value: preview.totalRows.toLocaleString(), color: '#3B82F6' },
                { label: 'صالحة',         value: preview.valid.toLocaleString(),      color: '#22C55E' },
                { label: 'بها أخطاء',    value: preview.invalid.toLocaleString(),     color: '#EF4444' },
                { label: 'مطابقة',       value: preview.matched.toLocaleString(),     color: '#6366F1' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card panel" style={{ padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
                  <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Financial summary */}
            <div className="card panel">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>الملخص المالي</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>إجمالي المدين</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>إجمالي الدائن</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>المصاريف البنكية</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{preview.bankFees}</p>
                </div>
              </div>
            </div>

            {/* Coverage banner */}
            {preview.coverageSummary?.hasExisting && (
              <div className="card panel" style={{ background: '#EFF6FF', borderColor: '#BFDBFE', fontSize: 13, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div>
                  <strong style={{ color: '#1D4ED8' }}>يوجد بيانات مسبقة لهذا الحساب</strong>
                  <span style={{ color: '#1E40AF', marginInlineStart: 8 }}>
                    {preview.coverageSummary.existingCount.toLocaleString()} معاملة محفوظة
                    {preview.coverageSummary.existingFrom && ` — من ${fmtDate(preview.coverageSummary.existingFrom)}`}
                    {preview.coverageSummary.existingTo   && ` إلى ${fmtDate(preview.coverageSummary.existingTo)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Dedup analysis card */}
            {preview.dedupSummary && (
              <div className="card panel">
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>تحليل التكرارات</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'جديدة للاستيراد',    value: preview.dedupSummary.wouldInsert,        color: '#15803D', bg: '#DCFCE7' },
                    { label: 'مكررة (تخطي)',        value: preview.dedupSummary.wouldSkipExact,      color: '#92400E', bg: '#FEF3C7' },
                    { label: 'محتملة التكرار',      value: preview.dedupSummary.wouldSkipPotential,  color: '#9333EA', bg: '#F3E8FF' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} style={{ background: bg, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 11, color, marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>معدل الجدة: <strong style={{ color: '#15803D' }}>{Math.round(preview.dedupSummary.newDataRate * 100)}٪</strong></span>
                  <span>معدل التكرار: <strong style={{ color: '#B45309' }}>{Math.round(preview.dedupSummary.duplicateRate * 100)}٪</strong></span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>مفتاح الحساب: {preview.dedupSummary.accountKey}</span>
                </div>
              </div>
            )}

            {!preview.canImport && (
              <div className="card panel" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', fontSize: 13, padding: '12px 16px' }}>
                لا يمكن استيراد هذا الكشف — يوجد {preview.invalid} صف(وف) بها أخطاء. يرجى مراجعة الملف وإعادة رفعه.
              </div>
            )}

            {/* Transaction table */}
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>معاينة المعاملات ({preview.rows.length} صف)</h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 380 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                    <tr>
                      {['#', 'التاريخ', 'الوصف', 'مدين', 'دائن', 'حالة', 'ملاحظة', 'مطابقة'].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 500).map((row: PreviewRow) => {
                      const reason = rowReasonLabel(row);
                      const categoryLabel = row.bankFeeType ? CATEGORY_LABELS[row.bankFeeType] : null;
                      return (
                      <tr key={row.rowIndex} style={{ borderBottom: '1px solid var(--border)', background: row.errors.length > 0 ? '#FEF2F2' : row.warnings.length > 0 ? '#FFFBEB' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{row.rowIndex + 1}</td>
                        <td style={{ padding: '6px 10px' }}>{fmtDate(row.statementDate)}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>{row.description}</td>
                        <td style={{ padding: '6px 10px', color: '#EF4444', fontWeight: row.debit > 0 ? 600 : 400 }}>{row.debit > 0 ? fmtAmount(row.debit) : ''}</td>
                        <td style={{ padding: '6px 10px', color: '#22C55E', fontWeight: row.credit > 0 ? 600 : 400 }}>{row.credit > 0 ? fmtAmount(row.credit) : ''}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {row.errors.length > 0
                            ? <span style={{ padding: '2px 8px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>خطأ</span>
                            : row.warnings.length > 0
                            ? <span style={{ padding: '2px 8px', background: '#FEF9C3', color: '#92400E', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>تحذير</span>
                            : <span style={{ padding: '2px 8px', background: '#DCFCE7', color: '#166534', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>صالح</span>}
                          {row.isBankFee && <span style={{ marginInlineStart: 4, padding: '2px 8px', background: '#EDE9FE', color: '#5B21B6', borderRadius: 12, fontSize: 11 }}>رسوم</span>}
                          {!row.isBankFee && categoryLabel && <span style={{ marginInlineStart: 4, padding: '2px 8px', background: '#F0F9FF', color: '#0369A1', borderRadius: 12, fontSize: 11 }}>{categoryLabel}</span>}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#78350F', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={reason}>
                          {reason || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 11, color: '#6366F1' }}>
                          {row.matchResult.best ? `${row.matchResult.best.confidence}% — ${row.matchResult.best.ref}` : '—'}
                        </td>
                      </tr>
                      );
                    })}
                    {preview.rows.length > 500 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                          يُعرض 500 من {preview.rows.length} صف — جميع الصفوف ستُستورد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep('confirm')} disabled={!preview.canImport} className="btn" style={{ minWidth: 160 }}>
                متابعة للتأكيد
              </button>
              <button onClick={reset} className="btn btn-secondary">إلغاء</button>
            </div>
          </div>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card panel" style={{ background: '#FFFBEB', borderColor: '#FDE68A', padding: '20px 24px' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>تأكيد الاستيراد</h2>
              <p style={{ fontSize: 13, color: '#78350F' }}>
                سيتم استيراد <strong>{preview.totalRows}</strong> معاملة بنكية من كشف{' '}
                <strong>{BANK_NAMES[preview.bankName] ?? preview.bankName}</strong>.{' '}
                لا يمكن التراجع عن هذه العملية بعد التأكيد.
              </p>
            </div>

            <div className="card panel">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: 'البنك', value: BANK_NAMES[preview.bankName] ?? preview.bankName },
                  { label: 'الملف', value: fileName },
                  { label: 'من تاريخ', value: fmtDate(preview.fromDate) },
                  { label: 'إلى تاريخ', value: fmtDate(preview.toDate) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{value}</p>
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>المدين الإجمالي</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>الدائن الإجمالي</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleExecute} disabled={loading} className="btn" style={{ minWidth: 160, background: '#16A34A', borderColor: '#16A34A' }}>
                {loading ? 'جارٍ الاستيراد…' : 'تأكيد الاستيراد'}
              </button>
              <button onClick={() => setStep('preview')} className="btn btn-secondary">رجوع</button>
            </div>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 64 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#15803D' }}>تم الاستيراد بنجاح!</h2>

            <div className="card panel" style={{ textAlign: 'right', maxWidth: 460, width: '100%' }}>
              {[
                { label: 'البنك', value: BANK_NAMES[result.bankName] ?? result.bankName },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>المدين</span>
                <span style={{ fontWeight: 700, color: '#EF4444', fontSize: 13 }}><PrivateAmount value={result.totalDebits} /></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>الدائن</span>
                <span style={{ fontWeight: 700, color: '#22C55E', fontSize: 13 }}><PrivateAmount value={result.totalCredits} /></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>معاملات جديدة</span>
                <span style={{ fontWeight: 700, color: '#15803D', fontSize: 13 }}>{result.insertedNewCount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>مكررة (تم التخطي)</span>
                <span style={{ fontWeight: 700, color: '#B45309', fontSize: 13 }}>{result.skippedDuplicateCount.toLocaleString()}</span>
              </div>
              {result.potentialDuplicateCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>محتملة التكرار (للمراجعة)</span>
                  <span style={{ fontWeight: 700, color: '#7C3AED', fontSize: 13 }}>{result.potentialDuplicateCount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>معدل الجدة</span>
                <span style={{ fontWeight: 700, color: '#15803D', fontSize: 13 }}>{Math.round(result.newDataRate * 100)}٪</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>وقت المعالجة</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{result.executionTimeMs} مللي ثانية</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => navigate(`/bank-reconciliation/${result.importId}`)}
              >
                الانتقال إلى السجل الزمني
              </button>
              {result.accountKey && (
                <button
                  className="btn btn-secondary"
                  disabled={timelineLoading}
                  onClick={() => handleLoadTimeline(result.accountKey!)}
                >
                  {timelineLoading ? 'جارٍ التحميل…' : '📅 عرض التايملاين الموحد'}
                </button>
              )}
              <button onClick={reset} className="btn btn-secondary">استيراد كشف آخر</button>
            </div>
          </div>
        )}

        {/* ── Unified Timeline ── */}
        {showTimeline && timeline && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>التايملاين الموحد للحساب</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  مفتاح الحساب: <code style={{ fontSize: 11 }}>{timeline.accountKey}</code>
                  {' — '}{timeline.totalCount.toLocaleString()} معاملة من {timeline.importCount} استيراد
                  {timeline.fromDate && ` — من ${fmtDate(timeline.fromDate)}`}
                  {timeline.toDate   && ` إلى ${fmtDate(timeline.toDate)}`}
                </p>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowTimeline(false)}>إخفاء</button>
            </div>
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                      {['التاريخ', 'الوصف', 'مدين', 'دائن', 'الرصيد', 'الدفعة', 'الملف', 'الحالة'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.transactions.map((tx, i) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-subtle)' }}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{fmtDate(tx.statementDate)}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tx.description}>{tx.description}</td>
                        <td style={{ padding: '6px 10px', color: '#EF4444', whiteSpace: 'nowrap', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                          {tx.debit > 0 ? <PrivateAmount value={tx.debit} /> : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#16A34A', whiteSpace: 'nowrap', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                          {tx.credit > 0 ? <PrivateAmount value={tx.credit} /> : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
                          {tx.balance != null ? <PrivateAmount value={tx.balance} /> : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: '#6366F1', fontSize: 11 }}>{tx.importBatchLabel}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 11 }} title={tx.fileName}>{tx.fileName}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                            background: tx.reconcileStatus === 'MATCHED' ? '#DCFCE7' : tx.reconcileStatus === 'DUPLICATE' ? '#FEF3C7' : tx.reconcileStatus === 'REVIEW' ? '#F3E8FF' : '#F1F5F9',
                            color:      tx.reconcileStatus === 'MATCHED' ? '#15803D' : tx.reconcileStatus === 'DUPLICATE' ? '#B45309' : tx.reconcileStatus === 'REVIEW' ? '#7C3AED' : '#64748B',
                          }}>
                            {tx.reconcileStatus === 'MATCHED' ? 'مطابق' : tx.reconcileStatus === 'DUPLICATE' ? 'مكرر' : tx.reconcileStatus === 'REVIEW' ? 'مراجعة' : tx.reconcileStatus === 'IGNORED' ? 'متجاهل' : 'غير مطابق'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {timeline.totalCount > timeline.pageSize && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  يُعرض {timeline.transactions.length} من {timeline.totalCount.toLocaleString()} معاملة
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Suppress unused import warning — STATUS_BADGE is kept for future use
void STATUS_BADGE;
