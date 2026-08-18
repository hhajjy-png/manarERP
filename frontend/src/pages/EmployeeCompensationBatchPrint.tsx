/**
 * **الطباعة الجماعية** لمستحقات موظف عن سنة كاملة — معاينة · طباعة · PDF.
 *
 * ═══ ما هذه الشاشة ═══
 * تجميعٌ وترتيبٌ لمستندات **قائمة** لا مستند جديد. لكل شهر له كشف في السنة المختارة
 * تُصيَّر ورقتان بالترتيب: كشف المستحقات ثم سند الصرف الخاص به. لا حساب واحد يُعاد،
 * ولا اعتماد يُمسّ، ولا لقطة تُكتب، ولا قيد محاسبي يُنشأ: كل ما هنا قراءة.
 *
 * ═══ المطابقة مع الطباعة الفردية — بنيويًا لا انضباطًا ═══
 *   · البيانات: مسار `/years/:year/statements` يبني كل كشف بنفس دالة الخادم التي
 *     يستدعيها مسار الكشف الفردي (`getStatementData`)، فلا مصدر ثانٍ للأرقام.
 *   · القالبان: `StatementTemplate` و`CashPaymentVoucherTemplate` كما هما، بلا نسخة
 *     ولا تعديل ولا خيار عرض إضافي.
 *   · الورقة: `FormPage` — **نفس** المكوّن الذي يصيّره `FormLayout` للطباعة الفردية.
 *   · المرجع ورمز التحقق: `voucherReference` و`buildVoucherQrLines`
 *     و`buildStatementQrLines` مستوردة من مصادرها الأصلية، فلا رقم مرجعي يُعاد
 *     اشتقاقه هنا.
 *
 * ═══ ورق الشركة الرسمي لكل صفحة في الدفعة ═══
 * الدفعة كلها — كل كشف وكل سند وكل شهر — تُطبع على ملف تعريف **`letterhead`** وحده،
 * أيًّا كان الملف الذي يُطبع به المستند منفردًا. الدفعة تُسحب على رزمة واحدة من ورق
 * الشركة المطبوع مسبقًا، فورقةٌ واحدة بهوامش مختلفة داخلها تخرج مزاحة عن الرزمة.
 *
 * القيم لا تُكتب هنا: `BATCH_PROFILE` يقرأ `PRINT_PROFILES.letterhead` كما هو —
 * هوامشه (٤٠/١٠/٢٠/١٠) وعلَم `blankHeader` معًا. تعديل ملف التعريف يصل الدفعة تلقائيًا.
 *
 * **ولا ترويسة إلكترونية**: `blankHeader` يُخفي ترويسة الشركة — الورقة تحملها مطبوعة.
 * ولا فاصل علوي داخل الورقة أيضًا (`contentTopOffset` مُغفَل): الخلوص العلوي واحد لا
 * اثنان، وخلوصٌ ثانٍ فوق الأول هو بعينه ما كان يدفع التذييل إلى صفحة ثانية (انظر
 * تعليل `isLetterhead` في `FormHeader`).
 *
 * ═══ بداية المحتوى: لكل نوع مستند خلوصه ═══
 * `BATCH_CONTENT_TOP` يربط **كل نوع مستند** ببداية محتواه مقيسةً من حافة الورقة
 * العليا: الكشف ٥ سم، والسند ٣ سم. السند أقصر محتوًى ويحمل كتلتَي توقيع في ذيله،
 * فرفعه ٢ سم يوسّع مساحته السفلية بلا أن يقترب من الترويسة المطبوعة على الورقة.
 *
 * القيم **مطلقة** لا مشتقّة من هامش ملف التعريف العلوي: المواصفة تقاس من حافة
 * الورقة، فاشتقاقها جمعًا (٤٠مم + كذا) كان سينزلق بصمت لو عُدِّل هامش `letterhead`
 * العلوي يومًا. أما الجوانب والأسفل فتبقى هوامش ملف التعريف كما هي لكل المستندات،
 * بلا تكرار لقيمها هنا.
 *
 * الجدول هو المصدر الوحيد: قواعد CSS تُولَّد بالمرور عليه، فنوعُ مستندٍ يُضاف مستقبلًا
 * لا يمكن أن يخرج بلا خلوص علوي معرَّف.
 *
 * ═══ الهوامش: لماذا حشوٌ لا هامش صفحة ═══
 * `@page` تُصفَّر وتُعاد **نفس قيم ملف التعريف حرفيًا** حشوًا على ورقة كل مستند — نفس
 * النموذج الذي يستعمله `FormLayout` أصلًا لملف تعريف «ورق جاهز» (هامش الصفحة ← حشو
 * الورقة)، فصندوق المحتوى يقع في نفس الموضع من الورقة تمامًا. والمستندان صفحةٌ واحدة
 * كلٌّ منهما بحكم تصميمهما، فلا صفحة فائضة يفقد النموذجُ فيها هامشها.
 *
 * ═══ الفصل بين المستندات ═══
 * `break-before: page` على كل مستند عدا الأول — لا على «بعد» — فلا تخرج صفحة بيضاء
 * زائدة في نهاية الدفعة.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import StatementTemplate from '../employee-compensation/StatementTemplate';
import CashPaymentVoucherTemplate, { buildVoucherQrLines } from '../employee-compensation/CashPaymentVoucherTemplate';
import { buildStatementQrLines } from '../employee-compensation/statementBilingual';
import { deriveCashEntitlement } from '../employee-compensation/cashEntitlement';
import { monthNameAr } from '../employee-compensation/labels';
import type { StatementData } from '../employee-compensation/types';
import { voucherReference } from './EmployeeCompensationVoucher';
import FormPage from '../forms/shared/FormPage';
import FormHeader from '../forms/shared/FormHeader';
import type { QRData } from '../forms/shared/FormQRCode';
import { PRINT_PROFILES, type ProfileId } from '../forms/shared/printProfiles';
import { useFormOpenIntent, useFormPreviewInitialZoom } from '../forms/shared/formOpenIntent';
import { PrintWorkspace } from '../components/print-workspace';
import { DOC_FONT_STACK } from '../styles/fontRegistry';
import {
  composeStyledFromNode,
  createPrintJob,
  isFlagEnabled,
  submitPrintJob,
  useAccurateFormPreview,
  waitForPrintReady,
  PRINT_CENTER_FOUNDATION_V1,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
  type PageSpec,
} from '../printing';
import { printCurrentView, printCurrentViewWithResult } from '../utils/print';
import { useT } from '../lib/i18n';
import './EmployeeCompensationBatchPrint.css';

/**
 * ملف تعريف الطباعة **الوحيد** للدفعة كلها. يُقرأ من `PRINT_PROFILES` كما هو، فلا قيمة
 * هامش ولا علَم ترويسة مكرَّر في هذا الملف.
 */
