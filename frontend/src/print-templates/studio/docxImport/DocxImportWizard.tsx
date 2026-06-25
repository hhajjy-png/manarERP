import { useRef, useState } from 'react';
import type { TemplateStudioTemplate, TemplateStudioDocumentType } from '../templateStudioTypes';
import TemplateStudioRenderer from '../TemplateStudioRenderer';
import { parseDocx, buildImportedTemplate } from './docxParser';
import type { DocxParseResult, WizardStep } from './docxTypes';
import { DOCX_MAX_FILE_BYTES, DOCX_PREVIEW_SCALE } from './docxTypes';

// ─── Shared style helpers ─────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9200,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#fff', borderRadius: 12, width: 680, maxWidth: '95vw',
    maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Cairo', sans-serif", direction: 'rtl',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
  },
  title: { fontSize: 16, fontWeight: 700, color: '#1f2937', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, color: '#6b7280', padding: '0 4px',
  },
  body: { padding: 24, overflowY: 'auto', flex: 1 },
  footer: {
    padding: '14px 20px', borderTop: '1px solid #e5e7eb',
    display: 'flex', justifyContent: 'space-between', gap: 12,
  },
  btn: {
    padding: '8px 20px', borderRadius: 6, border: 'none',
    cursor: 'pointer', fontFamily: "'Cairo', sans-serif", fontSize: 14,
  },
  btnPrimary: { background: '#1d4e6f', color: '#fff' },
  btnSecondary: { background: '#f3f4f6', color: '#374151' },
  dropZone: {
    border: '2px dashed #d1d5db', borderRadius: 8,
    padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
    background: '#fafafa', color: '#6b7280',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fca5a5',
    borderRadius: 8, padding: 16, color: '#b91c1c', fontSize: 14,
  },
  warningItem: { fontSize: 13, color: '#92400e', marginBottom: 4 },
  label: { fontSize: 14, color: '#374151', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid #d1d5db', fontFamily: "'Cairo', sans-serif",
    fontSize: 14, boxSizing: 'border-box' as const,
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  open:            boolean;
  onClose:         () => void;
  onImportConfirm: (template: TemplateStudioTemplate) => void;
}

