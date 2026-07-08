import { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../stores/authStore';
import { errorMessage } from '../api/client';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';
import { formatDate, formatDateTime } from '../lib/date';
import {
  previewImport, executeImport, exportReportExcel, exportReportPdf,
  type BankTemplate, type ParsedBankRow, type PreviewSummary, type ImportReport,
} from '../api/payrollBankImport';
import { parseWorkbook, BANK_CONFIGS, MAX_ROWS } from './payrollBankImportParser';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadBlob } from '../utils/exportUtils';

// ── Wizard state ──────────────────────────────────────────────────────────────

type WizardStep = 'upload' | 'preview' | 'confirm' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function fmtDate(iso: string | null): string {
  return formatDate(iso);
}

function fmtAmount(n: number): string {
  return formatNumber(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { id: WizardStep; label: string; visual: string }[] = [
    { id: 'upload',  label: 'رفع الملف',    visual: '① ' },
    { id: 'preview', label: 'معاينة وتحقق', visual: '② ' },
    { id: 'preview', label: 'ملخص التحقق',  visual: '③ ' },
    { id: 'confirm', label: 'تأكيد',        visual: '④ ' },
    { id: 'done',    label: 'اكتمل',        visual: '⑤ ' },
  ];
  const stepOrder: WizardStep[] = ['upload', 'preview', 'confirm', 'done'];
  const currentIdx = stepOrder.indexOf(current);

  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 28, position: 'relative' }}>
      {/* connector line */}
      <div style={{ position: 'absolute', top: 16, right: 32, left: 32, height: 2, background: 'var(--border, #e5e7eb)', zIndex: 0 }} />
      {steps.map((step, i) => {
        const stepStateIdx = stepOrder.indexOf(step.id);
        const done    = stepStateIdx < currentIdx;
        const active  = stepStateIdx === currentIdx;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              background: done ? '#16a34a' : active ? 'var(--color-brand, #1d4e6f)' : 'var(--bg-card, #fff)',
              color:      done ? '#fff'    : active ? '#fff'                         : 'var(--text-muted, #9ca3af)',
              border:     done ? 'none'    : active ? 'none'                         : '2px solid var(--border, #d1d5db)',
            }}>
              {done ? '✓' : String(i + 1)}
            </div>
            <span style={{
              fontSize: 11, marginTop: 6, fontWeight: active ? 700 : 400,
              color: active ? 'var(--text-primary, #111827)' : done ? '#16a34a' : 'var(--text-muted, #9ca3af)',
              textAlign: 'center',
            }}>
              {step.visual}{step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 8, padding: '14px 20px', minWidth: 110, textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #dc2626', borderRadius: 6,
      padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 14,
    }}>
      {msg}
    </div>
  );
}

function btn(variant: 'primary' | 'secondary' | 'danger' | 'success', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 6, fontWeight: 600, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: 'none', fontFamily: 'inherit', transition: 'opacity .15s',
  };
  if (variant === 'primary')   return { ...base, background: 'var(--color-brand, #1d4e6f)', color: '#fff' };
  if (variant === 'danger')    return { ...base, background: '#dc2626', color: '#fff' };
  if (variant === 'success')   return { ...base, background: '#16a34a', color: '#fff' };
  return { ...base, background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #374151)' };
}

