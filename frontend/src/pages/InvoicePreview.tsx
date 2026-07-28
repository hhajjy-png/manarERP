import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { printCurrentView } from '../utils/print';
import {
  composeStyledFromNode,
  isFlagEnabled,
  TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC,
  getPageSpec,
} from '../printing';
import WysiwygPreviewPocDialog from '../printing/components/WysiwygPreviewPocDialog';
import type { ComponentType } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { money, dateText } from '../config/modules';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { ARABIC_MONTHS } from '../utils/dateUtils';
import type { ApiInvoice } from '../print-templates/adapters/apiTypes';
import type { InvoicePrintData, PrintBrandingLayoutSettings } from '../print-templates/engine/types';
import { usePrintTemplate } from '../print-templates/hooks/usePrintTemplate';
import { buildInvoicePrintData } from '../print-templates/builders/invoicePrintDataBuilder';
import PrintTemplateSelector from '../print-templates/components/PrintTemplateSelector';
import { validateInvoicePrintData } from '../print-templates/integration/invoicePreviewIntegration';
import { useCompanyBranding } from '../print-templates/hooks/useCompanyBranding';
import {
  useBrandingSelection,
  brandingSelectionFields,
} from '../print-templates/hooks/useBrandingSelection';
import BrandingAssetPicker from '../print-templates/components/BrandingAssetPicker';
import { getBrandingLayoutForDocument, applyBrandingElementStyle } from '../print-templates/utils/brandingLayout';
import { buildInvoicePdfName } from '../utils/pdfFilename';
import { canEditInvoice } from '../utils/invoiceGovernance';
import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';
import { useTextStyleDesigner } from '../print-templates/designer/useTextStyleDesigner';
import { useStaticTextDesigner } from '../print-templates/designer/useStaticTextDesigner';
import { useLayoutDesigner } from '../print-templates/hooks/useLayoutDesigner';
import BrandingDesignerPanel from '../print-templates/components/BrandingDesignerPanel';
import LayoutOverrideStyles from '../print-templates/components/LayoutOverrideStyles';
import UniversalDesignerOverlay from '../print-templates/components/UniversalDesignerOverlay';
import LayoutDesignerPanel from '../print-templates/components/LayoutDesignerPanel';
import ConfirmModal from '../components/ConfirmModal';
import type { AllLayoutOverrides } from '../print-templates/designer/layoutOverrideTypes';
import { getInkFilterStyle, resolveInkMode } from '../print-templates/utils/inkFilter';
import InkColorFilterDefs from '../print-templates/designer/InkColorFilterDefs';
import { useTemplateStudio } from '../print-templates/studio/useTemplateStudio';
import TemplateStudioRenderer from '../print-templates/studio/TemplateStudioRenderer';
import { resolveInvoiceLineItems } from '../print-templates/studio/lineItemsResolver';
import { DocumentVerificationQR } from '../print-templates/components/DocumentVerificationQR';
import { DOC_FONT_STACK } from '../styles/fontRegistry';

// خريطة طريقة الدفع: تُستخدم في موضعين — شريحة ملخص التحصيل (شاشة فقط، no-print) وجدول
// سجل الدفعات المطبوع (جزء من متن المستند المطبوع، يبقى عربيًا). لذلك تحمل كل قيمة
// النص العربي الأصلي (يُقرأ حرفيًا في متن الطباعة) بالإضافة إلى مفتاح i18n (يُستخدم
// فقط في الموضع الشاشي عبر t()).
const PAY_METHOD_AR: Record<string, { ar: string; key: string }> = {
  CASH: { ar: 'نقدًا', key: 'opt.payment.cash' },
  BANK: { ar: 'بنك', key: 'opt.payment.bank' },
  CHEQUE: { ar: 'شيك', key: 'opt.payment.cheque' },
  TRANSFER: { ar: 'تحويل', key: 'opt.payment.transfer' },
};

// شارة الحالة (شاشة فقط — no-print): مفاتيح i18n للحالات الخمس.
const STATUS_LABEL_KEY: Record<string, string> = {
  UNPAID: 'inv.status.unpaid', PARTIAL: 'inv.status_alt.partial', PAID: 'inv.status_alt.paid',
  OVERDUE: 'inv.status.overdue', CANCELLED: 'inv.status.cancelled',
};
const STATUS_COLOR: Record<string, string> = {
  UNPAID: '#dc2626', PARTIAL: '#d97706', PAID: '#16a34a',
  OVERDUE: '#dc2626', CANCELLED: '#6b7280',
};

type InvItem = { id: number; description: string; quantity: number; unit: string; unitPrice: number; total: number; };
type Payment = { id: number; amount: number; method: string; date: string; reference?: string | null; };
type FullInvoice = {
  id: number;
  invoiceNumber: string;
  number: string;
  direction: string;
  invoiceType: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  billingMonth?: number | null;
  billingYear?: number | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  verificationUuid?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
  contract?: { id: number; code?: string; asphaltPlant: string } | null;
  items: InvItem[];
  payments: Payment[];
};

