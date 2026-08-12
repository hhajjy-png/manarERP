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
import { monthNameAr } from '../employee-compensation/labels';
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
  const periodLabel = useMemo(
    () => (data ? `${monthNameAr(data.month)} ${data.year}` : ''),
    [data],
  );

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
        onPrintApiReady={setPrintApi}
        toolbarExtra={
          <>
            <PrintProfileToggle profile={profile} onChange={setProfile} />
            {accurate.button}
          </>
        }
        qrData={{
          formType: FORM_KEY,
          formNumber: `ECS-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`,
          entityName: data.employee.fullName,
          entityId: data.id,
        }}
      >
        <StatementTemplate data={data} />
      </FormLayout>
    </>
  );
}
