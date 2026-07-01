import { useState, useEffect, useMemo } from 'react';
import { printCurrentView } from '../utils/print';
import ConfirmModal from '../components/ConfirmModal';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PROFILE_ID, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import LanguageToggle from '../forms/shared/LanguageToggle';
import QuotationTemplate, {
  type QuotationItem,
  type QuotationPrintFields,
} from '../forms/QuotationTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import { usePrintTemplate } from '../print-templates/hooks/usePrintTemplate';
import { PrintTemplateSelector } from '../print-templates/components';
import {
  adaptFormToQuotationPrintData,
  validateQuotationPrintData,
} from '../print-templates/integration/quotationPreviewIntegration';
import { useCompanyBranding } from '../print-templates/hooks/useCompanyBranding';
import { createCompanyPrintData } from '../print-templates/adapters/companyData';
import { buildQuotationPdfName } from '../utils/pdfFilename';
import type { PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';
import { useTextStyleDesigner } from '../print-templates/designer/useTextStyleDesigner';
import { useStaticTextDesigner } from '../print-templates/designer/useStaticTextDesigner';
import { useLayoutDesigner } from '../print-templates/hooks/useLayoutDesigner';
import BrandingDesignerPanel from '../print-templates/components/BrandingDesignerPanel';
import LayoutOverrideStyles from '../print-templates/components/LayoutOverrideStyles';
import UniversalDesignerOverlay from '../print-templates/components/UniversalDesignerOverlay';
import LayoutDesignerPanel from '../print-templates/components/LayoutDesignerPanel';
import type { AllLayoutOverrides } from '../print-templates/designer/layoutOverrideTypes';
import { useTemplateStudio } from '../print-templates/studio/useTemplateStudio';
import TemplateStudioRenderer from '../print-templates/studio/TemplateStudioRenderer';
import { resolveQuotationLineItems } from '../print-templates/studio/lineItemsResolver';

const FORM_KEY = 'quotation';

function newItem(): QuotationItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    qty: '',
    unit: '',
    unitPrice: '',
  };
}

function makeInitial(): QuotationPrintFields {
  return {
    quotationNumber: generateFormNumber(FORM_KEY),
    date: new Date().toISOString().slice(0, 10),
    validUntil: '',
    currency: 'KWD',
    subject: '',
    customerName: '',
    contactPerson: '',
    phone: '',
    project: '',
    items: [newItem()],
    notes: '',
    paymentTerms: 'الدفع خلال 30 يوماً من تاريخ الفاتورة',
  };
}

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 4,
  color: 'var(--text-muted)',
};

