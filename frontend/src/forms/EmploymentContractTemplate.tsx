import { getNationalityEn, getJobTitleEn } from './shared/contractTranslations';

export interface ContractParams {
  issueDate: string;
  startDate: string;
  durationAr: string;
  durationEn: string;
  probationDays: number;
  annualLeaveDays: number;
  specialConditionsAr: string;
  specialConditionsEn: string;
}

export interface ContractEmployee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn: string | null;
  civilId: string | null;
  jobTitle: string | null;
  nationality: string | null;
  passportNumber: string | null;
  salary: number;
  address?: string | null;
  phone?: string | null;
}

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dmy(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
  .no-print { display: none !important; }
  .ec-wrapper {
    font-size: 8.5pt !important;
    line-height: 1.45 !important;
    width: 210mm !important;
    padding: 8mm !important;
    box-sizing: border-box !important;
  }
  .ec-row { page-break-inside: avoid !important; }
  .ec-page-break { break-after: page !important; }
}
`;

const NOTE =
  'ملاحظة / هذا النموذج يعد نموذجا إسترشاديا لشروط وأحكام عقد العمل في القطاع الأهلي ، ويحق لكل شركة إعداد نموذج مماثلا له على المطبوعات الخاصة بها شرط أن يتضمن كافة الأحكام والشروط الواردة بهذا النموذج';

const wrap: React.CSSProperties = {
  border: '1px solid #9ca3af',
  fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
  fontSize: 12,
  color: '#111827',
  background: '#fff',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const fullRow: React.CSSProperties = {
  borderBottom: '1px solid #9ca3af',
  padding: '6px 10px',
  textAlign: 'center',
};

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  borderBottom: '1px solid #9ca3af',
};

const en: React.CSSProperties = {
  padding: '5px 8px',
  direction: 'ltr',
  textAlign: 'left',
  borderRight: '1px solid #9ca3af',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
};

const ar: React.CSSProperties = {
  padding: '5px 8px',
  direction: 'rtl',
  textAlign: 'right',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
};

const bold: React.CSSProperties = { fontWeight: 700, color: '#1d4e6f' };

export default function EmploymentContractTemplate({
  employee: emp,
  params,
}: {
  employee: ContractEmployee;
  params: ContractParams;
}) {
  const jobTitleEn = getJobTitleEn(emp.jobTitle);
  const natEn = getNationalityEn(emp.nationality);
  const issueD = new Date(params.issueDate);
  const issueFmt = dmy(params.issueDate);
  const startFmt = dmy(params.startDate);
  const sal = Math.round(emp.salary);
  const dayAr = AR_DAYS[issueD.getDay()];
  const dayEn = EN_DAYS[issueD.getDay()];

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="ec-wrapper" style={wrap}>

        {/* Row 1 — Emblem */}
        <div style={{ ...fullRow, padding: '10px' }}>
          <img src="/contract_emblem.png" alt="Kuwait Public Authority Emblem"
            style={{ height: 56, objectFit: 'contain' }} />
        </div>

        {/* Row 2 — Authority name */}
        <div style={{ ...fullRow, fontWeight: 700 }}>
          <div style={{ fontSize: 13 }}>الهـيئة العـامة للقـوى العـاملة</div>
          <div style={{ fontSize: 11, fontWeight: 400 }}>The Public Authority For Manpower</div>
        </div>

        {/* Row 3 — Contract title */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>Sample Form of an Employment Contract in the Civil Sector</div>
          <div style={ar}>نموذج عقد عمل إسترشادي في القطاع الأهلي</div>
        </div>

        {/* Row 4 — State of Kuwait preamble */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`State of Kuwait\nPublic Authority for Manpower / Labour Department Farwanya\nOn ${dayEn} corresponding to ${issueFmt} the present contract was concluded by and between:`}</div>
          <div style={ar}>{`دولة الكويت\nالهيئة العامة للقوى العاملة / إدارة عمل محافظة الفروانية\nإنه في يوم ${dayAr} الموافق ${issueFmt} تحرر هذا العقد بين كل من:-`}</div>
        </div>

        {/* Row 5 — First party */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`1.  Company/ ALAMANAR ALDAWLIYA\nrepresented in signature in the present contract by:\nName: HASSAN FALAH NAYEF\nCivil card: 282081000827\n(First party)`}</div>
          <div style={ar}>{`1- شركة / شركة المنار الدولية لانشاء واصلاح الطرق والشوارع والأرصفة\nويمثلها في التوقيع على العقد\nالاسم: حسن فلاح نايف الحاجي\nرقم مدني: 282081000827\n" طرف أول "`}</div>
        </div>

        {/* Row 6 — Second party */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`2.  Name: ${emp.fullNameEn ?? emp.fullName}\nNationality: ${natEn}\nCivil Card: ${emp.civilId ?? '—'}\nPassport No.: ${emp.passportNumber ?? '—'}\n(Second party)`}</div>
          <div style={ar}>{`2- الاسم: ${emp.fullName}\nالجنسية: ${emp.nationality ?? '—'}\nالرقم المدني: ${emp.civilId ?? '—'}\nرقم الجواز: ${emp.passportNumber ?? '—'}\n" طرف ثان "`}</div>
        </div>

        {/* Row 7 — Preamble */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Preamble</span>{`\nThe first party owns the facility entitled ALAMANAR ALDAWLIYA working in the field of STREET CONS. whereas it wishes to conclude a contract with the second party to work for it in the profession of ${jobTitleEn}; whereas the parties acknowledged their capacity to conclude this contract, they agreed upon the following:`}</div>
          <div style={ar}><span style={bold}>تمهيد</span>{`\nيمتلك الطرف الأول منشأة بإسم شركة المنار الدولية لانشاء واصلاح الطرق والشوارع والأرصفة تعمل في مجال صيانة الشوارع ويرغب في التعاقد مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'} وبعد أن أقر الطرفان بأهليتهما في إبرام هذا العقد تم الاتفاق على ما يلي :`}</div>
        </div>

        {/* Row 8 — Article 1 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article One</span>{'\nThe preamble above shall constitute an integral part of the present contract.'}</div>
          <div style={ar}><span style={bold}>البند الأول</span>{'\nيعتبر التمهيد السابق جزء لا يتجزأ من هذا العقد .'}</div>
        </div>

        {/* Row 9 — Article 2 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Two "Nature of the Work"</span>{`\nThe first party concluded a contract with the second party to work for it in the profession of ${jobTitleEn} in the State of Kuwait.`}</div>
          <div style={ar}><span style={bold}>البند الثاني " طبيعة العمل"</span>{`\nتعاقد الطرف الأول مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'} داخل دولة الكويت`}</div>
        </div>

        {/* Row 10 — Article 3 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Three "Probation Period"</span>{`\nThe second party shall be subject to a probation period for a term not exceeding ${params.probationDays} work days. Each party shall have the right to terminate the contract during the said term without notification.`}</div>
          <div style={ar}><span style={bold}>البند الثالث " فترة التجربة"</span>{`\nيخضع الطرف الثاني لفترة تجربة لمدة لا تزيد عن ${params.probationDays} يوم عمل ، ويحق لكل طرف إنهاء العقد خلال تلك الفترة دون إخطار .`}</div>
        </div>

        {/* Row 11 — Article 4 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Four "Lease Value"</span>{`\nFor executing the present contract, the second party shall receive the wage of ${sal} dinars to be paid at the end of every month. The first party may not decrease the wage during the term of the contract. It may not transfer the second party to daily wage without his approval.`}</div>
          <div style={ar}><span style={bold}>البند الرابع " قيمة الأجر"</span>{`\nيتقاضى الطرف الثاني عن تنفيذ هذا العقد أجرا مقداره ${sal} دينارا يدفع في نهاية كل شهر ، ولا يجوز للطرف الأول تخفيض الأجر أثناء سريان هذا العقد . ولا يجوز نقل الطرف الثاني إلى الأجر اليومي دون موافقته .`}</div>
        </div>

        {/* Row 12 — Article 5 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Five "Contract Term"</span>{`\nThe contract shall come into force on ${startFmt} The second party shall execute his work during the entire execution term thereof.`}</div>
          <div style={ar}><span style={bold}>البند الخامس " نفاذ العقد"</span>{`\nيبدأ نفاذ العقد إعتبارا من ${startFmt} ويلتزم الطرف الثاني بالقيام بأداء عمله طوال مدة نفاذه`}</div>
        </div>

        {/* Row 13 — Article 6 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Six "Contract Term"</span>{`\nThe present contract has a definite term. It shall come into force on ${startFmt} for a term of ${params.durationEn}. The contract may be renewed with the approval of the parties for similar terms not exceeding five years. The present contract has an indefinite term and it shall come into force on .\n*Considering the contract as having a definite or indefinite term shall be subject to the will of the two parties.`}</div>
          <div style={ar}><span style={bold}>البند السادس " مدة العقد"</span>{`\n- هذا العقد محدد المدة ويبدأ إعتبارا من ${startFmt} ولمدة ${params.durationAr} ، ويجوز تجديد العقد بموافقة الطرفين لمدة مماثلة بحد أقصى خمس سنوات ميلادية\n- هذا العقد غير محدد المدة ويبدأ إعتبارا من \n* إعتبار العقد محدد المدة أو غير محدد المدة يخضع إختياره لإرادة الطرفين`}</div>
        </div>

        {/* Row 14 — Note full-width */}
        <div style={{ ...fullRow, fontSize: 9, color: '#6b7280', direction: 'rtl', textAlign: 'right' }}>{NOTE}</div>

        {/* Row 15 — Article 7 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Seven "Annual Leave"</span>{`\nThe second party shall have the right to a paid annual leave with a term of ${params.annualLeaveDays} days. It shall not be due on the first year save after the expiration of nine months to be calculated from the date of the contract coming into force.`}</div>
          <div style={ar}><span style={bold}>البند السابع " الإجازة السنوية"</span>{`\nللطرف الثاني الحق في إجازة سنوية مدفوعة الأجر مدتها ${params.annualLeaveDays} يوما ، ولا يستحقها عن السنة الأولى الإ بعد انقضاء مدة تسعة أشهر تحسب من تاريخ نفاذ العقد .`}</div>
        </div>

        {/* PAGE BREAK */}
        <div className="ec-page-break" style={{ breakAfter: 'page' }} />

        {/* Row 16 — Article 8 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Eight "Number of Work Hours"</span>{'\nThe first party may not require that the second party work for a term exceeding eight daily work hours with rest periods not less than one hour, except for the cases set forth in the law.'}</div>
          <div style={ar}><span style={bold}>البند الثامن " عدد ساعات العمل"</span>{'\nلا يجوز للطرف الأول تشغيل الطرف الثاني لمدة تزيد عن ثماني ساعات عمل يوميا تتخللها فترة راحة لا تقل عن ساعة باستثناء الحالات المقررة قانونا .'}</div>
        </div>

        {/* Row 17 — Article 9 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Nine "Ticket Value"</span>{'\nThe first party shall bear the expenses of the return of the second party to his country after the expiration of the work relationship and his final departure from the country.'}</div>
          <div style={ar}><span style={bold}>البند التاسع " قيمة تذكرة السفر"</span>{'\nيتحمل الطرف الأول مصاريف عودة الطرف الثاني إلى بلده عند إنتهاء علاقة العمل ومغادرته نهائيا للبلاد .'}</div>
        </div>

        {/* Row 18 — Article 10 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Ten "Insurance against Injuries and Work Maladies"</span>{'\nThe first party shall insure the second party against injuries and work maladies. It shall also commit to the health insurance value in accordance with the law No. (1) of the year 1999.'}</div>
          <div style={ar}><span style={bold}>البند العاشر " التأمين ضد إصابات وأمراض العمل"</span>{'\nيلتزم الطرف الأول بالتأمين على الطرف الثاني ضد إصابات وأمراض العمل ، كما يلتزم بقيمة التأمين الصحي طبقا للقانون رقم )1( لسنة 1999 .'}</div>
        </div>

        {/* Row 19 — Article 11 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Eleven "End of Service Benefit"</span>{'\nThe second party shall be due the end of service benefit as set forth in the regulating laws.'}</div>
          <div style={ar}><span style={bold}>البند الحادي عشر " مكافأة نهاية الخدمة"</span>{'\nيستحق الطرف الثاني مكافأة نهاية الخدمة المنصوص عليها بالقوانين المنظمة'}</div>
        </div>

        {/* Row 20 — Article 12 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Twelve "Applicable Law"</span>{'\nThe provisions of the Labour code in the civil sector No. 6 of 2010 and the decisions executing the same shall apply for all matters not provided for in the present contract. Shall be considered null every condition agreed upon in violation of the provisions of the law, unless the same has a better benefit for the worker.'}</div>
          <div style={ar}><span style={bold}>البند الثاني عشر " القانون الواجب التطبيق"</span>{'\nتسري أحكام قانون العمل في القطاع الأهلي رقم 6 لسنة 2010 والقرارات المنفذة له فيما لم يرد بشأنه نص في هذا العقد ، ويقع باطلا كل شرط تم الإتفاق عليه بالمخالفة لأحكام القانون ، ما لم يكن فيه ميزة أفضل للعامل .'}</div>
        </div>

        {/* Row 21 — Article 13 Special conditions */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Thirteen "Special Conditions"</span>{`\n${params.specialConditionsEn}`}</div>
          <div style={ar}><span style={bold}>البند الثالث عشر "شروط خاصة"</span>{`\n${params.specialConditionsAr}`}</div>
        </div>

        {/* Row 22 — Article 14 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Fourteen "Specialized Court"</span>{'\nThe court of first instance and its Labour departments, in accordance with the provisions of the law No. 46 of the year 1987, shall be competent to peruse any conflicts resulting from the execution or interpretation of the present contract.'}</div>
          <div style={ar}><span style={bold}>البند الرابع عشر " المحكمة المختصة"</span>{'\nتختص المحكمة الكلية ودوائرها العمالية طبقا لأحكام القانون رقم 46 لسنة 1987 ، بنظر كافة المنازعات الناشئة عن تطبيق أو تفسير هذا العقد .'}</div>
        </div>

        {/* Row 23 — Article 15 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Fifteen "Contract Language"</span>{'\nThe present contract was made in Arabic and ENGLISH. The Arabic texts shall prevail in the case of any conflict between them.'}</div>
          <div style={ar}><span style={bold}>البند الخامس عشر " لغة العقد"</span>{'\nحرر هذا العقد باللغتين العربية و الانجليزيه ، ويعتد بنصوص اللغة العربية عند وقوع أي تعارض بينهما .'}</div>
        </div>

        {/* Row 24 — Article 16 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Sixteen "Contract Copies"</span>{'\nThe present contract was made in three copies, one for each party to work in accordance therewith. The third copy shall be deposited at the Public Authority for Manpower.'}</div>
          <div style={ar}><span style={bold}>البند السادس عشر " نسخ العقد"</span>{'\nحرر هذا العقد من ثلاث نسخ بيد كل طرف نسخة للعمل بموجبها والثالثة تودع لدى الهيئة العامة للقوى العاملة .'}</div>
        </div>

        {/* Row 25 — Signatures */}
        <div className="ec-row" style={{ ...twoCol, minHeight: 90 }}>
          <div style={{ ...en, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div><strong>Second Party / الطرف الثاني</strong></div>
            <div style={{ borderTop: '1px solid #374151', marginTop: 50, paddingTop: 4, fontSize: 10, color: '#6b7280' }}>
              Signature / التوقيع
            </div>
          </div>
          <div style={{ ...ar, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div><strong>الطرف الأول / First Party</strong></div>
            <div style={{ borderTop: '1px solid #374151', marginTop: 50, paddingTop: 4, fontSize: 10, color: '#6b7280', direction: 'ltr', textAlign: 'left' }}>
              Signature / التوقيع
            </div>
          </div>
        </div>

        {/* Row 26 — Note full-width */}
        <div style={{ ...fullRow, fontSize: 9, color: '#6b7280', direction: 'rtl', textAlign: 'right', borderBottom: 'none' }}>{NOTE}</div>

      </div>
    </>
  );
}