const th: CSSProperties = {
  border: '1px solid #cbd5e1', padding: '6px 10px', background: '#1d4e6f', color: '#fff',
  textAlign: 'start', fontWeight: 700, fontSize: 13,
  WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
};
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '5px 10px', fontSize: 13 };
const secTitle: CSSProperties = {
  fontSize: 14, fontWeight: 800, color: '#1d4e6f',
  borderBottom: '2px solid #1d4e6f', paddingBottom: 5, marginBottom: 10, marginTop: 12,
};
const fRow: CSSProperties = { display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 };
const fLbl: CSSProperties = { color: '#64748b', fontWeight: 600, minWidth: 130 };
const fVal: CSSProperties = { fontWeight: 700, color: '#0f172a' };

/**
 * عزل ثنائي الاتجاه للمبالغ النقدية.
 *
 * السبب الجذري لظهور «KWD 280.000» بدل «280.000 KWD»: الـ formatter المشترك ينتج
 * السلسلة الصحيحة («280.000 KWD»)، لكن هذه السلسلة تُعرض داخل حاوية `direction: rtl`.
 * خوارزمية bidi تعامل المسافة والفاصلة كمحايدات، فتعيد ترتيب الرمز بالنسبة إلى الرقم
 * حسب سياق الفقرة — فيظهر الرمز أولًا بصريًا رغم أن النص سليم.
 *
 * الحل هو عزل المبلغ في جزيرة LTR مستقلة: النص لا يتغيّر، الحساب لا يتغيّر، ولا
 * formatter جديد. تُطبَّق على كل موضع نقدي فتتطابق الشاشة والمعاينة والطباعة القديمة.
 */
const moneyCell: CSSProperties = { direction: 'ltr', unicodeBidi: 'isolate' };
const fValMoney: CSSProperties = { ...fVal, ...moneyCell, display: 'inline-block' };