const BATCH_PROFILE: ProfileId = 'letterhead';
const BATCH_MARGINS = PRINT_PROFILES[BATCH_PROFILE].margins;
/** `true` لـ`letterhead` ⇒ لا ترويسة إلكترونية: الورقة تحملها مطبوعة. */
const BATCH_BLANK_HEADER = PRINT_PROFILES[BATCH_PROFILE].blankHeader;

/**
 * بداية محتوى كل نوع مستند في الدفعة، مقيسةً من **حافة الورقة العليا**.
 *
 * خاصٌّ بالطباعة الجماعية وحدها: لا يمسّ `PRINT_PROFILES` ولا `FormLayout` ولا
 * `FormPage`، فالطباعة الفردية للكشف والسند تخرج كما كانت حرفًا بحرف. ويُطبَّق حشوًا
 * على الورقة لا هامشَ `@page` — نفس نموذج بقية هوامش الدفعة، فالخلوص واحد في
 * الطباعة و«حفظ PDF» والمعاينة الدقيقة معًا.
 *
 * النوع `Record<BatchDocKind, string>` يجعل الإغفال خطأ ترجمة لا مفاجأة على الورق.
 */
export const BATCH_CONTENT_TOP: Record<BatchDocKind, string> = {
  statement: '50mm',
  voucher: '30mm',
};