const TH: React.CSSProperties = { padding: '10px 12px', textAlign: 'start', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', background: 'var(--bg-header, #f9fafb)' };
const TD: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top', fontSize: 13 };

function StatusPill({ status, errors }: { status: 'valid'|'warning'|'error'; errors: string[] }) {
  const map = {
    valid:   { bg: '#dcfce7', color: '#16a34a', label: 'صالح' },
    warning: { bg: '#fef3c7', color: '#d97706', label: 'تحذير' },
    error:   { bg: '#fee2e2', color: '#dc2626', label: 'خطأ' },
  };
  const { bg, color, label } = map[status];
  return (
    <div>
      <span style={{ background: bg, color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{label}</span>
      {errors.length > 0 && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, lineHeight: 1.4 }}>{errors.join(' · ')}</div>
      )}
    </div>
  );
}

function MatchBadge({ confidence }: { confidence: string | null }) {
  if (!confidence) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const map: Record<string, { label: string; color: string }> = {
    CODE_100:        { label: 'كود — 100%', color: '#16a34a' },
    CIVIL_ID_100:    { label: 'مدني — 100%', color: '#16a34a' },
    BANK_ACCOUNT_90: { label: 'حساب — 90%', color: '#2563eb' },
    MANUAL:          { label: 'يدوية', color: '#d97706' },
  };
  const m = map[confidence] ?? { label: confidence, color: '#6b7280' };
  return <span style={{ fontSize: 11, color: m.color, fontWeight: 600 }}>{m.label}</span>;
}

// ── Upload step ───────────────────────────────────────────────────────────────

interface UploadStepProps {
  onParsed(result: { rows: ParsedBankRow[]; templateName: BankTemplate; fileName: string }): void;
}

function UploadStep({ onParsed }: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  function processFile(file: File) {
    setError(null);
    if (file.size > 10 * 1024 * 1024) { setError('حجم الملف كبير جداً — الحد الأقصى 10 م.ب'); return; }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) { setError('يرجى اختيار ملف Excel بصيغة .xlsx أو .xls فقط'); return; }

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array', cellDates: true });
        if (wb.SheetNames.length === 0) { setError('الملف فارغ'); setLoading(false); return; }

        const { rows, templateName } = parseWorkbook(wb);
        if (rows.length === 0) {
          setError('لم يتم العثور على صفوف. تأكد أن أسماء الأوراق بصيغة "mar-2025"، أو أن الملف يحتوي على ورقة "All_Transactions"، أو أنه تقرير "File Upload - Transactions Details"');
          setLoading(false);
          return;
        }
        if (rows.length > MAX_ROWS) {
          setError(`الملف يحتوي على أكثر من ${MAX_ROWS} صف — قسّم الملف إلى دفعات أصغر`);
          setLoading(false);
          return;
        }
        onParsed({ rows, templateName, fileName: file.name });
      } catch {
        setError('تعذّر قراءة الملف — تأكد أنه ملف Excel صحيح (.xlsx أو .xls)');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  return (
    <div>
      {error && <ErrorBanner msg={error} />}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-brand, #1d4e6f)' : 'var(--border, #d1d5db)'}`,
          borderRadius: 12, padding: '40px 24px', textAlign: 'center',
          background: dragging ? '#f0f4ff' : 'var(--bg-card, #fff)',
          cursor: 'pointer', transition: 'all .2s',
          marginBottom: 20,
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #111827)', margin: '0 0 6px' }}>
          اسحب الملف هنا أو انقر للاختيار
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
          .xlsx أو .xls — الحد الأقصى 10 م.ب — {MAX_ROWS.toLocaleString('ar')} صف كحد أقصى
        </p>
        {loading && <p style={{ marginTop: 12, color: '#2563eb', fontSize: 14 }}>جارٍ قراءة الملف…</p>}
      </div>

      {/* Bank support info */}
      <div style={{
        background: 'var(--bg-card, #f9fafb)', border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8, padding: '14px 18px', fontSize: 13, color: 'var(--text-muted, #6b7280)',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-secondary, #374151)' }}>البنوك المدعومة (كشف التحقق التلقائي):</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['NBK', 'KFH', 'Boubyan', 'GulfBank', 'Warba', 'AhliUnited'].map((b) => (
            <span key={b} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{b}</span>
          ))}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12 }}>
          يُحدَّد النموذج تلقائياً من أسماء الأعمدة. الصيغ المدعومة: أوراق شهرية بصيغة <code>mar-2025</code>، أو ورقة <code>All_Transactions</code>، أو تقرير <code>File Upload - Transactions Details</code> (يُكتشف عنوان الجدول تلقائياً حتى لو لم يكن في الصف الأول).
        </p>
      </div>
    </div>
  );
}

// ── Assistant (v1) — preview-only, non-blocking ───────────────────────────────

const WARNING_LABELS: Record<string, string> = {
  IBAN_INVALID:            'IBAN غير صالح',
  WEAK_MATCH:              'مطابقة ضعيفة (بالاسم)',
  INDEX_COLLISION_CIVILID: 'تعارض رقم مدني',
  INDEX_COLLISION_ACCOUNT: 'تعارض رقم حساب',
  DUP_IBAN_IN_FILE:        'IBAN مكرر في الملف',
  SALARY_ANOMALY_HIGH:     'مبلغ مرتفع بشكل غير معتاد',
  SALARY_ANOMALY_LOW:      'مبلغ منخفض بشكل غير معتاد',
  DUP_PAYROLL_DB:          'راتب مسجّل مسبقاً لنفس الشهر',
  DUP_EMPLOYEE_IN_FILE:    'موظف مكرّر لنفس الشهر بالملف',
  MONTH_REIMPORT:          'شهر سبق استيراده',
};