export default function InvoicePreview() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const { hasPermission } = useAuth();

  const [data, setData] = useState<FullInvoice | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [paying, setPaying] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payError, setPayError] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [previewMode, setPreviewMode] = useState<'legacy' | 'engine'>('legacy');
  const [engineWarning, setEngineWarning] = useState('');

  // ── Print Center (Phase 2B) ────────────────────────────────────────────────────
  // The invoice keeps its EXISTING renderer, its existing template selection, its
  // existing @page and its existing print CSS. The Print Center only takes what the
  // page already rendered, carries its stylesheets into the hidden window, and turns
  // that into the PDF that is previewed, saved and printed.
  //
  // The printable root is the page wrapper. We do not hand-pick a subtree: the
  // captured `@media print` rules (which printToPDF honours) hide `.no-print` and
  // `.engine-hide-legacy` exactly as they do on the legacy print path — so whichever
  // mode is active, legacy or engine, composition reproduces the legacy output by
  // construction rather than by imitation.
  const printRootRef = useRef<HTMLDivElement>(null);
  const [wysiwygPocOpen, setWysiwygPocOpen] = useState(false);
  // POC — OFF افتراضيًا. يظهر زرّه فقط بتفعيل يدوي للعلم، ولا يغيّر شيئًا سواه.
  const useWysiwygPoc = isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC);

  const autoPrint = searchParams.get('print') === '1';
  const printFiredRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/invoices/${id}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setLoadError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    if (data && autoPrint && !printFiredRef.current) {
      printFiredRef.current = true;
      const timer = setTimeout(() => printCurrentView(), 500);
      return () => clearTimeout(timer);
    }
  }, [data, autoPrint]);

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
    docType: 'invoice',
    initialLayouts: layoutOverrides,
    onSaved: setLayoutOverrides,
  });

  const effectiveLayoutOverrides = layoutDesigner.isActive ? layoutDesigner.layouts : layoutOverrides;

  const [savedBrandingLayout, setSavedBrandingLayout] = useState<PrintBrandingLayoutSettings | undefined>(undefined);
  const designer = useBrandingDesigner({
    docType: 'invoice',
    initialLayout: branding.brandingLayout,
    onSaved: (layout) => setSavedBrandingLayout(layout),
  });
  const effectiveBrandingLayout = designer.isActive
    ? designer.localLayout
    : (savedBrandingLayout ?? branding.brandingLayout);

  const textDesigner = useTextStyleDesigner({
    initialSettings: branding.textStyleOverrides,
  });

  const staticTextDesigner = useStaticTextDesigner({
    initialOverrides: branding.staticTextOverrides,
  });

  const { activeTemplate: studioTemplate } = useTemplateStudio('invoice');
  const [useStudio, setUseStudio] = useState(false);

  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const [pdfError, setPdfError] = useState('');

  async function handleExportPdf() {
    if (!data) return;
    setPdfExporting(true);
    setPdfMsg('');
    setPdfError('');
    try {
      const suggestedName = buildInvoicePdfName(data.invoiceNumber ?? data.number);
      /**
       * PDF يُصدَّر من **المستند وحده**، لا من النافذة الحيّة.
       *
       * `pdf:export` يلتقط الـ BrowserWindow المرئية عبر `printToPDF({ printBackground: true })`،
       * وElectron **يتجاهل `@media print`** في هذا المسار. فكل ما يخفيه CSS الطباعة يبقى
       * مرسومًا، ومعه خلفية قشرة التطبيق (ExplorerKit shell) الداكنة حول الفاتورة — وهي
       * الأشرطة السوداء على الجانبين. الطباعة الفعلية لا تعانيها لأن حوار الطباعة يطبّق
       * `@media print` ويُطفئ خلفيات الصفحة افتراضيًا.
       *
       * هذا هو نفس المبدأ الذي عولجت به Forms في 80a1ea3: صدّر HTML مستقلًا يحوي الجذر
       * القابل للطباعة فقط عبر النافذة المخفية (`pdf:exportHtml`). لم يُطبَّق على الفاتورة
       * حينها لأن ترحيل الفاتورة كان لا يزال ضمن مسار Print Center الذي تراجعنا عنه، فبقيت
       * على `pdf:export` القديم. نفس المُركِّب المستخدم في المعاينة يُنتج المستند هنا —
       * مصدر واحد، فما تراه في المعاينة هو ما يُحفظ.
       */
      const html = composeInvoicePreview();
      const result = await (window.manar?.exportPdfFromHtml
        ? window.manar.exportPdfFromHtml(html, suggestedName)
        : window.manar?.exportPdf(suggestedName)); // بيئة قديمة بلا الجسر — سلوك سابق كما هو
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

  /** أي توقيع وأي ختم تستخدمهما هذه الفاتورة — مصدر واحد للمعاينة والطباعة وPDF. */
  const brandingSelection = useBrandingSelection(branding);

  const printData = useMemo<InvoicePrintData | null>(() => {
    if (!data) return null;
    try {
      return buildInvoicePrintData(data as unknown as ApiInvoice, {
        branding: {
          ...brandingSelectionFields(brandingSelection),
          brandingLayout: effectiveBrandingLayout,
          textStyleOverrides: textDesigner.settings,
          staticTextOverrides: staticTextDesigner.overrides,
        },
      });
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, brandingSelection.signatureUrl, brandingSelection.stampUrl, brandingSelection.showSignature, brandingSelection.showStamp, effectiveBrandingLayout, textDesigner.settings, staticTextDesigner.overrides]);

  const { resolvedTemplate, profile, setProfile } = usePrintTemplate<InvoicePrintData>(
    'invoice',
    printData ?? undefined,
  );

  /**
   * يبني مستند المعاينة من نفس الـ printable root المعروض — لا يعيد رسم أي شيء، ولا
   * يمس القالب ولا الحسابات. يُعرض داخل iframe في نفس أصل التطبيق، فتُحمَّل الخطوط
   * والشعار كما على الشاشة وتظهر العربية مشكّلة.
   */
  const composeInvoicePreview = useCallback((): string => {
    const node = printRootRef.current;
    if (!node || !data) throw new Error(t('err.prepare_preview_failed'));
    const number = data.invoiceNumber ?? data.number;
    return composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'),
      title: `فاتورة ${number}`,
      lang: 'ar',
      stripSelectors: ['.no-print'],
    });
  }, [data, t]);

  const printWarnings = useMemo(
    () => (printData ? validateInvoicePrintData(printData) : []),
    [printData],
  );

  const EngineComponent = resolvedTemplate.component as ComponentType<{ data?: InvoicePrintData }>;

  useEffect(() => {
    if (data && printData === null) {
      setPreviewMode('legacy');
      setEngineWarning(t('msg.template_load_failed'));
    }
  }, [data, printData, t]);

  if (loadError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: DOC_FONT_STACK }}>
        <p style={{ color: '#dc2626', fontWeight: 700 }}>⚠️ {loadError}</p>
        <button className="btn secondary" onClick={() => navigate('/invoices')} style={{ marginTop: 16 }}>
          ← {t('btn.inv.back')}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: DOC_FONT_STACK }}>
        <div className="spinner" />
        <p style={{ marginTop: 12, color: '#64748b' }}>{t('msg.loading')}</p>
      </div>
    );
  }

  const remaining = Number(data.total) - Number(data.paidAmount);
  const collectionPct = data.total > 0
    ? ((Number(data.paidAmount) / Number(data.total)) * 100).toFixed(1)
    : '0.0';
  const canEdit = canEditInvoice(data.status, data.paidAmount);
  const canCollect = data.status !== 'PAID' && data.status !== 'CANCELLED';
  const canCancel = data.status !== 'CANCELLED' && Number(data.paidAmount) === 0;
  const hasPayments = data.payments.length > 0;

  const partyName = data.customer ? resolveName(data.customer, lang) : data.supplier ? resolveName(data.supplier, lang) : '—';
  const billingPeriod = data.billingMonth && data.billingYear
    ? `${ARABIC_MONTHS[data.billingMonth - 1]} ${data.billingYear}`
    : '—';
  const directionLabel = data.direction === 'SALES'
    ? t('opt.direction.sales') : data.direction === 'PURCHASE'
    ? t('opt.direction.purchase') : data.direction;

  const lastPaymentDate = hasPayments
    ? data.payments.reduce((max, p) => p.date > max ? p.date : max, data.payments[0].date)
    : null;

  function handleCancel() { setShowCancelConfirm(true); }

  async function executeCancel() {
    setShowCancelConfirm(false);
    setActionError('');
    try {
      await api.patch(`/invoices/${data!.id}/cancel`);
      const res = await api.get(`/invoices/${data!.id}`);
      setData(res.data.data);
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function handleCollect() {
    setPayError('');
    setPaySaving(true);
    try {
      await api.post(`/invoices/${data!.id}/payments`, { amount: Number(payAmount), method: payMethod });
      const res = await api.get(`/invoices/${data!.id}`);
      setData(res.data.data);
      setPaying(false);
    } catch (e) {
      setPayError(errorMessage(e));
    } finally {
      setPaySaving(false);
    }
  }

  return (
    <>
      <style>{`
        @media screen { .inv-wrap { min-height: 100vh; } .print-only { display: none; } }
        @media print {
          @page { size: A4; margin: 8mm 10mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .inv-wrap { padding: 4px 8px !important; max-width: 100% !important; }
          .inv-print-header { border-bottom: 2px solid #1d4e6f !important; margin-bottom: 10px !important; padding-bottom: 8px !important; }
          table { margin-bottom: 6px !important; font-size: 11.5px !important; }
          table th, table td { padding: 3px 7px !important; }
          .inv-section-title { font-size: 12px !important; margin-top: 8px !important; margin-bottom: 6px !important; padding-bottom: 3px !important; }
          .inv-frow { margin-bottom: 3px !important; font-size: 12px !important; }
          .inv-totals { font-size: 12px !important; }
          .inv-sig { margin-top: 14px !important; }
          .engine-hide-legacy { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
        }
        .engine-hide-legacy {
          display: none !important;
          visibility: hidden !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        .inv-nav-anchor { scroll-margin-top: 80px; }
        .inv-quick-nav { display: flex; gap: 8px; align-items: center; font-size: 13px; }
        .inv-quick-nav a {
          color: #1d4e6f; text-decoration: none; font-weight: 600; padding: 4px 10px;
          border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff;
          transition: background 0.15s;
        }
        .inv-quick-nav a:hover { background: #dbeafe; }
        .inv-status-badge {
          display: inline-block; padding: 2px 10px; border-radius: 12px;
          font-size: 12px; font-weight: 700; color: #fff;
        }
        .inv-collection-chip {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
          padding: 10px 14px; text-align: center;
        }
        .inv-collection-chip-label { font-size: 11px; color: #64748b; margin-bottom: 3px; }
        .inv-collection-chip-val { font-size: 16px; font-weight: 800; }
        .inv-pay-row:nth-child(even) { background: #f8fafc; }
      `}</style>

      {/* المعاينة الدقيقة (True Chromium WYSIWYG) — نفس مُركِّب المستند، ونفس مسار
          الطباعة القديم. مسار الطباعة نفسه لا يتأثر بفشل توليد المعاينة. */}
      {useWysiwygPoc && (
        <WysiwygPreviewPocDialog
          open={wysiwygPocOpen}
          onClose={() => setWysiwygPocOpen(false)}
          compose={composeInvoicePreview}
          onPrint={() => printCurrentView()}
          documentLabel={data ? t('lbl.doc_label.invoice', { number: data.invoiceNumber ?? data.number }) : ''}
        />
      )}

      <div ref={printRootRef} className="inv-wrap" style={{
        padding: '16px 24px', fontFamily: DOC_FONT_STACK,
        maxWidth: 900, margin: '0 auto', color: '#0f172a',
        background: '#fff', direction: 'rtl',
      }}>

        {/* ── Toolbar (hidden on print) ── */}
        {/* ── الصف الأول: الأوامر الأساسية (حجم Desktop ERP مدمج، محصور بـ .invx-actions) ──
            الترتيب في RTL من اليمين: رجوع · طباعة · معاينة · PDF · وضع التصميم · تعديل ·
            قالب الطباعة. «طباعة» وحده الإجراء الأبرز.

            «تحصيل» و«إلغاء» أُزيلا من **هذا الشريط فقط**: لا ينتميان إلى سياق الطباعة،
            وكانا يزاحمان الأوامر الأساسية. لا إجراء خطر (destructive) في شاشة الطباعة بعد
            اليوم. الوظيفتان ومنطقهما وصلاحياتهما وواجهاتهما وقيودهما المحاسبية باقية بلا
            تغيير، والزران باقيان في مواضعهما التشغيلية: قائمة الفواتير (Quick Actions +
            Danger Actions)، والتفاصيل، والـ Drawer. presentation-only. */}
        <div className="no-print invx-actions" style={{ marginBottom: 12 }}>
          <button type="button" className="btn secondary" onClick={() => navigate('/invoices')}>
            ← {t('btn.inv.back')}
          </button>
          {/* الإجراء الأساسي — زر الطباعة الأصلي. باقٍ كما كان تمامًا: يستدعي مسار
              الطباعة القديم مباشرة، ولا يفتح المعاينة، ولا يتأثر بعلم المعاينة.
              (الخلل السابق: استبدلتُ هذا الزر بزر المعاينة — الآن الإجراءان مستقلان.) */}
          <button type="button" className="btn" onClick={() => printCurrentView()}>
            🖨️ {t('btn.inv.print_invoice')}
          </button>

          {/* معاينة دقيقة — الصفحات كما ستخرج من الطابعة. لا تطبع عند الفتح. */}
          {useWysiwygPoc && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => setWysiwygPocOpen(true)}
              title={t('title.accurate_preview')}
            >
              📄 {t('btn.accurate_preview')}
            </button>
          )}

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
          {previewMode === 'legacy' && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => designer.isActive ? designer.deactivate() : designer.activate()}
              style={{ fontWeight: 600 }}
            >
              {designer.isActive ? `✓ ${t('btn.finish_design')}` : `🔧 ${t('btn.design_mode')}`}
            </button>
          )}
          {previewMode === 'engine' && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => layoutDesigner.isActive ? layoutDesigner.deactivate() : layoutDesigner.activate()}
              style={{ fontWeight: 600 }}
            >
              {layoutDesigner.isActive ? `✓ ${t('btn.finish_layout')}` : `🔲 ${t('btn.layout_mode')}`}
            </button>
          )}
          {hasPermission('invoices.update') && canEdit && (
            <button type="button" className="btn secondary" onClick={() => navigate('/invoices')}>
              {t('action.edit')}
            </button>
          )}
          {/* زر «تحصيل» أُزيل من شريط شاشة الطباعة/المعاينة فقط — لا ينتمي إلى سياق
              الطباعة ويزحم الشريط. وظيفة التحصيل ومنطقها وصلاحياتها (invoices.update /
              canCollect / handlePay / نافذة الدفع) كلها باقية بلا تغيير، ويبقى الزر في
              مواضعه التشغيلية: قائمة الفواتير، تفاصيل الفاتورة، والـ Drawer.
              presentation-only — لا API ولا workflow ولا حالة فاتورة تغيّرت. */}
          {/* أداة إعداد — تحلّ محل «إلغاء» في نهاية مجموعة الأدوات. أخفّ بروزًا من
              «طباعة»، ومتناسقة مع «وضع التصميم» و«تعديل». منطق اختيار القالب وحفظه
              لم يتغيّر إطلاقًا؛ نُقل موضع الزر فقط. */}
          <button
            type="button"
            className="btn secondary"
            onClick={() => setPreviewMode(m => m === 'legacy' ? 'engine' : 'legacy')}
            disabled={!printData}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, verticalAlign: 'text-bottom', marginInlineEnd: 4 }}>
              {previewMode === 'engine' ? 'description' : 'dashboard_customize'}
            </span>
            {previewMode === 'engine' ? t('btn.classic_view') : t('btn.print_template')}
          </button>
          {studioTemplate && previewMode === 'engine' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer', padding: '5px 9px', background: useStudio ? '#dbeafe' : '#f8fafc', border: '1px solid #bfdbfe', borderRadius: 8 }}>
              <input
                type="checkbox"
                checked={useStudio}
                onChange={(e) => setUseStudio(e.target.checked)}
              />
              {t('lbl.use_template_studio')}
            </label>
          )}
          {actionError && <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>⚠️ {actionError}</span>}
        </div>

        {/* ── الصف الثاني: خيارات محتوى المستند — التوقيع والختم فقط.
            «قالب الطباعة» انتقل إلى الصف الأساسي؛ هذا الصف لا يُعرض أصلًا إن لم تكن
            خيارات المحتوى جاهزة، فلا يبقى فراغ بصري مكان الزر المنقول. ── */}
        {brandingSelection.ready && (
          <div className="no-print invx-doc-settings">
            <BrandingAssetPicker selection={brandingSelection} />
          </div>
        )}

        {/* ── Engine template selector (engine mode only, hidden on print) ── */}
        {previewMode === 'engine' && printData && (
          <div className="no-print" style={{ marginBottom: 12, padding: '8px 12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
            <PrintTemplateSelector category="invoice" profile={profile} onSelect={setProfile} />
          </div>
        )}

        {/* ── Engine / data warnings (hidden on print) ── */}
        {previewMode === 'engine' && (engineWarning || printWarnings.length > 0) && (
          <div className="no-print" style={{ marginBottom: 12, padding: '8px 14px', background: '#fef9c3', borderRadius: 8, border: '1px solid #fde047', fontSize: 13, color: '#713f12' }}>
            {engineWarning && <p style={{ margin: '2px 0' }}>⚠️ {engineWarning}</p>}
            {printWarnings.map(w => (
              <p key={w.field} style={{ margin: '2px 0' }}>⚠️ {w.messageAr}</p>
            ))}
          </div>
        )}

        {/* ── Legacy preview content (hidden in engine mode) ── */}
        <UniversalDesignerOverlay
          layoutDesigner={layoutDesigner}
          designer={designer}
          textStyleDesigner={textDesigner}
          staticTextDesigner={staticTextDesigner}
          signatureUrl={brandingSelection.signatureUrl}
          stampUrl={brandingSelection.stampUrl}
          docLabel={t('lbl.doc.invoice')}
          onSave={async () => {
            await Promise.all([layoutDesigner.save(), designer.save(), textDesigner.save(), staticTextDesigner.save()]);
          }}
        >
        <div className={previewMode === 'engine' ? 'engine-hide-legacy' : undefined}>

          {/* ── Quick Navigation (screen only) ── */}
          {hasPayments && (
            <div className="no-print" style={{ marginBottom: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div className="inv-quick-nav">
                <span style={{ color: '#64748b', fontWeight: 700, fontSize: 12 }}>{t('lbl.jump_to')}</span>
                <a href="#inv-details">{t('nav.invoice_details')}</a>
                <a href="#inv-collections">{t('nav.collection_summary')}</a>
                <a href="#inv-payments">{t('nav.payment_log')}</a>
                <a href="#inv-summary">{t('action.financial_summary')}</a>
              </div>
            </div>
          )}

          {/* ── Inline payment form (hidden on print) ── */}
          {paying && (
            <div className="no-print" style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16, marginBottom: 16, maxWidth: 440,
            }}>
              <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
                {t('modal.collect_payment')} — {t('lbl.remaining')} {money(remaining)}
              </p>
              {payError && <div className="alert error" style={{ marginBottom: 8 }}>⚠️ {payError}</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('field.amount_kd')}</label>
                  <input
                    type="number" step="0.001" value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, width: 130 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('field.payment_method')}</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                    style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
                    <option value="CASH">{t('opt.payment.cash')}</option>
                    <option value="BANK">{t('opt.payment.bank')}</option>
                    <option value="CHEQUE">{t('opt.payment.cheque')}</option>
                    <option value="TRANSFER">{t('opt.payment.transfer')}</option>
                  </select>
                </div>
                <button type="button" className="btn" onClick={handleCollect} disabled={paySaving}>
                  {paySaving ? t('msg.saving') : t('btn.record_payment')}
                </button>
                <button type="button" className="btn secondary" onClick={() => setPaying(false)}>{t('action.cancel')}</button>
              </div>
            </div>
          )}

          {/* ── Print Header (print only) — clean professional layout ── */}
          <div className="print-only inv-print-header" style={{
            borderBottom: '2px solid #1d4e6f', marginBottom: 12, paddingBottom: 8,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1d4e6f', lineHeight: 1.4 }}>شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م</div>
          </div>

          {/* ── Section 1: Invoice Details ── */}
          <div id="inv-details" className="inv-nav-anchor">
            <div className="inv-section-title" style={secTitle} data-designer-type="text" data-designer-id="invoice.sectionTitle">
              <span>{t('page.invoice_preview.section.header')}</span>
              <span className="no-print" style={{
                marginInlineStart: 10, fontSize: 12, fontWeight: 700,
                background: STATUS_COLOR[data.status] ?? '#6b7280',
                color: '#fff', padding: '1px 10px', borderRadius: 12,
              }}>
                {STATUS_LABEL_KEY[data.status] ? t(STATUS_LABEL_KEY[data.status]) : data.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 24px' }}>
              <div className="inv-frow" style={fRow}><span style={fLbl}>{t('col.inv.number')}</span><span style={{ ...fVal, fontFamily: 'monospace' }}>{data.invoiceNumber ?? data.number}</span></div>
              <div className="inv-frow" style={fRow}><span style={fLbl}>{t('lbl.inv.issue_date')}</span><span style={fVal}>{dateText(data.issueDate)}</span></div>
              <div className="inv-frow" style={fRow}><span style={fLbl}>{t('col.inv.direction')}</span><span style={fVal}>{directionLabel}</span></div>
              <div className="inv-frow" style={fRow}><span style={fLbl}>{t('lbl.inv.billing_period')}</span><span style={fVal}>{billingPeriod}</span></div>
              <div className="inv-frow" style={fRow}><span style={fLbl}>{t('col.inv.type')}</span><span style={fVal}>{data.invoiceType}</span></div>
              {data.dueDate && (
                <div className="inv-frow" style={fRow}><span style={fLbl}>{t('lbl.inv.due_date')}</span><span style={fVal}>{dateText(data.dueDate)}</span></div>
              )}
            </div>
          </div>

          {/* ── Section 2: Party & Contract ── */}
          <div style={secTitle} data-designer-type="text" data-designer-id="invoice.sectionTitle">{data.contract ? t('page.invoice_preview.section.party') : t('col.inv.party')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 24px' }} data-designer-type="text" data-designer-id="invoice.customerBlock">
            <div className="inv-frow" style={fRow}>
              <span style={fLbl}>{data.customer ? t('col.customer') : t('col.supplier')}</span>
              <span style={fVal}>{partyName}</span>
            </div>
            {data.contract && (
              <>
                {data.contract.code && (
                  <div className="inv-frow" style={fRow}>
                    <span style={fLbl}>{t('col.contract_no')}</span>
                    <span style={fVal}>{data.contract.code}</span>
                  </div>
                )}
                <div className="inv-frow" style={fRow}>
                  <span style={fLbl}>{t('field.linked_contract')}</span>
                  <span style={fVal}>{data.contract.asphaltPlant}</span>
                </div>
              </>
            )}
          </div>

          {/* ── Section 3: Line Items ── */}
          <div style={secTitle} data-designer-type="text" data-designer-id="invoice.sectionTitle">{t('lbl.items')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }} data-designer-type="text" data-designer-id="invoice.tableBorder">
            <thead data-designer-type="text" data-designer-id="invoice.tableHeader">
              <tr>
                <th style={th}>{t('col.description')}</th>
                <th style={{ ...th, width: 72, textAlign: 'center' }}>{t('ph.qty')}</th>
                <th style={{ ...th, width: 72, textAlign: 'center' }}>{t('col.inv.unit')}</th>
                <th style={{ ...th, width: 115, textAlign: 'end' }}>{t('lbl.inv.unit_price')}</th>
                <th style={{ ...th, width: 115, textAlign: 'end' }}>{t('col.inv.total')}</th>
              </tr>
            </thead>
            <tbody data-designer-type="text" data-designer-id="invoice.lineItem">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.description}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.quantity}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ ...td, ...moneyCell, textAlign: 'end' }}>{money(item.unitPrice)}</td>
                  <td style={{ ...td, ...moneyCell, textAlign: 'end', fontWeight: 700 }}>{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Section 4: Financial Summary ── */}
          <div id="inv-summary" className="inv-nav-anchor">
            <div style={secTitle} data-designer-type="text" data-designer-id="invoice.sectionTitle">{t('page.invoice_preview.section.financial')}</div>
            <div className="inv-totals" style={{ maxWidth: 340, marginInlineStart: 'auto' }} data-designer-type="text" data-designer-id="invoice.totals">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                <span style={fLbl}>{t('lbl.inv.subtotal')}</span><span style={fValMoney}>{money(data.subtotal)}</span>
              </div>
              {Number(data.discount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                  <span style={fLbl}>{t('field.inv.discount_kd')}</span>
                  <span style={{ ...fValMoney, color: '#dc2626' }}>−{money(data.discount)}</span>
                </div>
              )}
              {Number(data.taxAmount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                  <span style={fLbl}>{t('lbl.inv.tax')} ({data.taxRate}%)</span>
                  <span style={fValMoney}>{money(data.taxAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '2px solid #1d4e6f', fontSize: 16, fontWeight: 800 }}>
                <span style={{ color: '#1d4e6f' }}>{t('lbl.inv.grand_total')}</span>
                <span style={{ ...moneyCell, display: 'inline-block', color: '#1d4e6f' }}>{money(data.total)}</span>
              </div>
              {/* Paid / Remaining — shown on screen and print */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #e2e8f0', fontSize: 13 }}>
                <span style={fLbl}>{t('col.inv.paid')}</span>
                <span style={{ ...fValMoney, color: '#16a34a' }}>{money(data.paidAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, fontWeight: 800 }}>
                <span style={{ ...fLbl, fontSize: 14, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>
                  {t('lbl.inv.remaining_amount')}
                </span>
                <span style={{ ...moneyCell, display: 'inline-block', fontWeight: 800, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>{money(remaining)}</span>
              </div>
            </div>
          </div>

          {/* ── Section 5: Collection Summary (screen only) ── */}
          {hasPayments && (() => {
            const methodTotals = data.payments.reduce((acc: Record<string, number>, p: { method: string; amount: number | string }) => {
              acc[p.method] = (acc[p.method] ?? 0) + Number(p.amount);
              return acc;
            }, {});
            const methodBreakdown = Object.entries(methodTotals).filter(([, v]) => v > 0);
            return (
              <div id="inv-collections" className="inv-nav-anchor no-print">
                <div style={secTitle}>{t('nav.collection_summary')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                  <div className="inv-collection-chip">
                    <div className="inv-collection-chip-label">{t('lbl.total_collected_chip')}</div>
                    <div className="inv-collection-chip-val" style={{ ...moneyCell, color: '#16a34a' }}>{money(data.paidAmount)}</div>
                  </div>
                  <div className="inv-collection-chip">
                    <div className="inv-collection-chip-label">{t('lbl.inv.remaining_amount')}</div>
                    <div className="inv-collection-chip-val" style={{ ...moneyCell, color: remaining > 0 ? '#dc2626' : '#16a34a' }}>{money(remaining)}</div>
                  </div>
                  <div className="inv-collection-chip">
                    <div className="inv-collection-chip-label">{t('lbl.collection_rate')}</div>
                    <div className="inv-collection-chip-val" style={{ color: '#1d4e6f' }}>{collectionPct}%</div>
                  </div>
                  <div className="inv-collection-chip">
                    <div className="inv-collection-chip-label">{t('lbl.payment_count_chip')}</div>
                    <div className="inv-collection-chip-val" style={{ color: '#0f172a' }}>{data.payments.length}</div>
                  </div>
                </div>
                {methodBreakdown.length > 1 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {methodBreakdown.map(([method, total]) => (
                      <span key={method} style={{
                        fontSize: 12, padding: '3px 10px',
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20,
                        color: '#475569', fontWeight: 600,
                      }}>
                        {PAY_METHOD_AR[method] ? t(PAY_METHOD_AR[method].key) : method}: <span style={{ ...moneyCell, display: 'inline-block', color: '#16a34a' }}>{money(total)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {lastPaymentDate && (
                  <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 4px' }}>
                    {t('lbl.last_payment_prefix')} <strong>{dateText(lastPaymentDate)}</strong>
                  </p>
                )}
              </div>
            );
          })()}

          {/* ── Section 6: Payment History ── */}
          {hasPayments && (
            <div id="inv-payments" className="inv-nav-anchor">
              <div style={secTitle}>{t('lbl.inv.payment_history')}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 50, textAlign: 'center' }}>#</th>
                    <th style={th}>{t('col.date')}</th>
                    <th style={{ ...th, width: 130, textAlign: 'end' }}>{t('col.amount')}</th>
                    <th style={{ ...th, width: 100 }}>{t('field.payment_method')}</th>
                    <th style={th}>{t('field.inv.reference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p, idx) => (
                    <tr key={p.id} className="inv-pay-row">
                      <td style={{ ...td, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                      <td style={td}>{dateText(p.date)}</td>
                      <td style={{ ...td, fontWeight: 700, textAlign: 'end', color: '#16a34a' }}>{money(p.amount)}</td>
                      <td style={td}>{PAY_METHOD_AR[p.method]?.ar ?? p.method}</td>
                      <td style={{ ...td, color: '#64748b' }}>{p.reference ?? '—'}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ background: '#f1f5f9' }}>
                    <td colSpan={2} style={{ ...td, fontWeight: 700, fontSize: 13 }}>{t('lbl.total_row')}</td>
                    <td style={{ ...td, fontWeight: 800, textAlign: 'end', color: '#16a34a', fontSize: 14 }}>{money(data.paidAmount)}</td>
                    <td colSpan={2} style={td} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Notes ── */}
          {data.notes && (
            <>
              <div style={secTitle}>{t('field.notes')}</div>
              <p style={{ fontSize: 13, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, margin: '0 0 12px' }}>
                {data.notes}
              </p>
            </>
          )}

          {/* ── Signature Area ── */}
          <div className="inv-sig" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 16, pageBreakInside: 'avoid' }}>
            {/* Column: التوقيع والختم (party) */}
            <div key="party-sig" style={{ flex: 1, textAlign: 'center', minWidth: 130 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1d4e6f', marginBottom: 3 }}>التوقيع والختم</div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                {data.customer ? resolveName(data.customer, lang) : data.supplier ? resolveName(data.supplier, lang) : 'الجهة المستلمة'}
              </div>
              <div style={{ height: 36 }} />
              <div style={{ borderTop: '1px solid #94a3b8' }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>التوقيع / Signature</div>
            </div>
            {/* Column: المسؤول (our signature + stamp) */}
            <div key="mgr-sig" style={{ flex: 1, textAlign: 'center', minWidth: 130 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1d4e6f', marginBottom: 3 }}>المسؤول</div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م</div>
              {brandingSelection.showSignature && brandingSelection.signatureUrl ? (() => {
                const invLayout = getBrandingLayoutForDocument(effectiveBrandingLayout, 'invoice');
                const ink = resolveInkMode(invLayout.signature.inkMode);
                return (
                  <>
                    <InkColorFilterDefs mode={ink} />
                    <img
                      src={brandingSelection.signatureUrl}
                      alt="توقيع المدير"
                      data-bd-type="signature"
                      data-designer-type="branding"
                      data-designer-id="signature"
                      style={{ maxHeight: 40, maxWidth: 120, objectFit: 'contain', display: 'block', margin: '0 auto', ...applyBrandingElementStyle(invLayout.signature), ...getInkFilterStyle(ink) }}
                    />
                  </>
                );
              })() : (
                <div style={{ height: 40 }} />
              )}
              {brandingSelection.showStamp && brandingSelection.stampUrl && (() => {
                const invLayout = getBrandingLayoutForDocument(effectiveBrandingLayout, 'invoice');
                const ink = resolveInkMode(invLayout.stamp.inkMode);
                return (
                  <>
                    <InkColorFilterDefs mode={ink} />
                    <img
                      src={brandingSelection.stampUrl}
                      alt="ختم الشركة"
                      data-bd-type="stamp"
                      data-designer-type="branding"
                      data-designer-id="stamp"
                      style={{ maxHeight: 36, maxWidth: 100, objectFit: 'contain', display: 'block', margin: '4px auto 0', ...applyBrandingElementStyle(invLayout.stamp), ...getInkFilterStyle(ink) }}
                    />
                  </>
                );
              })()}
              <div style={{ borderTop: '1px solid #94a3b8', marginTop: 4 }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>التوقيع / Signature</div>
            </div>
            {/* Column: المحاسبة (unchanged) */}
            <div key="acct-sig" style={{ flex: 1, textAlign: 'center', minWidth: 130 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#1d4e6f', marginBottom: 3 }}>المحاسبة</div>
              <div style={{ height: 36 }} />
              <div style={{ borderTop: '1px solid #94a3b8' }} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>التوقيع / Signature</div>
            </div>
          </div>

        </div>{/* end legacy wrapper */}

        {/* ── Engine template render (inside overlay so dblclick editable handler fires) ── */}
        {previewMode === 'engine' && printData && !useStudio && (
          <>
            <LayoutOverrideStyles overrides={effectiveLayoutOverrides.invoice} />
            <EngineComponent data={printData} />
            {data?.verificationUuid && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 8px 0' }}>
                <DocumentVerificationQR uuid={data.verificationUuid} size={72} />
              </div>
            )}
          </>
        )}

        {/* ── Template Studio renderer (optional, default OFF) ── */}
        {previewMode === 'engine' && useStudio && studioTemplate && data && (
          <TemplateStudioRenderer
            template={studioTemplate}
            data={{
              number:          data.invoiceNumber ?? data.number ?? '',
              date:            data.issueDate ?? '',
              customerName:    data.customer ? resolveName(data.customer, lang) : data.supplier ? resolveName(data.supplier, lang) : '',
              customerAddress: '',
              total:           money(data.total ?? 0),
              subtotal:        money(data.subtotal ?? 0),
              discount:        money(data.discount ?? 0),
              tax:             money(data.taxAmount ?? 0),
              grandTotal:      money(data.total ?? 0),
              notes:           data.notes ?? '',
            }}
            lineItems={resolveInvoiceLineItems(data.items)}
          />
        )}
        </UniversalDesignerOverlay>

      </div>

      {designer.isActive && (
        <BrandingDesignerPanel
          designer={designer}
          textStyleDesigner={textDesigner}
          staticTextDesigner={staticTextDesigner}
          docLabel={t('lbl.doc.invoice')}
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
          docLabel={t('lbl.doc.invoice')}
          onClose={layoutDesigner.deactivate}
          onSave={async () => {
            await Promise.all([layoutDesigner.save(), designer.save(), textDesigner.save(), staticTextDesigner.save()]);
          }}
        />
      )}
      {showCancelConfirm && (
        <ConfirmModal
          title={t('dlg.cancel_invoice.title')}
          message={t('confirm.cancel_invoice')}
          confirmLabel={t('dlg.cancel_invoice.confirm_btn')}
          variant="danger"
          onConfirm={executeCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </>
  );
}
