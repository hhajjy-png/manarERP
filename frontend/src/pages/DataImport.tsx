import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { IMPORT_ENTITIES, IMPORT_ENTITY_MAP } from '../config/importEntities';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusPill(status: RowStatus) {
  const map: Record<RowStatus, [string, string]> = {
    valid:     ['صالح',  'var(--success, #16a34a)'],
    invalid:   ['خطأ',   'var(--danger,  #dc2626)'],
    duplicate: ['مكرر',  'var(--warning, #ca8a04)'],
  };
  const [label, color] = map[status];
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '1px 8px', fontSize: 12, fontWeight: 700 }}>
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

  const fileRef = useRef<HTMLInputElement>(null);

  if (!hasPermission('import.read')) {
    return (
      <div style={{ padding: 32, color: 'var(--text-muted)' }}>
        {t('import.no_permission')}
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

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

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      <div className="page-head">
        <div><h2>{t('page.import.title')}</h2><p>{t('page.import.subtitle')}</p></div>
      </div>

      {/* Entity type selector */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8 }}>
        {IMPORT_ENTITIES.map((entity) => (
          <button
            key={entity.key}
            onClick={() => handleEntityChange(entity.key)}
            disabled={isLoading}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: entityKey === entity.key ? '2px solid var(--primary, #1d4ed8)' : '1px solid var(--border)',
              background: entityKey === entity.key ? 'var(--primary, #1d4ed8)' : 'var(--bg-card)',
              color: entityKey === entity.key ? '#fff' : 'var(--text)',
              fontWeight: entityKey === entity.key ? 700 : 400,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            {entity.labelAr}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        {/* Left: main flow */}
        <div>
          {/* File upload + actions */}
          {step !== 'done' && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 20, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={isLoading}
                  style={btnStyle('secondary', isLoading)}
                >
                  📂 {t('import.btn.choose_file')}
                </button>
                <button
                  onClick={() => downloadTemplate(entityKey)}
                  disabled={isLoading}
                  style={btnStyle('ghost', isLoading)}
                >
                  ⬇ {t('import.btn.template')}
                </button>
                {step !== 'idle' && (
                  <button
                    onClick={handleValidate}
                    disabled={isLoading || rawRows.length === 0}
                    style={btnStyle('primary', isLoading || rawRows.length === 0)}
                  >
                    {step === 'validating' ? t('msg.loading') : `🔍 ${t('import.btn.validate')}`}
                  </button>
                )}
                {step === 'previewed' && preview && preview.validRows > 0 && hasPermission('import.create') && (
                  <button
                    onClick={handleExecute}
                    disabled={false}
                    style={btnStyle('danger', false)}
                  >
                    ⬆ {t('import.btn.execute')}
                  </button>
                )}
              </div>
              {fileName && (
                <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                  {t('import.file_loaded', { name: fileName, count: rawRows.length })}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: 'var(--danger-bg, #fef2f2)', border: '1px solid var(--danger, #dc2626)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: 'var(--danger, #dc2626)', fontSize: 14 }}>
              {error}
            </div>
          )}

          {/* Preview summary bar */}
          {preview && step !== 'done' && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <StatChip label={t('import.summary.total')}     value={preview.totalRows}     color="var(--text)" />
              <StatChip label={t('import.summary.valid')}     value={preview.validRows}     color="#16a34a" />
              <StatChip label={t('import.summary.invalid')}   value={preview.invalidRows}   color="#dc2626" />
              <StatChip label={t('import.summary.duplicate')} value={preview.duplicateRows} color="#ca8a04" />
            </div>
          )}

          {/* Preview table */}
          {preview && step !== 'done' && (
            <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-header, var(--bg))', borderBottom: '2px solid var(--border)' }}>
                    <th style={thStyle}>{t('import.col.row')}</th>
                    <th style={thStyle}>{t('import.col.status')}</th>
                    <th style={thStyle}>{cfg.previewPrimaryHeader}</th>
                    <th style={thStyle}>{cfg.previewSecondaryHeader}</th>
                    <th style={thStyle}>{t('import.col.errors')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background:
                          row.status === 'invalid'   ? 'var(--danger-bg,  #fef2f2)' :
                          row.status === 'duplicate' ? 'var(--warning-bg, #fefce8)' :
                          'transparent',
                      }}
                    >
                      <td style={tdStyle}>{row.rowIndex + 1}</td>
                      <td style={tdStyle}>{statusPill(row.status)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                        {cfg.previewPrimary(row.data)}
                      </td>
                      <td style={tdStyle}>
                        {cfg.previewSecondary(row.data)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--danger, #dc2626)', fontSize: 12 }}>
                        {row.status === 'invalid' && row.errors?.join(' / ')}
                        {row.status === 'duplicate' && `مكرر: ${row.duplicateValue}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Result card */}
          {step === 'done' && result && (
            <div style={{ background: 'var(--success-bg, #f0fdf4)', border: '1px solid #16a34a', borderRadius: 8, padding: 24, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 16px', color: '#16a34a' }}>✅ {t('import.result.title')}</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <StatChip label={t('import.summary.total')}    value={result.totalRows}    color="var(--text)" />
                <StatChip label={t('import.summary.imported')} value={result.imported}     color="#16a34a" />
                <StatChip label={t('import.summary.invalid')}  value={result.invalidRows}  color="#dc2626" />
                <StatChip label={t('import.summary.duplicate')}value={result.duplicateRows}color="#ca8a04" />
              </div>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                {t('msg.import.backup_note', { name: result.backupFileName })}
              </p>
              <button onClick={handleReset} style={btnStyle('primary', false)}>
                ＋ {t('import.btn.reset')}
              </button>
            </div>
          )}
        </div>

        {/* Right: column guide */}
        <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--border)', fontSize: 13 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{cfg.labelAr} — {t('import.required_cols')}</p>
          <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)' }}>{t('import.col_hint')}</p>
          <div style={{ marginBottom: 14 }}>
            {requiredCols.map((c) => (
              <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 }}>{c.key}</code>
                <span style={{ color: 'var(--text-muted)', marginInlineStart: 8, textAlign: 'end', flex: 1 }}>{c.labelAr}</span>
                <span style={{ color: '#dc2626', marginInlineStart: 4, fontWeight: 700, fontSize: 11 }}>✱</span>
              </div>
            ))}
          </div>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{t('import.optional_cols')}</p>
          <div>
            {optionalCols.map((c) => (
              <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace', fontSize: 12 }}>{c.key}</code>
                <span style={{ color: 'var(--text-muted)', marginInlineStart: 8, textAlign: 'end', flex: 1 }}>{c.labelAr}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 14px', textAlign: 'center', minWidth: 80 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function btnStyle(variant: 'primary' | 'secondary' | 'ghost' | 'danger', disabled: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 16px', borderRadius: 6, fontWeight: 600, fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    border: 'none',
  };
  if (variant === 'primary')   return { ...base, background: 'var(--primary, #1d4ed8)', color: '#fff' };
  if (variant === 'danger')    return { ...base, background: '#dc2626', color: '#fff' };
  if (variant === 'secondary') return { ...base, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' };
  return { ...base, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' };
}

const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'start', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'middle' };
