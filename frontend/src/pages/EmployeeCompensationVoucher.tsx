/**
 * صفحة **سند الصرف النقدي** — معاينة · طباعة · PDF.
 *
 * لا مسار طباعة جديد: تُركَّب على `FormLayout` كالكشف الرسمي تمامًا، فترث منه مساحة
 * المعاينة، وزر «حفظ PDF»، ورمز التحقق، وقواعد A4. المطابقة بين المعاينة والطباعة
 * مضمونة لأن المصدر عقدة واحدة (`.form-page`) لا نسختان (معيار المشروع).
 *
 * ═══ الهوامش: ٤ سم أعلى · ٢ سم أسفل ═══
 * المواصفة المعتمدة ٤٠مم من أعلى الورقة و٢٠مم على الأقل من أسفلها — وهي **حرفيًا**
 * هوامش ملف تعريف «ورق الشركة الرسمي» (`letterhead`)، فلا يلزم أي فاصل إضافي:
 * `contentTopOffset` مُغفَل عمدًا. الهوامش تُطبَّق في `@page`، فتسري على المعاينة
 * الدقيقة و«حفظ PDF» والطباعة من مصدر واحد.
 *
 * ═══ ولا ترويسة ولا تذييل إلكترونيَّين ═══
 * الملف التعريفي `blankHeader` يخفي ترويسة الشركة (الورقة تحملها مطبوعة)، و
 * `hideApprovalSection` يُلغي كتلة الاعتماد في التذييل — بديلها كتلتا التوقيع داخل
 * السند نفسه. لا رقم صفحة، ولا تاريخ طباعة، ولا «أُنشئ بواسطة».
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import CashPaymentVoucherTemplate, { buildVoucherQrLines } from '../employee-compensation/CashPaymentVoucherTemplate';
import { deriveCashEntitlement } from '../employee-compensation/cashEntitlement';
import type { StatementData } from '../employee-compensation/types';
import FormLayout from '../forms/shared/FormLayout';
import { DEFAULT_PROFILE_ID, getProfileIdFromSearch } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import { useT } from '../lib/i18n';

const FORM_KEY = 'employee-compensation-cash-voucher';

/** مرجع مستقر مشتقّ من سجل الحسبة وحده — لا عدّاد جديد ولا ترقيم مستقل في v1. */
export function voucherReference(data: Pick<StatementData, 'year' | 'month'> & { employee: { code: string } }): string {
  return `ECV-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`;
}

export default function EmployeeCompensationVoucher() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState('');
  /**
   * الافتراضي **ورق الشركة الرسمي** لا `plain-a4`.
   *
   * `getProfileIdFromSearch` تُرجع `DEFAULT_PROFILE_ID` حين لا يوجد `printMode` في
   * العنوان — و`plain-a4` هوامشها ١٠مم، أي أن السند كان سيُطبع على بُعد سنتيمتر واحد
   * من حافة الورقة فيصطدم بالترويسة المطبوعة. الاختيار الصريح في العنوان يُحترم كما
   * هو؛ وغيابه يعني هذا المستند بالذات: ورقة رسمية بهوامشها.
   */
  const urlProfile = getProfileIdFromSearch(search);
  const [profile, setProfile] = usePrintProfileMemory(
    FORM_KEY,
    urlProfile === DEFAULT_PROFILE_ID ? 'letterhead' : urlProfile,
  );

  useEffect(() => {
    if (!id) return;
    compensationApi.statement(Number(id)).then(setData).catch((e) => setError(errorMessage(e)));
  }, [id]);

  const docTitle = 'سند صرف نقدي / Cash Payment Voucher';
  const reference = useMemo(() => (data ? voucherReference(data) : ''), [data]);
  const cash = useMemo(
    () => (data ? deriveCashEntitlement({ basicSalary: data.basicSalary, totals: data.totals }) : null),
    [data],
  );
  const qrPayloadLines = useMemo(() => (data ? buildVoucherQrLines(data, reference) : []), [data, reference]);

  const [printApi, setPrintApi] = useState<{ getNode: () => HTMLElement | null; print: () => Promise<unknown> } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApi?.getNode() ?? null,
    onPrint: () => { void printApi?.print(); },
    title: docTitle,
    documentLabel: data ? `${docTitle} · ${data.employee.fullName} · ${reference}` : '',
    lang: 'ar',
  });

  if (error) return <div className="center-msg">{error}</div>;
  if (!data || !cash) return <div className="center-msg">{t('msg.loading')}</div>;

  /**
   * لا مبلغ نقدي ⇒ لا سند. الطباعة ممنوعة بنيويًا (لا `FormLayout` أصلًا) لا بإخفاء
   * زر: سندُ صرفٍ بصفر — أو بسالب — ورقةٌ يوقّع الموظف فيها باستلام لا شيء.
   */
  if (cash.cashNet <= 0) {
    return (
      <div className="center-msg" style={{ textAlign: 'center', lineHeight: 1.9 }}>
        <div>لا يوجد مبلغ نقدي مستحق للصرف لهذا الشهر.</div>
        <div dir="ltr">There is no cash entitlement to pay for this month.</div>
      </div>
    );
  }

  return (
    <>
      {accurate.dialog}
      <FormLayout
        ready
        formNumber={reference}
        // العنوان يرسمه القالب في صندوقه الخاص — نفس صندوق سند الصرف الإداري.
        title=""
        hideFormNumber
        // القالب يرسم عنوانه في صندوقه، فالخطّ الزخرفي تحت عنوان فارغ يقرأ سطرًا شاردًا.
        hideTitleRule
        profile={profile}
        formType={FORM_KEY}
        lang="ar"
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
          formNumber: reference,
          entityName: data.employee.fullName,
          // محتوى حتمي: لا تاريخ طباعة ولا وقتها ولا أي قيمة تتغيّر بإعادة الطباعة.
          payloadLines: qrPayloadLines,
        }}
      >
        <CashPaymentVoucherTemplate data={data} reference={reference} />
      </FormLayout>
    </>
  );
}
