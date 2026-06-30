import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { IMPORT_ENTITIES, IMPORT_ENTITY_MAP } from '../config/importEntities';
import {
  ExecutiveHeader,
  IdChip,
  MetricCard,
  SectionCard,
  EmptyState,
  ErrorBanner,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './DataImport.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportStep = 'idle' | 'file_loaded' | 'validating' | 'previewed' | 'executing' | 'done';
type RowStatus = 'valid' | 'invalid' | 'duplicate';

interface RowResult {
  rowIndex: number;
  status: RowStatus;
  data: Record<string, unknown>;
  errors?: string[];
  duplicateKey?: string;
  duplicateValue?: string;
}

interface PreviewSummary {
  entityType: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: RowResult[];
}

interface ExecuteSummary {
  entityType: string;
  totalRows: number;
  imported: number;
  invalidRows: number;
  duplicateRows: number;
  backupId: number;
  backupFileName: string;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

const ENTITY_ICON: Record<string, string> = {
  employees: 'groups',
  customers: 'badge',
  equipment: 'agriculture',
  suppliers: 'local_shipping',
  prices:    'sell',
  contracts: 'description',
  expenses:  'payments',
  invoices:  'receipt_long',
  payroll:   'account_balance_wallet',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, { label: string; icon: string }> = {
    valid:     { label: 'صالح', icon: 'check_circle' },
    invalid:   { label: 'خطأ',  icon: 'error' },
    duplicate: { label: 'مكرر', icon: 'content_copy' },
  };
  const { label, icon } = map[status];
  return (
    <span className={`dicx-pill dicx-pill--${status}`}>
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

function downloadTemplate(entityKey: string) {
  const cfg = IMPORT_ENTITY_MAP[entityKey];
  if (!cfg) return;
  const headerRow = cfg.columns.map((c) =>
    cfg.useArabicTemplateHeaders
      ? c.labelAr.replace(/\s*\(.*?\)\s*$/, '').trim()
      : c.key,
  );
  const ws = XLSX.utils.aoa_to_sheet([headerRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `template-${entityKey}.xlsx`);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataImport() {
  const { hasPermission } = useAuth();
  const { t } = useT();

  const [entityKey, setEntityKey] = useState(IMPORT_ENTITIES[0].key);
  const [step, setStep] = useState<ImportStep>('idle');
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<PreviewSummary | null>(null);
  const [result, setResult] = useState<ExecuteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  if (!hasPermission('import.read')) {
    return (
      <div className="xpl-scope xpl-page" dir="rtl">
        <div className="xpl-center-state">
          <span className="material-symbols-outlined">lock</span>
          {t('import.no_permission')}
        </div>
      </div>
    );
  }

  function handleEntityChange(key: string) {
    if (key === entityKey) return;
    setEntityKey(key);
    setStep('idle');
    setFileName('');
    setRawRows([]);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Single source of truth for file ingestion — identical guards for picker & drop.
  function processFile(file: File) {
    setError(null);

    // Guard 1: file size — prevent memory exhaustion from crafted/huge files
    const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_BYTES) {
      setError(`حجم الملف كبير جداً (${(file.size / 1048576).toFixed(1)} م.ب) — الحد الأقصى 10 م.ب`);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    // Guard 2: extension + MIME — reject non-Excel files early
    const VALID_EXTENSIONS = ['.xlsx', '.xls'];
    const VALID_MIMES = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
    ];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!VALID_EXTENSIONS.includes(ext) || (file.type && !VALID_MIMES.includes(file.type))) {
      setError('نوع الملف غير مدعوم — الرجاء اختيار ملف Excel بصيغة .xlsx أو .xls فقط');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) { setError('ملف Excel فارغ أو لا يحتوي على ورقة بيانات'); return; }
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
        if (rows.length === 0) { setError('لا توجد صفوف في الملف'); return; }
        setRawRows(rows);
        setFileName(file.name);
        setPreview(null);
        setResult(null);
        setStep('file_loaded');
      } catch {
        setError('تعذّر قراءة الملف — تأكد أنه ملف Excel صحيح (.xlsx / .xls)');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleValidate() {
    setError(null);
    setStep('validating');
    try {
      const res = await api.post<{ data: PreviewSummary }>('/import/preview', { entityType: entityKey, rows: rawRows });
      setPreview(res.data.data);
      setStep('previewed');
    } catch (err) {
      setError(errorMessage(err));
      setStep('file_loaded');
    }
  }

  async function handleExecute() {
    if (!preview || preview.validRows === 0) { setError(t('import.no_valid_rows')); return; }
    setError(null);
    setStep('executing');
    try {
      const res = await api.post<{ data: ExecuteSummary }>('/import/execute', { entityType: entityKey, rows: rawRows });
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
    setRawRows([]);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const isLoading = step === 'validating' || step === 'executing';
  const cfg = IMPORT_ENTITY_MAP[entityKey];
  if (!cfg) return null;
  const requiredCols = cfg.columns.filter((c) => c.required);
  const optionalCols = cfg.columns.filter((c) => !c.required);
  const canImport = step === 'previewed' && !!preview && preview.validRows > 0 && hasPermission('import.create');

  // Step progress flags
  const fileDone = !!fileName;
  const previewDone = !!preview;
  const importDone = step === 'done';
  const STEPS: { label: string; done: boolean; active: boolean; icon: string }[] = [
    { label: 'نوع البيانات', icon: 'category',     done: true,        active: false },
    { label: 'رفع الملف',    icon: 'upload_file',  done: fileDone,    active: !fileDone },
    { label: 'المعاينة والتحقق', icon: 'fact_check', done: previewDone, active: fileDone && !previewDone },
    { label: 'تنفيذ الاستيراد', icon: 'database',  done: importDone,  active: previewDone && !importDone },
  ];

  return (
    <div className="xpl-scope xpl-page" dir="rtl">

      {/* ── Executive header ── */}
      <ExecutiveHeader
        icon="cloud_upload"
        title={t('page.import.title')}
        subtitle={t('page.import.subtitle')}
        chips={
          <>
            <IdChip icon="category" tone="indigo">{cfg.labelAr}</IdChip>
            {fileName && <IdChip icon="description" tone="green">{rawRows.length} صف</IdChip>}
            {preview && <IdChip icon="task_alt" tone="green">{preview.validRows} صالح</IdChip>}
          </>
        }
        aside={
          (step !== 'idle') ? (
            <Button variant="ghost" icon="restart_alt" onClick={handleReset} disabled={isLoading}>بدء من جديد</Button>
          ) : undefined
        }
      />

      {/* ── Workflow stepper ── */}
      <div className="dicx-stepper">
        {STEPS.map((s, i) => (
          <div key={i} className={`dicx-step${s.done ? ' done' : ''}${s.active ? ' active' : ''}`}>
            <div className="dicx-step-node">
              {s.done ? <span className="material-symbols-outlined" aria-hidden="true">check</span> : i + 1}
            </div>
            <span className="dicx-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Import summary ── */}
      <div className="xpl-kpi-grid">
        <MetricCard icon="category" tone="indigo" label="نوع البيانات" value={cfg.labelAr} />
        <MetricCard icon="description" tone="blue" label="الصفوف المقروءة" value={fileName ? rawRows.length : '—'} sub={fileName || 'لم يُرفع ملف بعد'} />
        <MetricCard icon="rule" tone={preview ? 'green' : 'neutral'} label="الصفوف الصالحة" value={preview ? preview.validRows : '—'} />
        <MetricCard icon={importDone ? 'task_alt' : 'pending'} tone={importDone ? 'green' : 'orange'} label="حالة الاستيراد"
          value={importDone ? 'مكتمل' : preview ? 'جاهز' : fileName ? 'بانتظار التحقق' : 'بانتظار الملف'} />
      </div>

      <div className="dicx-layout">
        {/* ── Main workflow column ── */}
        <div className="dicx-main">

          {/* Step 1 — entity selector */}
          <SectionCard title="١ · اختر نوع البيانات" icon="category">
            <div className="dicx-entities">
              {IMPORT_ENTITIES.map((entity) => (
                <button
                  key={entity.key}
                  type="button"
                  className={`dicx-entity-btn${entityKey === entity.key ? ' active' : ''}`}
                  onClick={() => handleEntityChange(entity.key)}
                  disabled={isLoading}
                  aria-pressed={entityKey === entity.key ? 'true' : 'false'}
                >
                  <span className="dicx-entity-icon">
                    <span className="material-symbols-outlined" aria-hidden="true">{ENTITY_ICON[entity.key] ?? 'table_chart'}</span>
                  </span>
                  {entity.labelAr}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Step 2 — upload zone */}
          {step !== 'done' && (
            <SectionCard title="٢ · ارفع ملف Excel" icon="upload_file">
              <input ref={fileRef} type="file" accept=".xlsx,.xls" aria-label="رفع ملف Excel" style={{ display: 'none' }} onChange={handleFileChange} />
              {!fileName ? (
                <div
                  className={`dicx-dropzone${dragging ? ' dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); if (!isLoading) setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="dicx-dropzone-icon"><span className="material-symbols-outlined" aria-hidden="true">cloud_upload</span></div>
                  <div className="dicx-dropzone-title">اسحب ملف Excel هنا أو اختر من جهازك</div>
                  <div className="dicx-dropzone-hint">الصيغ المدعومة: ‎.xlsx، ‎.xls — الحد الأقصى 10 م.ب</div>
                  <div className="dicx-dropzone-actions">
                    <Button variant="primary" icon="folder_open" onClick={() => fileRef.current?.click()} disabled={isLoading}>
                      {t('import.btn.choose_file')}
                    </Button>
                    <Button variant="secondary" icon="download" onClick={() => downloadTemplate(entityKey)} disabled={isLoading}>
                      {t('import.btn.template')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="dicx-file-ready">
                    <div className="dicx-file-ready-icon"><span className="material-symbols-outlined" aria-hidden="true">description</span></div>
                    <div className="dicx-file-ready-body">
                      <span className="dicx-file-ready-name">{fileName}</span>
                      <span className="dicx-file-ready-meta">{rawRows.length} صف جاهز للتحقق</span>
                    </div>
                    <Button variant="ghost" icon="swap_horiz" small onClick={() => fileRef.current?.click()} disabled={isLoading}>
                      تغيير الملف
                    </Button>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Button variant="primary" icon="fact_check" busy={step === 'validating'} onClick={handleValidate} disabled={rawRows.length === 0}>
                      {t('import.btn.validate')}
                    </Button>
                    <Button variant="secondary" icon="download" onClick={() => downloadTemplate(entityKey)} disabled={isLoading}>
                      {t('import.btn.template')}
                    </Button>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Payroll coercion notice */}
          {entityKey === 'payroll' && step !== 'done' && (
            <div className="dicx-notice">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>جميع الرواتب المستوردة تُنشأ بحالة (مسودة DRAFT)، بغض النظر عن الحالة الموجودة داخل ملف Excel، ويجب اعتمادها من داخل النظام.</span>
            </div>
          )}

          {/* Error */}
          {error && <ErrorBanner>{error}</ErrorBanner>}

          {/* Step 3 — validation summary + preview */}
          {preview && step !== 'done' && (
            <>
              <SectionCard title="٣ · ملخص التحقق" icon="fact_check">
                <div className="dicx-validation">
                  <MetricCard icon="dataset" tone="indigo" label={t('import.summary.total')} value={preview.totalRows} />
                  <MetricCard icon="check_circle" tone="green" label={t('import.summary.valid')} value={preview.validRows} />
                  <MetricCard icon="error" tone="red" label={t('import.summary.invalid')} value={preview.invalidRows} />
                  <MetricCard icon="content_copy" tone="orange" label={t('import.summary.duplicate')} value={preview.duplicateRows} />
                </div>
              </SectionCard>

              {/* Ready status + import button */}
              <div className={`dicx-ready ${canImport ? 'ok' : 'blocked'}`}>
                <div className="dicx-ready-icon">
                  <span className="material-symbols-outlined" aria-hidden="true">{canImport ? 'verified' : 'block'}</span>
                </div>
                <div className="dicx-ready-body">
                  <span className="dicx-ready-title">{canImport ? 'جاهز للاستيراد' : 'لا يمكن الاستيراد'}</span>
                  <span className="dicx-ready-sub">
                    {preview.validRows > 0
                      ? `سيتم استيراد ${preview.validRows} صف صالح${preview.invalidRows + preview.duplicateRows > 0 ? ` وتجاهل ${preview.invalidRows + preview.duplicateRows} صف غير صالح/مكرر` : ''}.`
                      : 'لا توجد صفوف صالحة للاستيراد — صحّح الأخطاء أعلاه ثم أعد التحقق.'}
                    {!hasPermission('import.create') && preview.validRows > 0 && ' — لا تملك صلاحية تنفيذ الاستيراد.'}
                  </span>
                </div>
                {hasPermission('import.create') && (
                  <Button variant="primary" icon="upload" busy={step === 'executing'} onClick={handleExecute} disabled={!canImport}>
                    {t('import.btn.execute')}
                  </Button>
                )}
              </div>

              {/* Preview table */}
              <SectionCard title="معاينة الصفوف" icon="table_view" padded={false}>
                <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="xpl-table">
                    <thead>
                      <tr>
                        <th>{t('import.col.row')}</th>
                        <th>{t('import.col.status')}</th>
                        <th>{cfg.previewPrimaryHeader}</th>
                        <th>{cfg.previewSecondaryHeader}</th>
                        <th>{t('import.col.errors')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row) => (
                        <tr key={row.rowIndex} className={row.status !== 'valid' ? `dicx-row--${row.status}` : ''}>
                          <td>{row.rowIndex + 1}</td>
                          <td><StatusPill status={row.status} /></td>
                          <td className="xpl-mono">{cfg.previewPrimary(row.data)}</td>
                          <td>{cfg.previewSecondary(row.data)}</td>
                          <td className="dicx-cell-err">
                            {row.status === 'invalid' && row.errors?.join(' / ')}
                            {row.status === 'duplicate' && `مكرر: ${row.duplicateValue}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </>
          )}

          {/* Step 4 — success */}
          {step === 'done' && result && (
            <SectionCard title="٤ · اكتمل الاستيراد" icon="task_alt">
              <div className="dicx-success">
                <div className="dicx-success-icon"><span className="material-symbols-outlined" aria-hidden="true">task_alt</span></div>
                <div className="dicx-success-title">{t('import.result.title')}</div>
                <div className="dicx-validation" style={{ width: '100%' }}>
                  <MetricCard icon="dataset" tone="indigo" label={t('import.summary.total')} value={result.totalRows} />
                  <MetricCard icon="check_circle" tone="green" label={t('import.summary.imported')} value={result.imported} />
                  <MetricCard icon="error" tone="red" label={t('import.summary.invalid')} value={result.invalidRows} />
                  <MetricCard icon="content_copy" tone="orange" label={t('import.summary.duplicate')} value={result.duplicateRows} />
                </div>
                <div className="dicx-success-note">{t('msg.import.backup_note', { name: result.backupFileName })}</div>
                <Button variant="primary" icon="add" onClick={handleReset}>{t('import.btn.reset')}</Button>
              </div>
            </SectionCard>
          )}

          {/* Idle empty hint */}
          {step === 'idle' && !error && (
            <EmptyState
              icon="upload_file"
              tone="neutral"
              title="ابدأ عملية الاستيراد"
              message="اختر نوع البيانات وارفع ملف Excel للبدء. يمكنك تنزيل قالب جاهز لكل نوع من زر القالب."
            />
          )}
        </div>

        {/* ── Column mapping guide ── */}
        <div className="dicx-aside">
          <SectionCard title="أعمدة الملف" icon="view_column">
            <div className="dicx-cols">
              <div>
                <div className="dicx-cols-group-title">
                  <span className="material-symbols-outlined" aria-hidden="true">priority_high</span>
                  {t('import.required_cols')}
                </div>
                {requiredCols.map((c) => (
                  <div key={c.key} className="dicx-col-row">
                    <code className="dicx-col-key">{c.key}</code>
                    <span className="dicx-col-label">{c.labelAr}</span>
                    <span className="dicx-col-req" title="مطلوب">✱</span>
                  </div>
                ))}
              </div>
              {optionalCols.length > 0 && (
                <div>
                  <div className="dicx-cols-group-title">
                    <span className="material-symbols-outlined" aria-hidden="true">tune</span>
                    {t('import.optional_cols')}
                  </div>
                  {optionalCols.map((c) => (
                    <div key={c.key} className="dicx-col-row">
                      <code className="dicx-col-key">{c.key}</code>
                      <span className="dicx-col-label">{c.labelAr}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--xpl-muted)', lineHeight: 1.6 }}>{t('import.col_hint')}</p>
            </div>
          </SectionCard>
        </div>
      </div>

    </div>
  );
}
