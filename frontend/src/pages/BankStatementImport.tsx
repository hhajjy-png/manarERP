import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PrivateAmount from '../components/PrivateAmount';
import { formatNumber } from '../lib/format';
import { formatDate } from '../lib/date';
import * as XLSX from 'xlsx';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
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
  type CoverageWarning,
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

const STEPS: { id: Step; key: string; labelAr: string }[] = [
  { id: 'upload',  key: 'bank.import.step.upload',  labelAr: 'رفع الملف' },
  { id: 'detect',  key: 'bank.import.step.detect',  labelAr: 'كشف البنك' },
  { id: 'preview', key: 'bank.import.step.preview', labelAr: 'معاينة' },
  { id: 'confirm', key: 'bank.import.step.confirm', labelAr: 'تأكيد' },
  { id: 'done',    key: 'bank.import.step.done',    labelAr: 'مكتمل' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(v: number) {
  return formatNumber(v);
}

function fmtDate(iso: string | null) {
  return formatDate(iso);
}

// Validation rule codes shown in the preview table (i18n key + Arabic fallback label)
const VALIDATION_LABELS: Record<string, { key: string; label: string }> = {
  INVALID_DATE:           { key: 'bank.warning.invalid_date',                     label: 'تاريخ غير صالح' },
  INVALID_CURRENCY:       { key: 'bank.import.validation.invalid_currency',       label: 'عملة غير معروفة' },
  NEGATIVE_AMOUNT:        { key: 'bank.import.validation.negative_amount',        label: 'مبلغ سالب' },
  ZERO_AMOUNT:            { key: 'bank.import.validation.zero_amount',           label: 'المبلغ صفر' },
  MISSING_DESCRIPTION:    { key: 'bank.import.validation.missing_description',    label: 'وصف مفقود' },
  BALANCE_BREAK:          { key: 'bank.import.validation.balance_break',          label: 'عدم تطابق الرصيد' },
  DUPLICATE_IN_FILE:      { key: 'bank.import.validation.duplicate_in_file',      label: 'مكرر في الملف' },
  MISSING_TRANSACTION_ID: { key: 'bank.import.validation.missing_transaction_id', label: 'رقم معاملة مفقود' },
  DESCRIPTION_TOO_LONG:   { key: 'bank.import.validation.description_too_long',   label: 'الوصف طويل جداً' },
};

function validationLabelFor(code: string, t: (key: string) => string): string {
  const entry = VALIDATION_LABELS[code];
  return entry ? t(entry.key) : code;
}

// Transaction category badges (i18n key + Arabic fallback label)
const CATEGORY_LABELS: Record<string, { key: string; label: string }> = {
  CASH_WITHDRAWAL: { key: 'bank.cat.cash_withdrawal',         label: 'سحب نقدي' },
  CHEQUE_PAYMENT:  { key: 'bank.presentation.cheque_payment', label: 'دفع شيك' },
  BANK_TRANSFER:   { key: 'opt.sal.payment.bank_transfer',    label: 'تحويل بنكي' },
};

function categoryLabelFor(code: string, t: (key: string) => string): string {
  const entry = CATEGORY_LABELS[code];
  return entry ? t(entry.key) : code;
}

function rowReasonLabel(row: PreviewRow, t: (key: string) => string): string {
  const all = [...row.errors, ...row.warnings];
  if (all.length === 0) return '';
  return all.map((r) => validationLabelFor(r, t)).join(t('bank.import.list_separator'));
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

const BANK_NAMES: Record<string, { key: string; label: string }> = {
  NBK:         { key: 'bank.name.nbk',         label: 'بنك الكويت الوطني' },
  KFH:         { key: 'bank.name.kfh',         label: 'بيت التمويل الكويتي' },
  GULF_BANK:   { key: 'bank.name.gulf',        label: 'بنك الخليج' },
  BOUBYAN:     { key: 'bank.name.boubyan',     label: 'بنك بوبيان' },
  WARBA:       { key: 'bank.name.warba',       label: 'بنك وربة' },
  AHLI_UNITED: { key: 'bank.name.ahli_united', label: 'البنك الأهلي المتحد' },
  UNKNOWN:     { key: 'bank.name.unknown',     label: 'بنك غير معروف' },
};

function bankLabelFor(code: string, t: (key: string) => string): string {
  const entry = BANK_NAMES[code];
  return entry ? t(entry.key) : code;
}

// ── Coverage warning helpers ──────────────────────────────────────────────────

const COVERAGE_WARNING_CONFIG: Record<CoverageWarning, { icon: string; titleKey: string; titleAr: string; bodyKey: string; bodyAr: string; bg: string; border: string; titleColor: string; bodyColor: string }> = {
  FULLY_DUPLICATE: {
    icon:       '⚠️',
    titleKey:   'bank.import.coverage.fully_duplicate.title',
    titleAr:    'يبدو أن هذا الكشف مستورد بالفعل',
    bodyKey:    'bank.import.coverage.fully_duplicate.body',
    bodyAr:     'نطاق تواريخ هذا الكشف يقع بالكامل ضمن سجل الحساب الموجود. سيتم تخطي المعاملات المكررة تلقائياً، والمعاملات الجديدة ستُضاف بأمان.',
    bg:         '#FFFBEB',
    border:     '#FDE68A',
    titleColor: '#92400E',
    bodyColor:  '#78350F',
  },
  OVERLAPPING: {
    icon:       '📅',
    titleKey:   'bank.import.coverage.overlapping.title',
    titleAr:    'تداخل في الفترة الزمنية — آمن تماماً',
    bodyKey:    'bank.import.coverage.overlapping.body',
    bodyAr:     'نطاق هذا الكشف يتداخل مع بيانات موجودة. النظام سيتخطى المعاملات المكررة تلقائياً ويضيف فقط المعاملات الجديدة — لا داعي للقلق.',
    bg:         '#EFF6FF',
    border:     '#BFDBFE',
    titleColor: '#1D4ED8',
    bodyColor:  '#1E40AF',
  },
  GAP_BEFORE: {
    icon:       '📅',
    titleKey:   'bank.import.coverage.gap_before.title',
    titleAr:    'بيانات تاريخية جديدة',
    bodyKey:    'bank.import.coverage.gap_before.body',
    bodyAr:     'هذا الكشف يحتوي على بيانات أقدم من السجل الموجود، مما سيثري السجل الزمني للحساب بفترة إضافية.',
    bg:         '#F0FDF4',
    border:     '#BBF7D0',
    titleColor: '#15803D',
    bodyColor:  '#166534',
  },
  GAP_AFTER: {
    icon:       '📅',
    titleKey:   'bank.import.coverage.gap_after.title',
    titleAr:    'امتداد السجل للأمام',
    bodyKey:    'bank.import.coverage.gap_after.body',
    bodyAr:     'هذا الكشف يمتد ما بعد نهاية السجل الموجود وسيضيف بيانات حديثة جديدة.',
    bg:         '#F0FDF4',
    border:     '#BBF7D0',
    titleColor: '#15803D',
    bodyColor:  '#166534',
  },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function BankStatementImport() {
  const { hasPermission } = useAuth();
  const { t }             = useT();
  const navigate          = useNavigate();
  const fileInputRef      = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<Step>('upload');
  const [loading, setLoading]     = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
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
      setError(t('bank.import.error.file_too_large'));
      return;
    }

    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isCsv   = name.endsWith('.csv');

    if (!isExcel && !isCsv) {
      setError(t('bank.import.error.unsupported_file_type'));
      return;
    }

    setFileName(file.name);
    setFileType(isExcel ? 'excel' : 'csv');
    setFileLoading(true);

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
      setError(`${t('bank.import.error.file_read_failed')}: ${errorMessage(err)}`);
    } finally {
      setFileLoading(false);
    }
  }, [t]);

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
    setFileLoading(false);
    setLoading(false);
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
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('bank.import.no_permission')}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="page-head">
        <div>
          <h2>{t('bank.import.page_title')}</h2>
          <p>{t('bank.import.page_subtitle')}</p>
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
                      {t(s.key)}
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
          <div className="card panel" style={{ marginBottom: 16, background: 'var(--red-light)', borderColor: 'var(--red)', color: 'var(--red)', padding: '12px 16px', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{t('msg.error')}: </span>{error}
          </div>
        )}

        {/* ── Step: Upload ── */}
        {step === 'upload' && (
          <div className="card panel" style={{ textAlign: 'center', padding: 48, cursor: fileLoading ? 'wait' : 'pointer', border: '2px dashed var(--border)', transition: 'border-color 0.2s', opacity: fileLoading ? 0.7 : 1 }}
            onDragOver={(e) => { if (!fileLoading) e.preventDefault(); }}
            onDrop={(e) => { if (!fileLoading) onDrop(e); }}
            onClick={() => { if (!fileLoading) fileInputRef.current?.click(); }}
            onMouseEnter={(e) => { if (!fileLoading) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ fontSize: 52, marginBottom: 16 }}>{fileLoading ? '⏳' : '📂'}</div>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              {fileLoading ? t('bank.import.upload.reading') : t('bank.import.upload.dropzone_hint')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('bank.import.upload.file_hint')}</p>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFileChange} disabled={fileLoading} />
          </div>
        )}

        {/* ── Step: Detect template ── */}
        {step === 'detect' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Detected info card */}
            <div className="card panel">
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t('bank.import.detect.result_title')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: t('col.backup.file'), value: fileName },
                  { label: t('bank.import.detect.detected_bank'), value: bankLabelFor(detectedBank, t), highlight: true },
                  { label: t('bank.import.detect.row_count'), value: parsedRows.length.toLocaleString() },
                  { label: t('bank.import.detect.file_type'), value: fileType === 'excel' ? 'Excel' : 'CSV' },
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
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('bank.import.detect.change_bank_manually')}</h3>
              <select
                value={detectedBank}
                onChange={(e) => handleBankChange(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, background: 'var(--surface)' }}
                title={t('bank.import.detect.select_bank_title')}
              >
                {Object.entries(BANK_NAMES).map(([key, entry]) => (
                  <option key={key} value={key}>{t(entry.key)}</option>
                ))}
              </select>
            </div>

            {/* Column headers */}
            <div className="card panel">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('bank.import.detect.detected_columns')}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {headers.map((h) => (
                  <span key={h} style={{ padding: '4px 10px', background: 'var(--surface-2)', borderRadius: 20, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{h}</span>
                ))}
              </div>
            </div>

            {parsedRows.length === 0 && (
              <div style={{ padding: '12px 16px', background: 'var(--amber-light)', borderRadius: 8, fontSize: 13, color: 'var(--amber)', border: '1px solid var(--amber)' }}>
                {t('bank.import.detect.no_transactions_found')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handlePreview} disabled={previewLoading || loading || parsedRows.length === 0} className="btn" style={{ minWidth: 140 }}>
                {previewLoading ? t('bank.import.detect.analyzing') : t('bank.import.detect.analyze_button')}
              </button>
              <button onClick={reset} disabled={previewLoading || loading} className="btn btn-secondary">{t('bank.import.reset')}</button>
            </div>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* KPI summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: t('import.summary.total'),   value: preview.totalRows.toLocaleString(), color: '#3B82F6' },
                { label: t('import.summary.valid'),    value: preview.valid.toLocaleString(),      color: '#22C55E' },
                { label: t('import.summary.invalid'),  value: preview.invalid.toLocaleString(),     color: '#EF4444' },
                { label: t('bank.import.matched'),      value: preview.matched.toLocaleString(),     color: '#6366F1' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card panel" style={{ padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
                  <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Financial summary */}
            <div className="card panel">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('action.financial_summary')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('lbl.acc.total_debit')}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('lbl.acc.total_credit')}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bank.import.preview.bank_fees')}</p>
                  <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{preview.bankFees}</p>
                </div>
              </div>
            </div>

            {/* Coverage banner */}
            {preview.coverageSummary?.hasExisting && (() => {
              const cs  = preview.coverageSummary!;
              const cfg = cs.coverageWarning ? COVERAGE_WARNING_CONFIG[cs.coverageWarning] : null;
              return (
                <div className="card panel" style={{
                  background: cfg?.bg ?? '#EFF6FF',
                  borderColor: cfg?.border ?? '#BFDBFE',
                  fontSize: 13,
                  padding: '12px 16px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{cfg?.icon ?? '📅'}</span>
                  <div>
                    <div style={{ fontWeight: 700, color: cfg?.titleColor ?? '#1D4ED8', marginBottom: 4 }}>
                      {cfg ? t(cfg.titleKey) : t('bank.import.coverage.default_title')}
                    </div>
                    {cfg?.bodyKey && (
                      <div style={{ color: cfg.bodyColor, marginBottom: 6 }}>{t(cfg.bodyKey)}</div>
                    )}
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {t('bank.import.coverage.transactions_on_record', { count: cs.existingCount.toLocaleString() })}
                      {cs.existingFrom && ` — ${t('bank.import.range_from')} ${fmtDate(cs.existingFrom)}`}
                      {cs.existingTo   && ` ${t('bank.import.range_to')} ${fmtDate(cs.existingTo)}`}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Dedup analysis card */}
            {preview.dedupSummary && (
              <div className="card panel">
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{t('bank.import.dedup.title')}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: t('bank.import.dedup.new_for_import'),      value: preview.dedupSummary.wouldInsert,        color: '#15803D', bg: '#DCFCE7' },
                    { label: t('bank.import.dedup.duplicate_skip'),      value: preview.dedupSummary.wouldSkipExact,      color: '#92400E', bg: '#FEF3C7' },
                    { label: t('bank.import.dedup.potential_duplicate'), value: preview.dedupSummary.wouldSkipPotential,  color: '#9333EA', bg: '#F3E8FF' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} style={{ background: bg, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 11, color, marginBottom: 4 }}>{label}</p>
                      <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{value.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 24, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>{t('bank.import.dedup.new_data_rate')}: <strong style={{ color: '#15803D' }}>{Math.round(preview.dedupSummary.newDataRate * 100)}{t('bank.import.percent_sign')}</strong></span>
                  <span>{t('bank.import.dedup.duplicate_rate')}: <strong style={{ color: '#B45309' }}>{Math.round(preview.dedupSummary.duplicateRate * 100)}{t('bank.import.percent_sign')}</strong></span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('bank.import.dedup.account_key')}: {preview.dedupSummary.accountKey}</span>
                </div>
              </div>
            )}

            {!preview.canImport && (
              <div className="card panel" style={{ background: 'var(--red-light)', borderColor: 'var(--red)', color: 'var(--red)', fontSize: 13, padding: '12px 16px' }}>
                {t('bank.import.cannot_import_msg', { count: preview.invalid })}
              </div>
            )}

            {/* Transaction table */}
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t('bank.import.preview.table_title', { count: preview.rows.length })}</h3>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 380 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                    <tr>
                      {['#', t('col.date'), t('col.description'), t('col.acc.debit'), t('col.acc.credit'), t('bank.import.col.status'), t('bank.import.col.note'), t('bank.import.col.match')].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 500).map((row: PreviewRow) => {
                      const reason = rowReasonLabel(row, t);
                      const categoryLabel = row.bankFeeType ? categoryLabelFor(row.bankFeeType, t) : null;
                      return (
                      <tr key={row.rowIndex} style={{ borderBottom: '1px solid var(--border)', background: row.errors.length > 0 ? '#FEF2F2' : row.warnings.length > 0 ? '#FFFBEB' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{row.rowIndex + 1}</td>
                        <td style={{ padding: '6px 10px' }}>{fmtDate(row.statementDate)}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>{row.description}</td>
                        <td style={{ padding: '6px 10px', color: '#EF4444', fontWeight: row.debit > 0 ? 600 : 400 }}>{row.debit > 0 ? fmtAmount(row.debit) : ''}</td>
                        <td style={{ padding: '6px 10px', color: '#22C55E', fontWeight: row.credit > 0 ? 600 : 400 }}>{row.credit > 0 ? fmtAmount(row.credit) : ''}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {row.errors.length > 0
                            ? <span style={{ padding: '2px 8px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{t('msg.error')}</span>
                            : row.warnings.length > 0
                            ? <span style={{ padding: '2px 8px', background: 'var(--amber-light)', color: 'var(--amber)', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{t('bank.import.row.warning_badge')}</span>
                            : <span style={{ padding: '2px 8px', background: 'var(--green-light)', color: 'var(--green)', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{t('import.status.valid')}</span>}
                          {row.isBankFee && <span style={{ marginInlineStart: 4, padding: '2px 8px', background: 'var(--violet-light)', color: 'var(--violet)', borderRadius: 12, fontSize: 11 }}>{t('bank.import.row.fee_badge')}</span>}
                          {!row.isBankFee && categoryLabel && <span style={{ marginInlineStart: 4, padding: '2px 8px', background: 'var(--blue-light)', color: 'var(--blue)', borderRadius: 12, fontSize: 11 }}>{categoryLabel}</span>}
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
                          {t('bank.import.preview.showing_note', { total: preview.rows.length })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setStep('confirm')} disabled={!preview.canImport} className="btn" style={{ minWidth: 160 }}>
                {t('bank.import.continue_to_confirm')}
              </button>
              <button onClick={reset} className="btn btn-secondary">{t('action.cancel')}</button>
            </div>
          </div>
        )}

        {/* ── Step: Confirm ── */}
        {step === 'confirm' && preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card panel" style={{ background: 'var(--amber-light)', borderColor: 'var(--amber)', padding: '20px 24px' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>{t('bank.import.confirm_import')}</h2>
              <p style={{ fontSize: 13, color: 'var(--amber)' }}>
                {t('bank.import.confirm.will_import_prefix')} <strong>{preview.totalRows}</strong> {t('bank.import.confirm.bank_transactions_from')}{' '}
                <strong>{bankLabelFor(preview.bankName, t)}</strong>.{' '}
                {t('bank.import.confirm.irreversible_notice')}
              </p>
            </div>

            <div className="card panel">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  { label: t('col.cheque.bank'), value: bankLabelFor(preview.bankName, t) },
                  { label: t('col.backup.file'), value: fileName },
                  { label: t('filter.date_from'), value: fmtDate(preview.fromDate) },
                  { label: t('filter.date_to'), value: fmtDate(preview.toDate) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 600 }}>{value}</p>
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bank.import.confirm.total_debit_suffix')}</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bank.import.confirm.total_credit_suffix')}</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={handleExecute} disabled={loading || !preview?.canImport} className="btn" style={{ minWidth: 160, background: '#16A34A', borderColor: '#16A34A' }}>
                {loading ? t('bank.import.confirm.importing') : t('bank.import.confirm_import')}
              </button>
              <button onClick={() => setStep('preview')} disabled={loading} className="btn btn-secondary">{t('btn.inv.back')}</button>
            </div>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && result && (
          <div style={{ textAlign: 'center', padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{ fontSize: 64 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#15803D' }}>{t('bank.import.done.success_title')}</h2>

            <div className="card panel" style={{ textAlign: 'right', maxWidth: 460, width: '100%' }}>
              {[
                { label: t('col.cheque.bank'), value: bankLabelFor(result.bankName, t) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.debit')}</span>
                <span style={{ fontWeight: 700, color: '#EF4444', fontSize: 13 }}><PrivateAmount value={result.totalDebits} /></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.credit')}</span>
                <span style={{ fontWeight: 700, color: '#22C55E', fontSize: 13 }}><PrivateAmount value={result.totalCredits} /></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.new_transactions')}</span>
                <span style={{ fontWeight: 700, color: '#15803D', fontSize: 13 }}>{result.insertedNewCount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.duplicates_skipped')}</span>
                <span style={{ fontWeight: 700, color: '#B45309', fontSize: 13 }}>{result.skippedDuplicateCount.toLocaleString()}</span>
              </div>
              {result.potentialDuplicateCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.potential_duplicates')}</span>
                  <span style={{ fontWeight: 700, color: '#7C3AED', fontSize: 13 }}>{result.potentialDuplicateCount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.dedup.new_data_rate')}</span>
                <span style={{ fontWeight: 700, color: '#15803D', fontSize: 13 }}>{Math.round(result.newDataRate * 100)}{t('bank.import.percent_sign')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('bank.import.done.processing_time')}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{result.executionTimeMs} {t('bank.import.done.milliseconds_suffix')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => navigate(`/bank-reconciliation/${result.importId}`)}
              >
                {t('bank.import.done.go_to_timeline')}
              </button>
              {result.accountKey && (
                <button
                  className="btn btn-secondary"
                  disabled={timelineLoading}
                  onClick={() => handleLoadTimeline(result.accountKey!)}
                >
                  {timelineLoading ? t('msg.loading') : `📅 ${t('bank.import.done.view_unified_timeline_label')}`}
                </button>
              )}
              <button onClick={reset} className="btn btn-secondary">{t('bank.import.done.import_another')}</button>
            </div>
          </div>
        )}

        {/* ── Unified Timeline ── */}
        {showTimeline && timeline && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{t('bank.import.timeline.title')}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {t('bank.import.dedup.account_key')}: <code style={{ fontSize: 11 }}>{timeline.accountKey}</code>
                  {' — '}{t('bank.import.timeline.summary_line', { total: timeline.totalCount.toLocaleString(), count: timeline.importCount })}
                  {timeline.fromDate && ` — ${t('bank.import.range_from')} ${fmtDate(timeline.fromDate)}`}
                  {timeline.toDate   && ` ${t('bank.import.range_to')} ${fmtDate(timeline.toDate)}`}
                </p>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowTimeline(false)}>{t('bank.import.timeline.hide')}</button>
            </div>
            <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                      {[t('col.date'), t('col.description'), t('col.acc.debit'), t('col.acc.credit'), t('bank.import.timeline.col.balance'), t('bank.import.timeline.col.batch'), t('col.backup.file'), t('bank.import.col.status')].map(h => (
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
                            {tx.reconcileStatus === 'MATCHED' ? t('bank.status.matched') : tx.reconcileStatus === 'DUPLICATE' ? t('import.status.duplicate') : tx.reconcileStatus === 'REVIEW' ? t('bank.import.timeline.status.review') : tx.reconcileStatus === 'IGNORED' ? t('bank.import.timeline.status.ignored') : t('bank.status.unmatched')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {timeline.totalCount > timeline.pageSize && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  {t('bank.import.timeline.showing_note', { shown: timeline.transactions.length, total: timeline.totalCount.toLocaleString() })}
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