/**
 * مقاس صفحة الدفعة — A4 بهوامش **صفر**، لأن هوامش كل مستند تُطبَّق حشوًا على ورقته.
 * يُمرَّر بـ`forcePageSpec` كي لا ترث المعاينة الدقيقة و«حفظ PDF» هامش `@page`
 * العام (`1cm` في `app/theme.css`) الذي كان سيُضاف فوق حشو المستند.
 */
const BATCH_PAGE_SPEC: PageSpec = {
  id: 'a4-portrait',
  labelAr: 'A4 عمودي — طباعة جماعية',
  labelEn: 'A4 Portrait — Batch',
  paper: 'A4',
  orientation: 'portrait',
  margins: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
};

type BatchDoc =
  | { kind: 'statement'; key: string; month: number; data: StatementData }
  | { kind: 'voucher'; key: string; month: number; data: StatementData; reference: string };

/**
 * نوع مستند الدفعة — مُشتقّ من الاتحاد نفسه لا مُعادًا كتابته، فلا ينحرف عنه أبدًا.
 * (أسماء الأنواع في TypeScript غير مرتّبة، فاستعماله أعلاه في `BATCH_CONTENT_TOP`
 * سليم رغم تعريفه هنا.)
 */
export type BatchDocKind = BatchDoc['kind'];

/**
 * ترتيب الدفعة: كشف الشهر ← سند صرفه ← كشف الشهر التالي ← سند صرفه … دالة نقية
 * تُختبر بلا تصيير.
 *
 * الشهر بلا مبلغ نقدي مستحق (`cashNet <= 0`) لا سند له — وهو **نفس** الشرط الذي
 * تمنع به شاشة السند الفردية طباعته. كشفه يبقى في الدفعة؛ الغائب هو سنده وحده،
 * ويُبلَّغ به المستخدم صراحةً قبل الطباعة.
 */
export function buildBatchDocuments(statements: StatementData[]): {
  docs: BatchDoc[];
  monthsWithoutVoucher: number[];
} {
  const ordered = [...statements].sort((a, b) => a.month - b.month);
  const docs: BatchDoc[] = [];
  const monthsWithoutVoucher: number[] = [];

  for (const data of ordered) {
    docs.push({ kind: 'statement', key: `s-${data.id}`, month: data.month, data });
    const cash = deriveCashEntitlement({ basicSalary: data.basicSalary, totals: data.totals });
    if (cash.cashNet > 0) {
      docs.push({ kind: 'voucher', key: `v-${data.id}`, month: data.month, data, reference: voucherReference(data) });
    } else {
      monthsWithoutVoucher.push(data.month);
    }
  }

  return { docs, monthsWithoutVoucher };
}

/** رقم مستند الكشف — نفس الصيغة التي تطبعها شاشة الكشف الفردية. */
export function statementReference(data: StatementData): string {
  return `ECS-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`;
}

/**
 * قواعد طباعة الدفعة. القيم تصل من `PRINT_PROFILES` لا مكتوبة هنا، فتغيير هامش أي
 * ملف تعريف يصل الطباعتين — الفردية والجماعية — معًا.
 */
