/**
 * صفحة **الكشف الرسمي المختصر** — معاينة · طباعة · PDF.
 *
 * لا مسار طباعة جديد: تُركَّب على `FormLayout` — نفس الغلاف الذي تستخدمه النماذج
 * الإدارية الأربعة عشر، فتَرِث منه ترويسة الشركة، ومساحة المعاينة (`PrintWorkspace`)،
 * وزر «حفظ PDF» (`composeStyledFromNode` → `exportPdfFromHtml`)، وقسم الاعتماد،
 * ورمز التحقق، وقواعد A4 وفواصل الصفحات. المطابقة بين المعاينة والطباعة مضمونة لأن
 * المصدر عقدة واحدة (`.form-page`) لا نسختان (المتطلب ٣٢).
 *
 * فتحُها بعلامة `?open=preview` يعرضها بلا طباعة تلقائية (زر «معاينة الكشف»)، وبلا
 * العلامة يطبع تلقائيًا عند الجاهزية (زر «طباعة الكشف») — نفس عرف النماذج القائم.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import StatementTemplate from '../employee-compensation/StatementTemplate';
import {
  buildStatementQrLines,
  joinBilingual,
  periodBilingual,
} from '../employee-compensation/statementBilingual';
import type { StatementData } from '../employee-compensation/types';
import FormLayout from '../forms/shared/FormLayout';
import { getProfileIdFromSearch } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import { useT } from '../lib/i18n';

const FORM_KEY = 'employee-compensation-statement';

export default function EmployeeCompensationStatement() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState('');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));

  useEffect(() => {
    if (!id) return;
    compensationApi
      .statement(Number(id))
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const docTitle = t('ecmp.doc.statement_title');
  // الفترة مشتقّة من `data.year`/`data.month` — سجل الحسبة نفسه، لا تاريخ اليوم.
  const periodLabel = useMemo(
    () => (data ? joinBilingual(periodBilingual(data.year, data.month)) : ''),
    [data],
  );

  /**
   * محتوى الرمز — ثلاثة أسطر يبنيها المصدر المشترك نفسه الذي يغذّي الكشف، فلا
   * يمكن أن يختلف صافي المستحق أو الفترة بين الورقة والرمز.
   */
  const qrPayloadLines = useMemo(() => (data ? buildStatementQrLines(data) : []), [data]);

  /**
   * المعاينة الدقيقة — تستهلك **نفس** العقدة المطبوعة و**نفس** دالة الطباعة عبر
   * `onPrintApiReady`، فلا قالب بديل ولا مسار طباعة ثانٍ.
   */
  const [printApi, setPrintApi] = useState<{ getNode: () => HTMLElement | null; print: () => Promise<unknown> } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApi?.getNode() ?? null,
    onPrint: () => { void printApi?.print(); },
    title: docTitle,
    documentLabel: data ? `${docTitle} · ${data.employee.fullName} · ${periodLabel}` : '',
    // مستند عربي دائمًا — لا مبدّل لغة على الكشف الرسمي.
    lang: 'ar',
  });

  if (error) return <div className="center-msg">{error}</div>;
  if (!data) return <div className="center-msg">{t('msg.loading')}</div>;

  return (
    <>
      {accurate.dialog}
      <FormLayout
        ready
        formNumber={`ECS-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`}
        title={docTitle}
        profile={profile}
        formType={FORM_KEY}
        lang="ar"
        // العنوان ثنائي اللغة على سطر واحد — 22px كانت تلفّه إلى سطر ثانٍ.
        titleFontSize={17}
        /**
         * إنزال **كامل** محتوى الكشف ٢ سم كوحدة واحدة (الترويسة والعنوان والأقسام
         * والتذييل ورمز التحقق معًا). لا إزاحة أفقية ولا تغيير في أي حجم أو ترتيب.
         *
         * لماذا هذه الآلية بالذات: `contentTopOffset` تُصيَّر فاصلًا حقيقيًا **داخل**
         * عقدة `.form-page` — وهي العقدة الوحيدة التي تستنسخها المعاينة الدقيقة و«حفظ
         * PDF» والطباعة جميعًا، فالإزاحة واحدة في المسارات الثلاثة حتمًا. البديلان
         * الآخران يتفرّقان: `padding` على `.form-page` يُصفَّر بـ`padding: 0 !important`
         * في وسيط الطباعة، و`margin-top` على أول ابن ينهار (margin collapsing) خارج
         * الأب حين يصير حشوه صفرًا عند الطباعة — كلاهما يعني معاينة تخالف الورقة.
         */
        contentTopOffset="20mm"
        /**
         * قسم «اعتماد المدير المباشر» في تذييل الغلاف أُلغي لهذا الكشف: بديله هو
         * «الاعتماد والاستلام» الأفقي داخل القالب. إبقاؤهما معًا هو ما كان يدفع
         * الجزء الأخير ورمز التحقق إلى صفحة ثانية. رمز التحقق يبقى في التذييل.
         */
        hideApprovalSection
        onPrintApiReady={setPrintApi}
        toolbarExtra={
          <>
            <PrintProfileToggle profile={profile} onChange={setProfile} />
            {accurate.button}
          </>
        }
        qrData={{
          formType: FORM_KEY,
          // يبقى المرجع النصّي المطبوع أسفل الرمز (رقم المستند) كما هو — عنصر تعريف
          // على الورقة، وليس جزءًا من المحتوى المُرمَّز.
          formNumber: `ECS-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`,
          entityName: data.employee.fullName,
          // المحتوى المُرمَّز حصرًا: الاسم · صافي المستحق · الفترة. لا رقم مستند،
          // ولا رقم مرجعي، ولا رقم وظيفي/مدني، ولا تواريخ، ولا حالة اعتماد.
          payloadLines: qrPayloadLines,
        }}
      >
        <StatementTemplate data={data} />
      </FormLayout>
    </>
  );
}