export default function Quotation() {
  const navigate = useNavigate();
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<QuotationPrintFields>(makeInitial);
  const [previewMode, setPreviewMode] = useState<'legacy' | 'engine'>('legacy');
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const { activeTemplate: studioTemplate } = useTemplateStudio('quotation');
  const [useStudio, setUseStudio] = useState(false);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const branding = useCompanyBranding();

  const [layoutOverrides, setLayoutOverrides] = useState<AllLayoutOverrides>({ invoice: {}, quotation: {} });
  const [layoutOverridesInitialized, setLayoutOverridesInitialized] = useState(false);

  useEffect(() => {
    if (!branding.loading && !layoutOverridesInitialized) {
      setLayoutOverrides(branding.layoutOverrides);
      setLayoutOverridesInitialized(true);
    }
  }, [branding.loading, branding.layoutOverrides, layoutOverridesInitialized]);

  const layoutDesigner = useLayoutDesigner({
    docType: 'quotation',
    initialLayouts: layoutOverrides,
    onSaved: setLayoutOverrides,
  });

  const effectiveLayoutOverrides = layoutDesigner.isActive ? layoutDesigner.layouts : layoutOverrides;

  const [savedBrandingLayout, setSavedBrandingLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
  const designer = useBrandingDesigner({
    docType: 'quotation',
    initialLayout: branding.brandingLayout,
    onSaved: (layout) => setSavedBrandingLayout(layout),
  });

  const textDesigner = useTextStyleDesigner({
    initialSettings: branding.textStyleOverrides,
  });

  const staticTextDesigner = useStaticTextDesigner({
    initialOverrides: branding.staticTextOverrides,
  });

  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const [pdfError, setPdfError] = useState('');

  async function handleExportPdf() {
    setPdfExporting(true);
    setPdfMsg('');
    setPdfError('');
    try {
      const suggestedName = buildQuotationPdfName(printFields.quotationNumber);
      const result = await window.manar?.exportPdf(suggestedName);
      if (!result) {
        setPdfError('تصدير PDF غير متاح في هذه البيئة');
        return;
      }
      if (result.canceled) return;
      if (result.success && result.path) {
        setPdfMsg(`تم الحفظ: ${result.path}`);
        setTimeout(() => setPdfMsg(''), 6000);
      } else {
        setPdfError(result.error ?? 'فشل تصدير PDF');
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'فشل تصدير PDF');
    } finally {
      setPdfExporting(false);
    }
  }

  const [printShowSignature, setPrintShowSignature] = useState(true);
  const [printShowStamp, setPrintShowStamp] = useState(true);
  const [printOptionsInitialized, setPrintOptionsInitialized] = useState(false);

  useEffect(() => {
    if (!branding.loading && !printOptionsInitialized) {
      setPrintShowSignature(branding.showSignature);
      setPrintShowStamp(branding.showStamp);
      setPrintOptionsInitialized(true);
    }
  }, [branding.loading, branding.showSignature, branding.showStamp, printOptionsInitialized]);

  // ── Print engine — called unconditionally (React hooks rules) ──────────────
  const printData = useMemo(() => {
    try {
      return adaptFormToQuotationPrintData(printFields);
    } catch {
      return null;
    }
  }, [printFields]);

  const brandedPrintData = useMemo(() => {
    if (!printData) return null;
    const effectiveLayout = designer.isActive
      ? designer.localLayout
      : (savedBrandingLayout ?? branding.brandingLayout);
    return {
      ...printData,
      company: createCompanyPrintData({
        signatureUrl: branding.signatureUrl,
        stampUrl: branding.stampUrl,
        showSignature: printShowSignature,
        showStamp: printShowStamp,
        brandingLayout: effectiveLayout,
        inkMode: designer.inkMode,
        textStyleOverrides: textDesigner.settings,
        staticTextOverrides: staticTextDesigner.overrides,
      }),
    };
  }, [
    printData,
    branding.signatureUrl,
    branding.stampUrl,
    printShowSignature,
    printShowStamp,
    designer.isActive,
    designer.localLayout,
    designer.inkMode,
    savedBrandingLayout,
    branding.brandingLayout,
    textDesigner.settings,
    staticTextDesigner.overrides,
  ]);

  const { resolvedTemplate, profile: tplProfile, setProfile: setTplProfile } =
    usePrintTemplate('quotation', brandedPrintData ?? undefined);

  const warnings = useMemo(
    () => (brandedPrintData ? validateQuotationPrintData(brandedPrintData) : []),
    [brandedPrintData],
  );

  const EngineComponent = resolvedTemplate.component;

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    const handler = () =>
      addPrintLog({
        formType: FORM_KEY,
        formNumber: printFields.quotationNumber,
        employeeName: printFields.customerName || '—',
        printProfile: profile,
      });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [printFields.quotationNumber, printFields.customerName, profile, addPrintLog]);

  function addItem() {
    setPrintFields((prev) => ({ ...prev, items: [...prev.items, newItem()] }));
  }

  function removeItem(id: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((i) => i.id !== id) : prev.items,
    }));
  }

  function updateItem(id: string, field: keyof Omit<QuotationItem, 'id'>, value: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  }

  function set<K extends keyof Omit<QuotationPrintFields, 'items'>>(
    key: K,
    value: QuotationPrintFields[K],
  ) {
    setPrintFields((prev) => ({ ...prev, [key]: value }));
  }

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetForm() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields(makeInitial()); }

  function switchToEngine() {
    if (!printData) {
      setAdapterError('تعذّر تحويل البيانات إلى قالب الطباعة. يُرجى التحقق من البنود.');
      return;
    }
    setAdapterError(null);
    setPreviewMode('engine');
  }

  // ── ENGINE MODE ───────────────────────────────────────────────────────────────
  if (previewMode === 'engine') {
    return (
      <div dir="rtl" style={{ minHeight: '100vh', background: '#f0f4f8' }}>
        <style>{`
          @media print {
            @page { size: A4; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
            .no-print { display: none !important; }
            .engine-hide-legacy { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          }
        `}</style>

        {/* Toolbar */}
        <div
          className="no-print"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 18px', background: '#fff', borderBottom: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}
        >
          <button type="button" className="btn" onClick={() => printCurrentView()}>
            🖨️ طباعة
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={handleExportPdf}
            disabled={pdfExporting}
          >
            {pdfExporting ? '⏳ جارٍ التصدير…' : '⬇️ PDF'}
          </button>
          {pdfMsg && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ {pdfMsg}</span>
          )}
          {pdfError && (
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⚠️ {pdfError}</span>
          )}
          {(branding.signatureUrl || branding.stampUrl) && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => designer.isActive ? designer.deactivate() : designer.activate()}
              style={{ fontWeight: 600 }}
            >
              {designer.isActive ? '✓ إنهاء التصميم' : '🔧 وضع التصميم'}
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={() => layoutDesigner.isActive ? layoutDesigner.deactivate() : layoutDesigner.activate()}
            style={{ fontWeight: 600 }}
          >
            {layoutDesigner.isActive ? '✓ إنهاء التخطيط' : '🔲 تخطيط'}
          </button>
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
            رجوع
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setPreviewMode('legacy')}
          >
            📋 العرض الكلاسيكي
          </button>
          {printOptionsInitialized && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '4px 10px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: branding.signatureUrl ? 'pointer' : 'not-allowed' }}>
                <input
                  type="checkbox"
                  checked={printShowSignature}
                  disabled={!branding.signatureUrl}
                  onChange={(e) => setPrintShowSignature(e.target.checked)}
                />
                <span style={{ color: branding.signatureUrl ? undefined : '#94a3b8' }}>
                  التوقيع{!branding.signatureUrl && <span style={{ fontSize: 10, marginInlineStart: 4 }}>(لم يُرفع)</span>}
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: branding.stampUrl ? 'pointer' : 'not-allowed' }}>
                <input
                  type="checkbox"
                  checked={printShowStamp}
                  disabled={!branding.stampUrl}
                  onChange={(e) => setPrintShowStamp(e.target.checked)}
                />
                <span style={{ color: branding.stampUrl ? undefined : '#94a3b8' }}>
                  الختم{!branding.stampUrl && <span style={{ fontSize: 10, marginInlineStart: 4 }}>(لم يُرفع)</span>}
                </span>
              </label>
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {printFields.quotationNumber}
          </span>
          {studioTemplate && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', padding: '3px 8px', background: useStudio ? '#dbeafe' : '#f8fafc', border: '1px solid #bfdbfe', borderRadius: 6 }}>
              <input
                type="checkbox"
                checked={useStudio}
                onChange={(e) => setUseStudio(e.target.checked)}
              />
              استخدام قالب Template Studio
            </label>
          )}
        </div>

        {/* Template selector */}
        <div
          className="no-print"
          style={{ padding: '12px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
        >
          <PrintTemplateSelector category="quotation" profile={tplProfile} onSelect={setTplProfile} />
        </div>

        {/* Warning banner */}
        {warnings.length > 0 && (
          <div
            className="no-print"
            style={{ padding: '8px 18px', background: '#fffbeb', borderBottom: '1px solid #f59e0b', fontSize: 12, color: '#92400e', direction: 'rtl' }}
          >
            ⚠️ {warnings.map((w) => w.messageAr).join(' — ')}
          </div>
        )}

        {/* Engine template */}
        {!useStudio && (
          <UniversalDesignerOverlay
            layoutDesigner={layoutDesigner}
            designer={designer}
            textStyleDesigner={textDesigner}
            staticTextDesigner={staticTextDesigner}
            signatureUrl={branding.signatureUrl}
            stampUrl={branding.stampUrl}
            docLabel="عرض السعر"
            onSave={async () => {
              await Promise.all([layoutDesigner.save(), designer.save(), textDesigner.save(), staticTextDesigner.save()]);
            }}
          >
            <LayoutOverrideStyles overrides={effectiveLayoutOverrides.quotation} />
            <EngineComponent data={brandedPrintData ?? undefined} />
          </UniversalDesignerOverlay>
        )}

        {/* Template Studio renderer (optional, default OFF) */}
        {useStudio && studioTemplate && (() => {
          const qtTotal = printFields.items.reduce(
            (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0),
            0,
          ).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
          return (
            <TemplateStudioRenderer
              template={studioTemplate}
              data={{
                number:          printFields.quotationNumber ?? '',
                date:            printFields.date ?? '',
                customerName:    printFields.customerName ?? '',
                customerAddress: '',
                total:           qtTotal,
                subtotal:        qtTotal,
                discount:        '0.000',
                tax:             '0.000',
                grandTotal:      qtTotal,
                notes:           printFields.notes ?? '',
              }}
              lineItems={resolveQuotationLineItems(printFields.items)}
            />
          );
        })()}

        {designer.isActive && (
          <BrandingDesignerPanel
            designer={designer}
            textStyleDesigner={textDesigner}
            staticTextDesigner={staticTextDesigner}
            docLabel="عرض السعر"
            onClose={designer.deactivate}
            onSave={async () => {
              await Promise.all([designer.save(), textDesigner.save(), staticTextDesigner.save()]);
            }}
          />
        )}

        {layoutDesigner.isActive && (
          <LayoutDesignerPanel
            layoutDesigner={layoutDesigner}
            designer={designer}
            textStyleDesigner={textDesigner}
            docLabel="عرض السعر"
            onClose={layoutDesigner.deactivate}
            onSave={async () => {
              await Promise.all([layoutDesigner.save(), designer.save(), textDesigner.save(), staticTextDesigner.save()]);
            }}
          />
        )}
      </div>
    );
  }

  // ── LEGACY MODE (unchanged) ───────────────────────────────────────────────────
  return (
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      ready={false}
      formNumber={printFields.quotationNumber || generateFormNumber(FORM_KEY)}
      title={lang === 'ar' ? 'عرض سعر' : 'Quotation'}
      profile={profile}
      toolbarExtra={
        <>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={switchToEngine}
          >
            ✨ قالب الطباعة
          </button>
          {adapterError && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>{adapterError}</span>
          )}
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة"
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
              onClick={() => setPrintFields(draftEntry.state as QuotationPrintFields)}
            >
              ↩
            </button>
          )}
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              title="مسح المسودة"
              onClick={() => clearDraft(FORM_KEY)}
            >
              ✕
            </button>
          )}
        </>
      }
      qrData={{
        formType: FORM_KEY,
        formNumber: printFields.quotationNumber,
        employeeId: 0,
        employeeName: printFields.customerName || '—',
        issueDate: new Date().toISOString(),
      }}
    >
      {/* No-print panel */}
      <div
        className="no-print"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          background: 'var(--surface-2)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          حقول الطباعة فقط — لن تُحفظ
        </div>

        {/* Row 1: number, date, validUntil, currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>رقم العرض</label>
            <input
              style={inp}
              value={printFields.quotationNumber}
              onChange={(e) => set('quotationNumber', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>التاريخ</label>
            <input
              type="date"
              lang="en"
              style={inp}
              value={printFields.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>صالح حتى</label>
            <input
              type="date"
              lang="en"
              style={inp}
              value={printFields.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>العملة</label>
            <select
              title="العملة"
              style={inp}
              value={printFields.currency}
              onChange={(e) => set('currency', e.target.value)}
            >
              <option value="KWD">د.ك — KWD</option>
              <option value="USD">دولار — USD</option>
              <option value="SAR">ريال — SAR</option>
            </select>
          </div>
        </div>

        {/* Row 2: customer, contact, phone, project */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>اسم العميل</label>
            <input
              style={inp}
              value={printFields.customerName}
              onChange={(e) => set('customerName', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>جهة الاتصال</label>
            <input
              style={inp}
              value={printFields.contactPerson}
              onChange={(e) => set('contactPerson', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>الهاتف</label>
            <input
              style={inp}
              value={printFields.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>المشروع</label>
            <input
              style={inp}
              value={printFields.project}
              onChange={(e) => set('project', e.target.value)}
            />
          </div>
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>الموضوع / Subject</label>
          <input
            style={inp}
            value={printFields.subject}
            onChange={(e) => set('subject', e.target.value)}
          />
        </div>

        {/* Items table */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={lbl}>البنود</label>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={addItem}
            >
              + إضافة بند
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)', width: '35%' }}>الوصف</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الكمية</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '18%' }}>سعر الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '15%' }}>الإجمالي</th>
                <th style={{ border: '1px solid var(--border)', width: '8%' }} />
              </tr>
            </thead>
            <tbody>
              {printFields.items.map((item) => {
                const total = (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
                return (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input
                        style={{ ...inp, padding: '3px 6px' }}
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input
                        type="number"
                        lang="en"
                        min="0"
                        style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                      />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input
                        style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                      />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input
                        type="number"
                        lang="en"
                        min="0"
                        step="0.001"
                        style={{ ...inp, padding: '3px 6px', textAlign: 'end' }}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: '3px 6px', textAlign: 'end', fontWeight: 600, color: '#1d4e6f' }}>
                      {total > 0
                        ? total.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                        : '—'}
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3, textAlign: 'center' }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1 }}
                        disabled={printFields.items.length === 1}
                        onClick={() => removeItem(item.id)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Notes + terms */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>ملاحظات</label>
            <textarea
              style={{ ...inp, minHeight: 60, resize: 'vertical' }}
              value={printFields.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>شروط الدفع</label>
            <textarea
              style={{ ...inp, minHeight: 60, resize: 'vertical' }}
              value={printFields.paymentTerms}
              onChange={(e) => set('paymentTerms', e.target.value)}
            />
          </div>
        </div>

        {/* Reset */}
        <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetForm}>
          ↺ إعادة تعيين
        </button>
      </div>

      {/* Print template */}
      <QuotationTemplate printFields={printFields} lang={lang} />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع الحقول. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