export function batchPrintCss(): string {
  // الجوانب والأسفل هوامش ملف التعريف كما هي، ومشتركة بين كل المستندات. أما العلوي
  // فيختلف بالنوع، فيُولَّد سطرًا لكل مفتاح في `BATCH_CONTENT_TOP` — لا قائمة يدوية
  // ثانية بجوار الجدول تُنسى عند إضافة نوع.
  const { right, bottom, left } = BATCH_MARGINS;
  const contentTopRules = (Object.keys(BATCH_CONTENT_TOP) as BatchDocKind[])
    .map(
      (kind) =>
        `      .ecmp-batch-doc--${kind} .form-page { padding-top: ${BATCH_CONTENT_TOP[kind]} !important; }`,
    )
    .join('\n');
  return `
    @media print {
      @page { size: A4; margin: 0; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
      }
      .no-print { display: none !important; }
      .ecmp-batch-doc + .ecmp-batch-doc {
        break-before: page;
        page-break-before: always;
      }
      /* هندسة الورقة المشتركة بين كل مستندات الدفعة — لا استثناء لنوع ولا لشهر.
         الحشو العلوي وحده يخصّ النوع، ويأتي في القواعد التالية. */
      .ecmp-batch-doc .form-page {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding-right: ${right} !important;
        padding-bottom: ${bottom} !important;
        padding-left: ${left} !important;
        box-sizing: border-box !important;
        overflow: visible !important;
        border: none !important;
        box-shadow: none !important;
      }
      /* بداية المحتوى من حافة الورقة العليا — لكل نوع مستند قيمته. */
${contentTopRules}
      .form-page-footer { page-break-inside: avoid; }
    }
  `;
}

