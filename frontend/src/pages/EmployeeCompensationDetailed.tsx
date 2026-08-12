/**
 * صفحة **التقرير التفصيلي الداخلي** — معاينة · طباعة · PDF.
 *
 * نفس غلاف `FormLayout` المستخدم في الكشف المختصر، وبيانات مختلفة كليًا: هذا المسار
 * يقرأ `/calculations/:id/detailed`، وهو **المسار الوحيد** الذي يحمل أجر الساعة
 * والمعاملات والحسبة العكسية. فصل المسارَين يعني أن مستند الموظف لا يمكن أن يتسرّب
 * إليه شيء من هذه التفاصيل حتى لو أخطأ قالبٌ يومًا.
 *
 * لا قسم اعتماد ولا توقيع استلام هنا: التقرير أداة تدقيق داخلية لا مستند يُوقَّع.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import DetailedReportTemplate from '../employee-compensation/DetailedReportTemplate';
import { monthNameAr } from '../employee-compensation/labels';
import type { DetailedReportData } from '../employee-compensation/types';
import FormLayout from '../forms/shared/FormLayout';
import { getProfileIdFromSearch } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import { useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import { useT } from '../lib/i18n';

const FORM_KEY = 'employee-compensation-detailed';

export default function EmployeeCompensationDetailed() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const [data, setData] = useState<DetailedReportData | null>(null);
  const [error, setError] = useState('');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));

  useEffect(() => {
    if (!id) return;
    compensationApi
      .detailed(Number(id))
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  const docTitle = t('ecmp.doc.detailed_title');
  const periodLabel = useMemo(() => (data ? `${monthNameAr(data.month)} ${data.year}` : ''), [data]);

  const [printApi, setPrintApi] = useState<{ getNode: () => HTMLElement | null; print: () => Promise<unknown> } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApi?.getNode() ?? null,
    onPrint: () => { void printApi?.print(); },
    title: docTitle,
    documentLabel: data ? `${docTitle} · ${data.employee.fullName} · ${periodLabel}` : '',
    lang: 'ar',
  });

  if (error) return <div className="center-msg">{error}</div>;
  if (!data) return <div className="center-msg">{t('msg.loading')}</div>;

  const formNumber = `ECD-${data.year}-${String(data.month).padStart(2, '0')}-${data.employee.code}`;

  return (
    <>
      {accurate.dialog}
      <FormLayout
        ready
        formNumber={formNumber}
        title={docTitle}
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
          formNumber,
          entityName: data.employee.fullName,
          entityId: data.id,
        }}
      >
        <DetailedReportTemplate data={data} />
      </FormLayout>
    </>
  );
}