function warningLabel(code: string): string {
  return WARNING_LABELS[code] ?? code;
}

function qualityColor(score: number): string {
  if (score >= 85) return '#16a34a';
  if (score >= 60) return '#d97706';
  return '#dc2626';
}

function AssistantPanel({ assistant }: { assistant: NonNullable<PreviewSummary['assistant']> }) {
  const { variance: v, quality: q, collisions } = assistant;
  const warnEntries = Object.entries(assistant.warningCounts).sort((a, b) => b[1] - a[1]);
  const [showMissing, setShowMissing] = useState(false);
  const hasCollisions =
    collisions.civilId.length + collisions.bankAccount.length + collisions.employeeCode.length + collisions.ibanInFile.length > 0;

  const card: React.CSSProperties = {
    background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 8, padding: '12px 16px', minWidth: 150, flex: '1 1 150px',
  };
  const cardLabel: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted, #6b7280)', marginBottom: 4 };
  const cardValue: React.CSSProperties = { fontSize: 20, fontWeight: 700, fontFamily: 'monospace' };

  return (
    <div style={{
      background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 10, padding: '16px 18px', marginBottom: 20,
    }}>
      <p style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
        🤖 مساعد استيراد الرواتب
      </p>

      {/* Assistant cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={card}>
          <div style={cardLabel}>جودة الملف</div>
          <div style={{ ...cardValue, color: qualityColor(q.score) }}>{q.score}<span style={{ fontSize: 13 }}> / 100</span></div>
        </div>
        <div style={card}>
          <div style={cardLabel}>صحة IBAN</div>
          <div style={cardValue}>
            {assistant.ibanChecked === 0
              ? <span style={{ color: '#9ca3af' }}>—</span>
              : <span style={{ color: assistant.ibanInvalid > 0 ? '#dc2626' : '#16a34a' }}>{assistant.ibanValid}/{assistant.ibanChecked}</span>}
          </div>
        </div>
        <div style={card}>
          <div style={cardLabel}>موظفون في الملف</div>
          <div style={cardValue}>{v.employeesInFile.toLocaleString('ar')}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>موظفون غير مطابقين</div>
          <div style={{ ...cardValue, color: v.unmatchedCount > 0 ? '#dc2626' : '#9ca3af' }}>{v.unmatchedCount.toLocaleString('ar')}</div>
        </div>
      </div>

      {/* Variance panel */}
      <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>تقرير الفروقات (Variance)</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
          <span>الإجمالي المستورد: <strong style={{ fontFamily: 'monospace' }}>{formatCurrency(v.totalImported)}</strong></span>
          <span>المطابق: <strong style={{ fontFamily: 'monospace' }}>{fmtAmount(v.totalMatched)}</strong></span>
          <span>غير المطابق: <strong style={{ fontFamily: 'monospace', color: v.totalUnmatched > 0 ? '#dc2626' : undefined }}>{fmtAmount(v.totalUnmatched)}</strong></span>
          {v.previousPeriodLabel && v.previousTotal != null && (
            <>
              <span style={{ color: 'var(--text-muted, #6b7280)' }}>|</span>
              <span>الشهر السابق ({v.previousPeriodLabel}): <strong style={{ fontFamily: 'monospace' }}>{fmtAmount(v.previousTotal)}</strong></span>
              <span>
                الفرق:{' '}
                <strong style={{ fontFamily: 'monospace', color: (v.varianceAmount ?? 0) < 0 ? '#dc2626' : '#16a34a' }}>
                  {fmtAmount(v.varianceAmount ?? 0)}
                  {v.variancePercent != null && ` (${v.variancePercent > 0 ? '+' : ''}${formatPercent(v.variancePercent, 1)})`}
                </strong>
              </span>
            </>
          )}
          {!v.previousPeriodLabel && (
            <span style={{ color: 'var(--text-muted, #9ca3af)' }}>لا توجد بيانات شهر سابق للمقارنة</span>
          )}
        </div>

        {/* By-period breakdown */}
        {v.byPeriod.length > 1 && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {v.byPeriod.map((p) => (
              <span key={p.label} style={{ background: 'var(--bg-subtle, #f1f5f9)', borderRadius: 4, padding: '3px 10px', fontSize: 12 }}>
                {p.label}: {p.rowCount.toLocaleString('ar')} صف · {fmtAmount(p.totalAmount)}
                {p.existingInPeriod > 0 && <span style={{ color: '#d97706' }}> ⚠ سبق استيراده</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grouped warnings */}
      {warnEntries.length > 0 && (
        <div style={{ marginBottom: hasCollisions || v.missingEmployees.length > 0 ? 14 : 0 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700 }}>التنبيهات حسب النوع (غير مانعة للاستيراد):</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {warnEntries.map(([code, count]) => (
              <span key={code} style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#78350f', borderRadius: 4, padding: '3px 10px', fontSize: 12 }}>
                {warningLabel(code)}: <strong>{count.toLocaleString('ar')}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Collisions */}
      {hasCollisions && (
        <div style={{ marginBottom: v.missingEmployees.length > 0 ? 14 : 0, fontSize: 12, color: '#92400e' }}>
          ⚠ تعارضات محتملة في فهرس الموظفين:
          {collisions.civilId.length > 0 && ` أرقام مدنية مكررة (${collisions.civilId.length})`}
          {collisions.bankAccount.length > 0 && ` · حسابات مكررة (${collisions.bankAccount.length})`}
          {collisions.ibanInFile.length > 0 && ` · IBAN مكرر بالملف (${collisions.ibanInFile.length})`}
        </div>
      )}

      {/* Missing expected employees */}
      {v.missingEmployees.length > 0 && (
        <div style={{ fontSize: 13 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#b45309' }}>
            موظفون متوقعون وغير موجودين في الملف ({v.missingEmployees.length.toLocaleString('ar')}):
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(showMissing ? v.missingEmployees : v.missingEmployees.slice(0, 12)).map((m) => (
              <span key={m.employeeId} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                {m.fullName} ({m.code})
              </span>
            ))}
          </div>
          {v.missingEmployees.length > 12 && !showMissing && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#2563eb', cursor: 'pointer' }} onClick={() => setShowMissing(true)}>
              ↓ عرض الكل ({v.missingEmployees.length.toLocaleString('ar')})
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Preview + Validation step ─────────────────────────────────────────────────

interface PreviewStepProps {
  summary:      PreviewSummary;
  templateName: string;
  fileName:     string;
  onConfirm():  void;
  onBack():     void;
}

function PreviewStep({ summary, templateName, fileName, onConfirm, onBack }: PreviewStepProps) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? summary.rows : summary.rows.slice(0, 50);

  return (
    <div>
      {/* File + template info */}
      <div style={{
        background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 8, padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 13,
      }}>
        <span>📄 <strong>{fileName}</strong></span>
        <span style={{ color: 'var(--text-muted, #6b7280)' }}>|</span>
        <span>🏦 {BANK_CONFIGS[templateName as BankTemplate]?.nameAr ?? templateName}</span>
        <span style={{ color: 'var(--text-muted, #6b7280)' }}>|</span>
        <span>{summary.totalRows.toLocaleString('ar')} صف</span>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="إجمالي الصفوف"      value={summary.totalRows}          color="var(--text-primary, #111827)" />
        <KpiCard label="مطابقون"             value={summary.matched}             color="#16a34a" />
        <KpiCard label="غير مطابقين"         value={summary.unmatched}           color={summary.unmatched   > 0 ? '#dc2626' : '#9ca3af'} />
        <KpiCard label="صالحة"               value={summary.valid}               color="#16a34a" />
        <KpiCard label="تحذيرات"             value={summary.withWarnings}        color={summary.withWarnings > 0 ? '#d97706' : '#9ca3af'} />
        <KpiCard label="أخطاء"               value={summary.invalid}             color={summary.invalid      > 0 ? '#dc2626' : '#9ca3af'} />
        <KpiCard label="مكررة"               value={summary.duplicates}          color={summary.duplicates   > 0 ? '#ca8a04' : '#9ca3af'} />
        <KpiCard label="المبلغ الكلي (KWD)" value={fmtAmount(summary.totalAmount)} color="#1d4ed8" />
      </div>

      {/* Assistant (v1) — preview-only, non-blocking */}
      {summary.assistant && <AssistantPanel assistant={summary.assistant} />}

      {/* Cannot execute warning */}
      {!summary.canExecute && (
        <div style={{
          background: '#fef3c7', border: '1px solid #d97706', borderRadius: 6,
          padding: '10px 14px', marginBottom: 16, color: '#78350f', fontSize: 13,
        }}>
          ⚠️ لا يمكن التنفيذ — يجب أن تكون جميع الصفوف صحيحة ومطابقة لموظفين. راجع الأخطاء في الجدول أدناه.
        </div>
      )}

      {/* Preview table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['رقم الموظف', 'الموظف المطابق', 'المطابقة', 'الرقم المدني', 'IBAN', 'رقم الحساب', 'اسم المستفيد', 'المبلغ', 'العملة', 'تاريخ الدفع', 'رقم المعاملة', 'الحالة'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => {
              const rowBg = row.status === 'error'   ? '#fef2f2'
                          : row.status === 'warning' ? '#fffbeb' : 'transparent';
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, #f3f4f6)', background: rowBg }}>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{row.employeeCode ?? '—'}</td>
                  <td style={TD}>
                    {row.matchedEmployeeName
                      ? <span style={{ color: '#16a34a', fontWeight: 600 }}>{row.matchedEmployeeName}</span>
                      : <span style={{ color: '#dc2626' }}>غير محدد</span>}
                  </td>
                  <td style={TD}>
                    <MatchBadge confidence={row.matchConfidence} />
                    {row.assistantWarnings.length > 0 && (
                      <span
                        title={row.assistantWarnings.map((w) => w.messageAr).join('\n')}
                        style={{ marginInlineStart: 4, cursor: 'help' }}
                      >
                        🤖
                      </span>
                    )}
                  </td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{row.civilId ?? '—'}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{row.iban ?? '—'}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{row.bankAccount ?? '—'}</td>
                  <td style={TD}>{row.beneficiaryName || '—'}</td>
                  <td style={{ ...TD, fontFamily: 'monospace' }}>{fmtAmount(row.amount)}</td>
                  <td style={TD}>{row.currency}</td>
                  <td style={TD}>{fmtDate(row.paymentDate)}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{row.transactionId ?? '—'}</td>
                  <td style={TD}>
                    <StatusPill status={row.status} errors={[...row.errors, ...row.warnings, ...row.assistantWarnings.map((w) => w.messageAr)]} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Show more */}
      {summary.rows.length > 50 && !showAll && (
        <p style={{ fontSize: 13, color: '#2563eb', cursor: 'pointer', marginBottom: 16 }} onClick={() => setShowAll(true)}>
          ↓ عرض جميع الصفوف ({summary.rows.length})
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={btn('secondary')} onClick={onBack}>
          ← رجوع
        </button>
        <button
          type="button"
          style={btn('primary', !summary.canExecute)}
          disabled={!summary.canExecute}
          onClick={onConfirm}
          title={summary.canExecute ? undefined : 'أصلح الأخطاء أولاً قبل المتابعة'}
        >
          التالي: تأكيد الاستيراد ←
        </button>
      </div>
    </div>
  );
}

// ── Confirm step ──────────────────────────────────────────────────────────────

interface ConfirmStepProps {
  summary:     PreviewSummary;
  templateName: string;
  canExecute:  boolean;
  executing:   boolean;
  onExecute(): void;
  onBack():    void;
}

function ConfirmStep({ summary, templateName, canExecute, executing, onExecute, onBack }: ConfirmStepProps) {
  const [checked, setChecked] = useState(false);
  return (
    <div>
      {/* Summary box */}
      <div style={{
        background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10,
        padding: '20px 24px', marginBottom: 24,
      }}>
        <p style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0c4a6e' }}>
          ملخص عملية الاستيراد
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            { label: 'البنك', value: BANK_CONFIGS[templateName as BankTemplate]?.nameAr ?? templateName },
            { label: 'إجمالي الصفوف', value: summary.totalRows },
            { label: 'الصفوف الصالحة', value: summary.valid + summary.withWarnings },
            { label: 'المبلغ الإجمالي (KWD)', value: fmtAmount(summary.totalAmount) },
          ].map(({ label, value }) => (
            <div key={label} style={{ fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{label}: </span>
              <strong style={{ color: '#0c4a6e' }}>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div style={{
        background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
        padding: '14px 18px', marginBottom: 20, fontSize: 14, color: '#78350f',
      }}>
        <p style={{ margin: '0 0 8px', fontWeight: 700 }}>⚠️ تحذير — هذه العملية لا يمكن التراجع عنها</p>
        <p style={{ margin: 0 }}>سيتم إنشاء {summary.valid + summary.withWarnings} سجل دفع في قاعدة البيانات. تأكد من صحة البيانات قبل المتابعة.</p>
      </div>

      {/* Confirmation checkbox */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
        أؤكد صحة البيانات وأوافق على تنفيذ عملية الاستيراد
      </label>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={btn('secondary')} onClick={onBack} disabled={executing}>
          ← رجوع
        </button>
        <button
          type="button"
          style={btn('danger', !checked || executing || !canExecute)}
          disabled={!checked || executing || !canExecute}
          onClick={onExecute}
        >
          {executing ? '⏳ جارٍ الاستيراد…' : '⬆ تنفيذ الاستيراد'}
        </button>
      </div>
    </div>
  );
}

// ── Done step ─────────────────────────────────────────────────────────────────

interface DoneStepProps {
  report:     ImportReport;
  canExport:  boolean;
  onNewImport(): void;
}

function DoneStep({ report, canExport, onNewImport }: DoneStepProps) {
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  async function handleExport(format: 'excel' | 'pdf') {
    if (exporting) return;
    setExporting(format);
    try {
      if (format === 'excel') {
        const blob = await exportReportExcel(report);
        downloadBlob(blob, generateExportFileName({ reportName: ReportName.PayrollImport, extension: 'xlsx' }));
      } else {
        const blob = await exportReportPdf(report);
        downloadBlob(blob, generateExportFileName({ reportName: ReportName.PayrollImport, extension: 'pdf' }));
      }
    } catch {
      // silently ignore export errors — user can retry
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      {/* Success banner */}
      <div style={{
        background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12,
        padding: '20px 24px', marginBottom: 24,
      }}>
        <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#16a34a' }}>✅ اكتمل الاستيراد بنجاح</p>
        <p style={{ margin: 0, fontSize: 13, color: '#15803d' }}>
          تم تنفيذ الاستيراد في {formatDateTime(report.importedAt)} بواسطة {report.importedBy}
        </p>
      </div>

      {/* Result KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard label="تم استيراده"          value={report.imported}              color="#16a34a" />
        <KpiCard label="تم تخطيه"             value={report.skipped}               color={report.skipped > 0 ? '#dc2626' : '#9ca3af'} />
        <KpiCard label="بتحذيرات"             value={report.withWarnings}           color={report.withWarnings > 0 ? '#d97706' : '#9ca3af'} />
        <KpiCard label="المبلغ الكلي (KWD)"  value={fmtAmount(report.totalAmount)} color="#1d4ed8" />
      </div>

      {/* Export + actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        {canExport && (
          <>
            <button type="button" style={btn('secondary', exporting === 'excel')} onClick={() => handleExport('excel')} disabled={!!exporting}>
              {exporting === 'excel' ? '⏳ جارٍ التصدير…' : '📊 تصدير Excel'}
            </button>
            <button type="button" style={btn('secondary', exporting === 'pdf')} onClick={() => handleExport('pdf')} disabled={!!exporting}>
              {exporting === 'pdf' ? '⏳ جارٍ التصدير…' : '📄 تصدير PDF'}
            </button>
          </>
        )}
        <button type="button" style={btn('primary')} onClick={onNewImport}>
          + استيراد جديد
        </button>
      </div>

      {/* Report detail table */}
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>تفاصيل الاستيراد</h3>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['رقم الموظف', 'الاسم', 'الرقم المدني', 'المبلغ (KWD)', 'العملة', 'رقم المعاملة', 'تاريخ الدفع', 'الشهر/السنة', 'الحالة', 'الملاحظة'].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid var(--border, #f3f4f6)',
                background: row.status === 'skipped' ? '#fef2f2' : 'transparent',
              }}>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{row.employeeCode ?? '—'}</td>
                <td style={TD}>{row.employeeName ?? '—'}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12 }}>{row.civilId ?? '—'}</td>
                <td style={{ ...TD, fontFamily: 'monospace' }}>{fmtAmount(row.amount)}</td>
                <td style={TD}>{row.currency}</td>
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11 }}>{row.transactionId ?? '—'}</td>
                <td style={TD}>{fmtDate(row.paymentDate)}</td>
                <td style={TD}>{row.payrollMonth ? `${MONTH_AR[row.payrollMonth - 1]} ${row.payrollYear}` : '—'}</td>
                <td style={TD}>
                  <span style={{
                    background: row.status === 'imported' ? '#dcfce7' : '#fee2e2',
                    color:      row.status === 'imported' ? '#16a34a' : '#dc2626',
                    borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700,
                  }}>
                    {row.status === 'imported' ? 'مستورد' : 'متخطى'}
                  </span>
                </td>
                <td style={{ ...TD, fontSize: 12, color: '#6b7280' }}>{row.reason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PayrollBankImport() {
  const { hasPermission } = useAuth();

  if (!hasPermission('payrollBankImport.read')) {
    return (
      <div style={{ padding: 32, color: 'var(--text-muted, #6b7280)', fontSize: 14 }}>
        ليس لديك صلاحية لعرض هذه الصفحة.
      </div>
    );
  }

  const canCreate = hasPermission('payrollBankImport.create');
  const canExport = hasPermission('payrollBankImport.export');

  const [step, setStep]               = useState<WizardStep>('upload');
  const [fileName, setFileName]       = useState('');
  const [parsedRows, setParsedRows]   = useState<ParsedBankRow[]>([]);
  const [templateName, setTemplateName] = useState<BankTemplate>('Unknown');
  const [summary, setSummary]         = useState<PreviewSummary | null>(null);
  const [report, setReport]           = useState<ImportReport | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);

  const handleParsed = useCallback(async (result: { rows: ParsedBankRow[]; templateName: BankTemplate; fileName: string }) => {
    setError(null);
    setParsedRows(result.rows);
    setTemplateName(result.templateName);
    setFileName(result.fileName);
    setSummary(null);
    setReport(null);
    setLoading(true);

    try {
      const prev = await previewImport(result.templateName, result.rows);
      setSummary(prev);
      setStep('preview');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleExecute() {
    if (!canCreate) { setError('ليس لديك صلاحية تنفيذ الاستيراد'); return; }
    setError(null);
    setLoading(true);
    try {
      const rep = await executeImport(templateName, parsedRows);
      setReport(rep);
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setTemplateName('Unknown');
    setSummary(null);
    setReport(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div style={{
      padding: '24px 32px', maxWidth: 1300, direction: 'rtl',
      fontFamily: '"IBM Plex Sans Arabic", Cairo, Tajawal, Arial, sans-serif',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: '0 0 4px' }}>
          <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', fontSize: 22, marginLeft: 8 }}>upload_file</span>
          استيراد الرواتب البنكية
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
          استيراد كشف التحويلات البنكية وربطه بسجلات الموظفين — يدعم NBK، KFH، بوبيان، بنك الخليج، وربة، الأهلي المتحد
        </p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Error banner (shared) */}
      {error && <ErrorBanner msg={error} />}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e5e7eb)',
          borderRadius: 8, padding: '20px', textAlign: 'center', marginBottom: 16,
          color: 'var(--text-muted, #6b7280)', fontSize: 14,
        }}>
          ⏳ جارٍ التحميل…
        </div>
      )}

      {/* Steps */}
      {!loading && step === 'upload' && (
        <UploadStep onParsed={handleParsed} />
      )}

      {!loading && step === 'preview' && summary && (
        <PreviewStep
          summary={summary}
          templateName={templateName}
          fileName={fileName}
          onConfirm={() => {
            if (!canCreate) { setError('ليس لديك صلاحية تنفيذ الاستيراد'); return; }
            setStep('confirm');
          }}
          onBack={handleReset}
        />
      )}

      {!loading && step === 'confirm' && summary && (
        <ConfirmStep
          summary={summary}
          templateName={templateName}
          canExecute={summary.canExecute && canCreate}
          executing={loading}
          onExecute={handleExecute}
          onBack={() => setStep('preview')}
        />
      )}

      {!loading && step === 'done' && report && (
        <DoneStep
          report={report}
          canExport={canExport}
          onNewImport={handleReset}
        />
      )}
    </div>
  );
}