export default function EmployeeCompensationBatchPrint() {
  const { t } = useT();
  const navigate = useNavigate();
  const { employeeId, year } = useParams<{ employeeId: string; year: string }>();
  const openedForPreview = useFormOpenIntent();
  const previewInitialZoom = useFormPreviewInitialZoom();

  const [statements, setStatements] = useState<StatementData[] | null>(null);
  const [error, setError] = useState('');
  /** يُقرّه المستخدم حين توجد أشهر بلا سند صرف — لا طباعة قبله. */
  const [missingAcknowledged, setMissingAcknowledged] = useState(false);
  const batchRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!employeeId || !year) return;
    let cancelled = false;
    setStatements(null);
    setError('');
    setMissingAcknowledged(false);
    compensationApi
      .yearStatements(Number(employeeId), Number(year))
      .then((res) => !cancelled && setStatements(res.statements))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [employeeId, year]);

  const { docs, monthsWithoutVoucher } = useMemo(
    () => buildBatchDocuments(statements ?? []),
    [statements],
  );

  const employeeName = statements?.[0]?.employee.fullName ?? '';
  const employeeCode = statements?.[0]?.employee.code ?? employeeId ?? '';
  const jobTitle = `${t('ecmp.batch.doc_title')} · ${employeeName} · ${year}`;
  const fileName = `ECB-${year}-${employeeCode}`;

  /**
   * الطباعة **جاهزة** فقط بعد وصول البيانات ووجود مستند واحد على الأقل وإقرار
   * المستخدم بالأشهر التي لا سند لها. قبل ذلك لا طباعة تلقائية ولا يدوية.
   */
  const blockedByMissing = monthsWithoutVoucher.length > 0 && !missingAcknowledged;
  const ready = statements !== null && docs.length > 0 && !blockedByMissing;

  /**
   * نفس بوابة الطباعة التي يستعملها `FormLayout` حرفيًا: نداء واحد، حوار واحد،
   * أمر طباعة واحد. البوابة نفسها تحمل حارس «طلب واحد في الطريق»، والمرجع المحلي
   * أدناه يمنع حتى تكوين الطلب الثاني.
   */
  const printingRef = useRef(false);
  const doPrint = useCallback(async () => {
    if (printingRef.current) return;
    printingRef.current = true;
    try {
      if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1)) {
        await printCurrentViewWithResult();
        return;
      }
      await submitPrintJob(
        createPrintJob({
          docType: 'form',
          documentId: fileName,
          destination: 'printer',
          copies: 1,
          title: jobTitle,
          documentLabel: jobTitle,
          renderSource: 'dom-node',
        }),
      );
    } finally {
      printingRef.current = false;
    }
  }, [fileName, jobTitle]);

  /** «حفظ PDF» — نفس المُركِّب الذي تستهلكه المعاينة الدقيقة، على نفس العقدة. */
  const compose = useCallback(() => {
    const node = batchRootRef.current;
    if (!node) throw new Error('تعذّر تجهيز المستندات للمعاينة.');
    return composeStyledFromNode({
      node,
      pageSpec: BATCH_PAGE_SPEC,
      // الدفعة تُصفّر هوامش الصفحة عمدًا؛ بلا الإجبار كانت سترث `@page { margin: 1cm }`
      // العامة فتُضاف فوق حشو كل مستند.
      forcePageSpec: true,
      title: jobTitle,
      lang: 'ar',
      stripSelectors: ['.no-print'],
    });
  }, [jobTitle]);

  const doExportPdf = useCallback(async () => {
    const exportFromHtml = window.manar?.exportPdfFromHtml;
    if (!exportFromHtml || !batchRootRef.current) {
      printCurrentView();
      return;
    }
    try {
      await exportFromHtml(compose(), fileName);
    } catch {
      printCurrentView();
    }
  }, [compose, fileName]);

  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    compose,
    onPrint: () => {
      void doPrint();
    },
    title: jobTitle,
    documentLabel: jobTitle,
    lang: 'ar',
  });

  /**
   * طباعة تلقائية واحدة عند الجاهزية — نفس عرف بقية النماذج، ونفس إلغائه بعلامة
   * «فُتح للعرض». الحارس `autoPrintedRef` يمنع تكرارها لو أُعيد التصيير.
   */
  const autoPrintedRef = useRef(false);
  useEffect(() => {
    if (!ready || openedForPreview || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    let canceled = false;
    void waitForPrintReady().then(() => {
      if (canceled) return;
      void doPrint();
    });
    return () => {
      canceled = true;
    };
  }, [ready, openedForPreview, doPrint]);

  if (error) return <div className="center-msg">{error}</div>;

  if (statements === null) {
    return (
      <div className="center-msg ecmp-batch-state" aria-busy="true">
        <div>{t('ecmp.batch.preparing')}</div>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="center-msg ecmp-batch-state">
        <div>{t('ecmp.batch.empty')}</div>
        <div className="ecmp-batch-actions">
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
            {t('ecmp.batch.back')}
          </button>
        </div>
      </div>
    );
  }

  const toolbar = (
    <>
      <button
        type="button"
        className="btn"
        disabled={blockedByMissing}
        onClick={() => {
          void doPrint();
        }}
      >
        🖨️ {t('ecmp.batch.print_all')}
      </button>
      <button
        type="button"
        className="btn secondary"
        disabled={blockedByMissing}
        onClick={() => {
          void doExportPdf();
        }}
      >
        📄 {t('ecmp.batch.save_pdf')}
      </button>
      <div className="pw-toolbar-group">{accurate.button}</div>
      <span className="pw-toolbar-spacer" />
      <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
        {t('ecmp.batch.back')}
      </button>
    </>
  );

  const sidebar = (
    <>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{t('ecmp.col.employee')}</span>
        <div className="pw-readonly-field">
          <span>{employeeName}</span>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{t('ecmp.year')}</span>
        <div className="pw-readonly-field">
          <span>{year}</span>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{t('ecmp.batch.documents')}</span>
        <div className="pw-readonly-field">
          <span>{docs.length}</span>
          <small>{t('ecmp.batch.months_count', { count: statements.length })}</small>
        </div>
      </div>
      <div className="pw-sidebar-section">
        <span className="pw-sidebar-label">{t('ecmp.batch.order')}</span>
        <div className="pw-readonly-field">
          <span>{t('ecmp.batch.order_value')}</span>
        </div>
      </div>
    </>
  );

  return (
    <>
      {accurate.dialog}
      <PrintWorkspace
        lang="ar"
        toolbar={toolbar}
        sidebar={sidebar}
        initialZoom={previewInitialZoom}
        documentName={jobTitle}
        paperLabel="A4"
        paperSize="A4"
      >
        <style>{batchPrintCss()}</style>

        {/* التنبيه لا يُطبع أبدًا (`no-print`)، ويحجب الطباعة حتى يُقرّه المستخدم. */}
        {monthsWithoutVoucher.length > 0 && !missingAcknowledged && (
          <div className="ecmp-batch-missing no-print" role="alert">
            <h2>{t('ecmp.batch.missing_voucher_title')}</h2>
            <p>{t('ecmp.batch.missing_voucher_body')}</p>
            <ul>
              {monthsWithoutVoucher.map((m) => (
                <li key={m}>
                  {monthNameAr(m)} {year}
                </li>
              ))}
            </ul>
            <div className="ecmp-batch-actions">
              <button type="button" className="btn" onClick={() => setMissingAcknowledged(true)}>
                {t('ecmp.batch.continue_without')}
              </button>
              <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        )}

        <div ref={batchRootRef} className="ecmp-batch-root">
          {docs.map((doc) =>
            doc.kind === 'statement' ? (
              <StatementDoc key={doc.key} data={doc.data} />
            ) : (
              <VoucherDoc key={doc.key} data={doc.data} reference={doc.reference} />
            ),
          )}
        </div>
      </PrintWorkspace>
    </>
  );
}