// ─── Preview data (fixed sample) ─────────────────────────────────────────────
const PREVIEW_DATA: Record<string, string> = {
  number:          'INV-2026-001',
  date:            '25/06/2026',
  customerName:    'شركة العميل النموذجي',
  customerAddress: 'الكويت — حولي',
  total:           '5,250.000',
  grandTotal:      '5,250.000',
  subtotal:        '5,250.000',
  discount:        '0.000',
  tax:             '0.000',
  notes:           'ملاحظة: هذه معاينة تجريبية',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DocxImportWizard({ open, onClose, onImportConfirm }: Props) {
  const [step, setStep]           = useState<WizardStep>(1);
  const [file, setFile]           = useState<File | null>(null);
  const [docType, setDocType]     = useState<TemplateStudioDocumentType>('invoice');
  const [parseResult, setParse]   = useState<DocxParseResult | null>(null);
  const [templateName, setName]   = useState('');
  const [errorMsg, setError]      = useState<string | null>(null);
  const [isParsing, setParsing]   = useState(false);
  const [showPreview, setPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setStep(1); setFile(null); setParse(null);
    setName(''); setError(null); setParsing(false); setPreview(false);
  }

  function handleClose() { reset(); onClose(); }

  // ── Step 1: file selection ─────────────────────────────────────────────────

  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith('.docx')) return 'الملف ليس بصيغة .docx';
    if (f.size > DOCX_MAX_FILE_BYTES) return 'حجم الملف يتجاوز 10 ميغابايت. يُرجى استخدام ملف أصغر';
    return null;
  }

  function handleFileSelect(f: File) {
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setError(null);
    setFile(f);
    setName(`قالب مستورد — ${f.name.replace(/\.docx$/i, '')}`);
    setStep(2);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  // ── Step 2 → 3: parse ─────────────────────────────────────────────────────

  async function handleParse() {
    if (!file) return;
    setParsing(true);
    setError(null);
    setStep(3);
    try {
      const buf    = await file.arrayBuffer();
      const result = await parseDocx(buf, { documentType: docType });
      setParse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ غير متوقع أثناء تحليل المستند');
    } finally {
      setParsing(false);
    }
  }

  // ── Step 4: confirm ───────────────────────────────────────────────────────

  function handleConfirm() {
    if (!parseResult) return;
    try {
      const tpl = buildImportedTemplate(parseResult, { documentType: docType }, templateName);
      onImportConfirm(tpl);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ في بناء القالب');
    }
  }

  // ── Preview template ──────────────────────────────────────────────────────

  const previewTemplate: TemplateStudioTemplate | null = parseResult
    ? {
        id: '__preview__', name: templateName, documentType: docType,
        page: { size: 'A4', orientation: 'portrait', marginMm: parseResult.pageMarginMm },
        elements: parseResult.elements,
        createdAt: '', updatedAt: '',
      }
    : null;

  // ── Step indicator ────────────────────────────────────────────────────────

  function StepPips() {
    return (
      <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
        {([1, 2, 3, 4] as WizardStep[]).map(n => (
          <div
            key={n}
            style={{
              width: 22, height: 22, borderRadius: '50%', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: n === step ? '#1d4e6f' : n < step ? '#6ee7b7' : '#e5e7eb',
              color: n <= step ? '#fff' : '#9ca3af',
            }}
          >
            {n}
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={s.title}>استيراد قالب من Word (.docx)</p>
            <StepPips />
          </div>
          <button style={s.closeBtn} onClick={handleClose} type="button">✕</button>
        </div>

        {/* Body */}
        <div style={s.body}>

          {/* ── Step 1: File selection ── */}
          {step === 1 && (
            <div>
              <div
                style={s.dropZone}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                <div>اسحب ملف Word هنا (.docx)</div>
                <div style={{ margin: '8px 0', color: '#d1d5db' }}>أو</div>
                <div style={{ color: '#1d4e6f', fontWeight: 600 }}>اختر ملف...</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                />
              </div>
              {errorMsg && <div style={{ ...s.errorBox, marginTop: 16 }}>{errorMsg}</div>}
              <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                <strong>ملاحظة:</strong> هذا الاستيراد يُنشئ نقطة بداية قابلة للتحرير وليس تحويلاً دقيقاً للتخطيط.
                الحجم الأقصى: 10 ميغابايت · الصيغة: .docx فقط
              </div>
            </div>
          )}

          {/* ── Step 2: Document type ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 13 }}>
                الملف: {file?.name} ({file ? Math.round(file.size / 1024) : 0} KB)
              </div>
              <p style={s.label}>هذا القالب سيُستخدم مع:</p>
              {(['invoice', 'quotation'] as TemplateStudioDocumentType[]).map(dt => (
                <label key={dt} style={{ display: 'block', marginBottom: 12, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="docType"
                    value={dt}
                    checked={docType === dt}
                    onChange={() => setDocType(dt)}
                    style={{ marginLeft: 8 }}
                  />
                  <strong>{dt === 'invoice' ? 'فاتورة (invoice)' : 'عرض سعر (quotation)'}</strong>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {dt === 'invoice'
                      ? 'الحقول المتاحة: invoice.number، invoice.date، invoice.customerName…'
                      : 'الحقول المتاحة: quotation.number، quotation.date، quotation.customerName…'}
                  </div>
                </label>
              ))}
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                النص الذي يطابق {'{{invoice.number}}'} سيُحوَّل تلقائياً إلى حقول ديناميكية.
              </div>
            </div>
          )}

          {/* ── Step 3: Parse + review ── */}
          {step === 3 && (
            <div>
              {isParsing && (
                <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
                  <div>جاري تحليل المستند…</div>
                </div>
              )}

              {!isParsing && errorMsg && (
                <div>
                  <div style={s.errorBox}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>فشل تحليل المستند</div>
                    <div>{errorMsg}</div>
                  </div>
                  <button
                    type="button"
                    style={{ ...s.btn, ...s.btnSecondary, marginTop: 12 }}
                    onClick={() => { setError(null); setStep(2); }}
                  >
                    حاول مرة أخرى
                  </button>
                </div>
              )}

              {!isParsing && parseResult && !errorMsg && (
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  {/* Left: results summary */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#065f46', fontWeight: 600, marginBottom: 12 }}>
                      تم استخراج {parseResult.elements.length} عنصراً
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>العناصر المستخرجة:</div>
                    {(['text', 'dynamicField', 'image', 'lineItemsTable', 'line', 'rect'] as const).map(t => {
                      const count = parseResult.elements.filter(e => e.type === t).length;
                      if (!count) return null;
                      const labels: Record<string, string> = {
                        text: 'نصوص', dynamicField: 'حقول ديناميكية',
                        image: 'صور', lineItemsTable: 'جداول بنود', line: 'خطوط', rect: 'مستطيلات',
                      };
                      return <div key={t} style={{ fontSize: 13, color: '#374151' }}>● {count} {labels[t]}</div>;
                    })}
                    {parseResult.warnings.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                          {parseResult.warnings.length} تحذيرات:
                        </div>
                        {parseResult.warnings.slice(0, 8).map((w, i) => (
                          <div key={i} style={s.warningItem}>• {w.messageAr}</div>
                        ))}
                        {parseResult.warnings.length > 8 && (
                          <div style={{ ...s.warningItem, color: '#6b7280' }}>
                            وتحذيرات أخرى ({parseResult.warnings.length - 8})…
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: preview toggle */}
                  <div style={{ minWidth: 240 }}>
                    <button
                      type="button"
                      style={{ ...s.btn, ...s.btnSecondary, marginBottom: 8, fontSize: 12 }}
                      onClick={() => setPreview(v => !v)}
                    >
                      {showPreview ? 'إخفاء المعاينة' : 'معاينة A4'}
                    </button>
                    {showPreview && previewTemplate && (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                        <TemplateStudioRenderer
                          template={previewTemplate}
                          data={PREVIEW_DATA}
                          scale={DOCX_PREVIEW_SCALE}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Name + confirm ── */}
          {step === 4 && (
            <div>
              <label style={s.label}>اسم القالب:</label>
              <input
                style={s.input}
                type="text"
                value={templateName}
                maxLength={60}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                (أقصى 60 حرفاً)
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: '#6b7280' }}>
                سيُضاف القالب إلى قائمة قوالب {docType === 'invoice' ? 'الفاتورة' : 'عرض السعر'}
                ويمكنك تحريره فور الاستيراد.
              </div>
              {errorMsg && <div style={{ ...s.errorBox, marginTop: 12 }}>{errorMsg}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button
            type="button"
            style={{ ...s.btn, ...s.btnSecondary }}
            onClick={() => {
              if (step === 1) handleClose();
              else setStep((step - 1) as WizardStep);
            }}
          >
            {step === 1 ? 'إغلاق' : 'رجوع'}
          </button>

          <div>
            {step === 2 && (
              <button
                type="button"
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={handleParse}
              >
                متابعة: تحليل...
              </button>
            )}

            {step === 3 && !isParsing && parseResult && !errorMsg && (
              <button
                type="button"
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={() => setStep(4)}
              >
                التالي: تأكيد الاسم
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={handleConfirm}
                disabled={!templateName.trim()}
              >
                استيراد
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
