import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { printCurrentView } from '../utils/print';
import {
  composeStyledFromNode,
  getPageSpec,
  useAccurateFormPreview,
  isFlagEnabled,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useT, t as translate } from '../lib/i18n';
import { todayDateOnly } from '../lib/date';
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
import {
  useBrandingSelection,
  brandingSelectionFields,
} from '../print-templates/hooks/useBrandingSelection';
import BrandingAssetPicker from '../print-templates/components/BrandingAssetPicker';
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
import { formatNumber } from '../lib/format';

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
    date: todayDateOnly(),
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
  const { t } = useT();
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<QuotationPrintFields>(makeInitial);
  const [previewMode, setPreviewMode] = useState<'legacy' | 'engine'>('legacy');

  const printRootRef = useRef<HTMLDivElement>(null);

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
      /**
       * PDF من **المستند** لا من النافذة الحيّة.
       *
       * `exportPdf` يلتقط نافذة التطبيق كما هي، وElectron **يتجاهل `@media print`** في ذلك
       * الالتقاط — فتُطبع قشرة التطبيق الداكنة معه («الإطار الأسود»). `exportPdfFromHtml`
       * يرسم مستندًا قائمًا بذاته في نافذة خفية، وهو **نفس المستند الذي تعرضه المعاينة**
       * (نفس المُركِّب، نفس العقدة) — فالورقة والـ PDF والمعاينة تروي القصة نفسها.
       */
      const html = composeQuotationPreview();
      const result = await (window.manar?.exportPdfFromHtml
        ? window.manar.exportPdfFromHtml(html, suggestedName)
        : window.manar?.exportPdf(suggestedName)); // بيئة قديمة بلا الجسر — السلوك السابق كما هو
      if (!result) {
        setPdfError(t('toast.pdf_not_available'));
        return;
      }
      if (result.canceled) return;
      if (result.success && result.path) {
        setPdfMsg(t('toast.pdf_saved', { path: result.path }));
        setTimeout(() => setPdfMsg(''), 6000);
      } else {
        setPdfError(result.error ?? t('toast.pdf_export_failed'));
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : t('toast.pdf_export_failed'));
    } finally {
      setPdfExporting(false);
    }
  }

  /** أي توقيع وأي ختم يستخدمهما هذا المستند — مصدر واحد للمعاينة والطباعة وPDF. */
  const brandingSelection = useBrandingSelection(branding);

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
        ...brandingSelectionFields(brandingSelection),
        brandingLayout: effectiveLayout,
        inkMode: designer.inkMode,
        textStyleOverrides: textDesigner.settings,
        staticTextOverrides: staticTextDesigner.overrides,
      }),
    };
  }, [
    printData,
    brandingSelection.signatureUrl,
    brandingSelection.stampUrl,
    brandingSelection.showSignature,
    brandingSelection.showStamp,
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

  /**
   * يبني مستند المعاينة من نفس الـ printable root المعروض — لا إعادة رسم، ولا تغيير
   * قالب أو لغة أو حسابات.
   *
   * المصدر يختلف باختلاف الوضع، والمُركِّب واحد:
   *   Engine  → `printRootRef` (جذر هذه الصفحة).
   *   Legacy  → `.form-page` داخل `FormLayout` — يُقرأ عبر `printApiRef` (ينشره
   *             `onPrintApiReady`)، فهي **نفس العقدة** التي يطبعها المسار القديم،
   *             بحالتها الحالية (اللغة، قالب الطباعة، الورق الرسمي، البنود،
   *             الملاحظات، التوقيع والختم).
   */
  const composeQuotationPreview = useCallback((sourceNode?: HTMLElement | null): string => {
    const node = sourceNode ?? printRootRef.current;
    if (!node) throw new Error(t('err.prepare_quotation_preview_failed'));
    return composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'),
      title: `${translate('page.quotation.title', lang)} ${printFields.quotationNumber || '---'}`,
      lang,
      stripSelectors: ['.no-print'],
    });
  }, [printFields.quotationNumber, lang]);

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**، لكلا وضعَي الصفحة.
   *
   * تُعاد استخدام أدوات عرض السعر **كما هي**: مُركِّبه (`composeQuotationPreview`)، وعقدته
   * المطبوعة، ودالة طباعته. Engine ⇒ `printRootRef` + `printCurrentView`. Legacy ⇒
   * `.form-page` + `FormLayout.doPrint`، وكلاهما ينشرهما `onPrintApiReady`. لا قالب بديل،
   * ولا HTML مختلف، ولا محرّك طباعة جديد. المعاينة القائمة وزر الطباعة ومسارهما: كما هي.
   *
   * العلم مطفأ ⇒ لا زر ولا حوار في أيّ من الوضعين.
   */
  const accurateEnabled = isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1);
  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => void } | null>(null);

  const accurateEngine = useAccurateFormPreview({
    enabled: accurateEnabled,
    compose: () => composeQuotationPreview(printRootRef.current),
    onPrint: () => printCurrentView(),
    title: `${translate('page.quotation.title', lang)} ${printFields.quotationNumber || '---'}`,
    documentLabel: t('lbl.doc_label.quotation', { number: printFields.quotationNumber || '---' }),
    lang,
  });

  const accurateLegacy = useAccurateFormPreview({
    enabled: accurateEnabled,
    compose: () => composeQuotationPreview(printApiRef.current?.getNode() ?? null),
    onPrint: () => printApiRef.current?.print(),
    title: `${translate('page.quotation.title', lang)} ${printFields.quotationNumber || '---'}`,
    documentLabel: t('lbl.doc_label.quotation', { number: printFields.quotationNumber || '---' }),
    lang,
  });

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
      setAdapterError(t('msg.adapt_quotation_failed'));
      return;
    }
    setAdapterError(null);
    setPreviewMode('engine');
  }

  // ── ENGINE MODE ───────────────────────────────────────────────────────────────
  if (previewMode === 'engine') {
    return (
      <>
        {accurateEngine.dialog}
      <div ref={printRootRef} style={{ minHeight: '100vh', background: '#f0f4f8' }}>
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
            🖨️ {t('page.forms.print_btn')}
          </button>
          {accurateEngine.button}
          <button
            type="button"
            className="btn secondary"
            onClick={handleExportPdf}
            disabled={pdfExporting}
          >
            {pdfExporting ? `⏳ ${t('msg.exporting')}` : '⬇️ PDF'}
          </button>
          {pdfMsg && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ {pdfMsg}</span>
          )}
          {pdfError && (
            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⚠️ {pdfError}</span>
          )}
          {(brandingSelection.signatureUrl || brandingSelection.stampUrl) && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => designer.isActive ? designer.deactivate() : designer.activate()}
              style={{ fontWeight: 600 }}
            >
              {designer.isActive ? `✓ ${t('btn.finish_design')}` : `🔧 ${t('btn.design_mode')}`}
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={() => layoutDesigner.isActive ? layoutDesigner.deactivate() : layoutDesigner.activate()}
            style={{ fontWeight: 600 }}
          >
            {layoutDesigner.isActive ? `✓ ${t('btn.finish_layout')}` : `🔲 ${t('btn.layout_mode')}`}
          </button>
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
            {t('btn.inv.back')}
          </button>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setPreviewMode('legacy')}
          >
            📋 {t('btn.classic_view')}
          </button>
          {/* اختيار التوقيع والختم — عنصر مركزي مشترك. الخلفية ولون النص توكنات ثيم
              (كانت الخلفية مثبَّتة `#f8fafc` مع لون نص موروث ⇒ أبيض على أبيض في الوضع
              الداكن)، والتوكنات تتحرّك مع الثيم معًا فيبقى التباين صحيحًا في الوضعين. */}
          {brandingSelection.ready && <BrandingAssetPicker selection={brandingSelection} />}
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
              {t('lbl.use_template_studio')}
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
            signatureUrl={brandingSelection.signatureUrl}
            stampUrl={brandingSelection.stampUrl}
            docLabel={t('lbl.doc.quotation')}
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
          const qtTotal = formatNumber(printFields.items.reduce(
            (sum, item) => sum + (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0),
            0,
          ));
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
            docLabel={t('lbl.doc.quotation')}
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
            docLabel={t('lbl.doc.quotation')}
            onClose={layoutDesigner.deactivate}
            onSave={async () => {
              await Promise.all([layoutDesigner.save(), designer.save(), textDesigner.save(), staticTextDesigner.save()]);
            }}
          />
        )}
      </div>
      </>
    );
  }

  // ── LEGACY MODE — مسار الطباعة كما هو؛ المعاينة الدقيقة هي طبقة العرض الوحيدة فوقه ──
  return (
    <>
      {/* الحوار خارج الـ printable root (`.form-page`) فلا يدخل المستند المُركَّب أبدًا. */}
      {accurateLegacy.dialog}
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      ready={false}
      formNumber={printFields.quotationNumber || generateFormNumber(FORM_KEY)}
      title={translate('page.quotation.title', lang)}
      profile={profile}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      toolbarExtra={
        <>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={switchToEngine}
          >
            ✨ {t('btn.print_template')}
          </button>
          {adapterError && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>{adapterError}</span>
          )}
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          {accurateLegacy.button}
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title={t('page.warning.save_draft_title')}
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title={t('page.warning.load_draft_title')}
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
              title={t('page.warning.clear_draft_title')}
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
        entityName: printFields.customerName || '—',
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
          {t('page.warning.print_fields_header')}
        </div>

        {/* Row 1: number, date, validUntil, currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>{t('page.quotation.field.quotation_number')}</label>
            <input
              style={inp}
              value={printFields.quotationNumber}
              onChange={(e) => set('quotationNumber', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>{t('col.date')}</label>
            <DateInput
              style={inp}
              value={printFields.date}
              onChange={(v) => set('date', v)}
            />
          </div>
          <div>
            <label style={lbl}>{t('page.quotation.field.valid_until')}</label>
            <DateInput
              style={inp}
              value={printFields.validUntil}
              onChange={(v) => set('validUntil', v)}
            />
          </div>
          <div>
            <label style={lbl}>{t('field.cheque.currency')}</label>
            <select
              title={t('field.cheque.currency')}
              style={inp}
              value={printFields.currency}
              onChange={(e) => set('currency', e.target.value)}
            >
              <option value="KWD">{t('opt.quotation.currency.kwd')}</option>
              <option value="USD">{t('opt.quotation.currency.usd')}</option>
              <option value="SAR">{t('opt.quotation.currency.sar')}</option>
            </select>
          </div>
        </div>

        {/* Row 2: customer, contact, phone, project */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>{t('field.customer_name')}</label>
            <input
              style={inp}
              value={printFields.customerName}
              onChange={(e) => set('customerName', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>{t('page.quotation.field.contact_person')}</label>
            <input
              style={inp}
              value={printFields.contactPerson}
              onChange={(e) => set('contactPerson', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>{t('field.phone')}</label>
            <input
              style={inp}
              value={printFields.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>{t('page.quotation.field.project')}</label>
            <input
              style={inp}
              value={printFields.project}
              onChange={(e) => set('project', e.target.value)}
            />
          </div>
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>{t('page.quotation.field.subject')}</label>
          <input
            style={inp}
            value={printFields.subject}
            onChange={(e) => set('subject', e.target.value)}
          />
        </div>

        {/* Items table */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={lbl}>{t('lbl.items')}</label>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={addItem}
            >
              {t('page.quotation.add_item_btn')}
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)', width: '35%' }}>{t('col.description')}</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>{t('col.qty')}</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>{t('col.inv.unit')}</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '18%' }}>{t('lbl.inv.unit_price')}</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '15%' }}>{t('col.inv.total')}</th>
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
                        ? formatNumber(total)
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
            <label style={lbl}>{t('field.notes')}</label>
            <textarea
              style={{ ...inp, minHeight: 60, resize: 'vertical' }}
              value={printFields.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>{t('page.quotation.field.payment_terms')}</label>
            <textarea
              style={{ ...inp, minHeight: 60, resize: 'vertical' }}
              value={printFields.paymentTerms}
              onChange={(e) => set('paymentTerms', e.target.value)}
            />
          </div>
        </div>

        {/* Reset */}
        <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetForm}>
          {t('page.purchaseReq.reset_btn')}
        </button>
      </div>

      {/* Print template */}
      <QuotationTemplate printFields={printFields} lang={lang} />
      {showClearConfirm && (
        <ConfirmModal message={t('page.purchaseReq.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