/**
 * كشف شهر واحد — نفس قالب `EmployeeCompensationStatement` ونفس عنوانه (17px) ونفس
 * رمز تحققه، وبلا كتلة اعتماد في التذييل (بديلها «الاعتماد والاستلام» داخل القالب).
 *
 * الفرق الوحيد عن الطباعة الفردية هو ملف التعريف: `letterhead` بدل `plain-a4`. ولذلك
 * تختفي الترويسة الإلكترونية (`BATCH_BLANK_HEADER`) ويسقط الفاصل العلوي ٢٠مم — هامش
 * الصفحة ٤٠مم هو الخلوص، وإضافة الفاصل فوقه خلوصٌ مزدوج لا مبرّر له.
 */
function StatementDoc({ data }: { data: StatementData }) {
  const { t } = useT();
  const reference = statementReference(data);
  const qrData: QRData = {
    formType: 'employee-compensation-statement',
    formNumber: reference,
    entityName: data.employee.fullName,
    payloadLines: buildStatementQrLines(data),
  };
  return (
    <div className="ecmp-batch-doc ecmp-batch-doc--statement">
      <FormPage
        lang="ar"
        padding="18px 32px"
        docFontStack={DOC_FONT_STACK}
        header={<FormHeader isLetterhead={BATCH_BLANK_HEADER} lang="ar" />}
        formNumber={reference}
        title={t('ecmp.doc.statement_title')}
        titleFontSize={17}
        qrData={qrData}
      >
        <StatementTemplate data={data} />
      </FormPage>
    </div>
  );
}

/**
 * سند صرف شهر واحد — نفس ما تصيّره `EmployeeCompensationVoucher` حرفيًا: `letterhead`
 * (الورقة تحمل الترويسة مطبوعة ⇒ لا ترويسة إلكترونية)، بلا رقم مستند مرئي فوق
 * العنوان، بلا خطّ العنوان، وبلا كتلة اعتماد — القالب يرسم عنوانه وتوقيعاته بنفسه.
 * السند يُطبع منفردًا على هذا الملف أصلًا، فالدفعة لا تغيّر شيئًا في صفحته.
 */
function VoucherDoc({ data, reference }: { data: StatementData; reference: string }) {
  const qrData: QRData = {
    formType: 'employee-compensation-cash-voucher',
    formNumber: reference,
    entityName: data.employee.fullName,
    payloadLines: buildVoucherQrLines(data, reference),
  };
  return (
    <div className="ecmp-batch-doc ecmp-batch-doc--voucher">
      <FormPage
        lang="ar"
        padding="18px 32px"
        docFontStack={DOC_FONT_STACK}
        header={<FormHeader isLetterhead={BATCH_BLANK_HEADER} lang="ar" />}
        formNumber={reference}
        hideFormNumber
        title=""
        titleFontSize={22}
        hideTitleRule
        qrData={qrData}
      >
        <CashPaymentVoucherTemplate data={data} reference={reference} />
      </FormPage>
    </div>
  );
}
