import { CSSProperties } from 'react';
import { getNationalityEn, getJobTitleEn } from './shared/contractTranslations';
import { tafqeetKWD } from '../lib/tafqeet';
import { ProfileId, DEFAULT_PROFILE_ID, PRINT_PROFILES, getPrintProfileStyle } from './shared/printProfiles';

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
  jobTitleEn?: string | null;
  nationality: string | null;
  nationalityEn?: string | null;
  passportNumber: string | null;
  salary: number;
  address?: string | null;
  phone?: string | null;
}

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dmy(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function buildContractPrintCSS(profileId: ProfileId): string {
  const profile = PRINT_PROFILES[profileId];
  const padding = getPrintProfileStyle(profile);
  return `
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
  .no-print { display: none !important; }
  .ec-page {
    font-size: 8.5pt !important;
    line-height: 1.45 !important;
    width: 210mm !important;
    padding: ${padding} !important;
    box-sizing: border-box !important;
  }
  .ec-p1 {
    break-after: page !important;
    page-break-after: always !important;
  }
  .ec-p2 {
    break-after: auto !important;
    page-break-after: auto !important;
  }
  .ec-row { break-inside: avoid !important; page-break-inside: avoid !important; }
  .ec-page-2 { break-before: page !important; page-break-before: always !important; }
  .ec-cell { padding: 3px 7px !important; }
}
@media screen {
  .ec-page { max-width: 800px; margin: 0 auto; }
  .ec-p1 { margin-bottom: 40px; }
}
`;
}

const NOTE =
  'ملاحظة / هذا النموذج يعد نموذجاً إسترشادياً لشروط وأحكام عقد العمل في القطاع الأهلي، ويحق لكل شركة إعداد نموذج مماثل له على المطبوعات الخاصة بها شرط أن يتضمن كافة الأحكام والشروط الواردة بهذا النموذج';

const wrap: CSSProperties = {
  border: '1px solid #1d4e6f',
  fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
  fontSize: 11,
  lineHeight: 1.5,
  color: '#111827',
  background: '#fff',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const fullRow: CSSProperties = {
  borderBottom: '1px solid #888',
  padding: '5px 10px',
  textAlign: 'center',
};

const twoCol: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  borderBottom: '1px solid #888',
};

const ar: CSSProperties = {
  padding: '4px 7px',
  direction: 'rtl',
  textAlign: 'right',
  borderRight: '1px solid #888',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
  fontSize: 10.5,
  lineHeight: 1.45,
};

const en: CSSProperties = {
  padding: '4px 7px',
  direction: 'ltr',
  textAlign: 'left',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
  fontSize: 10.5,
  lineHeight: 1.45,
};

const hdr: CSSProperties = {
  fontWeight: 700,
  color: '#1d3a57',
  fontSize: 10.5,
};

const noteStyle: CSSProperties = {
  ...fullRow,
  fontSize: 8.5,
  color: '#6b7280',
  direction: 'rtl',
  textAlign: 'right',
  lineHeight: 1.4,
  padding: '4px 8px',
};

export default function EmploymentContractTemplate({
  employee: emp,
  params,
  profile = DEFAULT_PROFILE_ID,
}: {
  employee: ContractEmployee;
  params: ContractParams;
  profile?: ProfileId;
}) {
  const jobTitleEn = emp.jobTitleEn?.trim() || getJobTitleEn(emp.jobTitle);
  const natEn = emp.nationalityEn?.trim() || getNationalityEn(emp.nationality);
  const issueD = new Date(params.issueDate);
  const issueFmt = dmy(params.issueDate);
  const startFmt = dmy(params.startDate);
  const sal = Math.round(emp.salary);
  const salWords = tafqeetKWD(sal);
  const dayAr = AR_DAYS[issueD.getDay()];
  const dayEn = EN_DAYS[issueD.getDay()];

  return (
    <>
      <style>{buildContractPrintCSS(profile)}</style>

      {/* PAGE 1 — Header + Articles 1–6 */}
      <div className="ec-page ec-p1" style={wrap}>

        <div style={{ ...fullRow, padding: '8px 10px' }}>
          <img
            src="/contract_emblem.png"
            alt="Kuwait Public Authority Emblem"
            style={{ height: 62, objectFit: 'contain' }}
          />
        </div>

        <div style={{ ...fullRow, padding: '5px 10px' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>الهـيئة العـامة للقـوى العـاملة</div>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginTop: 1 }}>The Public Authority For Manpower</div>
        </div>

        <div className="ec-row" style={{ ...twoCol, background: '#f0f4f8', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div className="ec-cell" style={{ ...ar, fontWeight: 700, textAlign: 'center', padding: '4px 7px' }}>
            نموذج عقد عمل إسترشادي في القطاع الأهلي
          </div>
          <div className="ec-cell" style={{ ...en, fontWeight: 700, textAlign: 'center', padding: '4px 7px' }}>
            Sample Form of an Employment Contract in the Civil Sector
          </div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}>{`دولة الكويت\nالهيئة العامة للقوى العاملة / إدارة عمل محافظة الفروانية\nإنه في يوم ${dayAr} الموافق ${issueFmt} تحرر هذا العقد بين كل من:-`}</div>
          <div className="ec-cell" style={en}>{`State of Kuwait\nPublic Authority for Manpower / Labour Department Farwaniya\nOn ${dayEn} corresponding to ${issueFmt} the present contract was concluded by and between:`}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}>
            <div style={{ ...hdr, direction: 'rtl' }}>الطرف الأول (صاحب العمل):</div>
            {`شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة\nيمثلها: حسن فلاح نايف الحاجي\nرقم مدني: 282081000827`}
          </div>
          <div className="ec-cell" style={en}>
            <div style={hdr}>First Party (Employer):</div>
            {`Company: ALAMANAR ALDAWLIYA\nRepresented by: HASSAN FALAH NAYEF AL-HAJJI\nCivil ID: 282081000827`}
          </div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}>
            <div style={{ ...hdr, direction: 'rtl' }}>الطرف الثاني (العامل):</div>
            {`الاسم: ${emp.fullName}\nالجنسية: ${emp.nationality ?? '—'}\nالرقم المدني: ${emp.civilId ?? '—'}\nرقم الجواز: ${emp.passportNumber ?? '—'}`}
            {emp.address ? `\nالعنوان: ${emp.address}` : ''}
          </div>
          <div className="ec-cell" style={en}>
            <div style={hdr}>Second Party (Employee):</div>
            {`Name: ${emp.fullNameEn ?? emp.fullName}\nNationality: ${natEn}\nCivil ID: ${emp.civilId ?? '—'}\nPassport No.: ${emp.passportNumber ?? '—'}`}
            {emp.address ? `\nAddress: ${emp.address}` : ''}
          </div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}>
            <span style={hdr}>تمهيد: </span>
            {`يمتلك الطرف الأول منشأة بإسم شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة تعمل في مجال صيانة وإنشاء الشوارع، ويرغب في التعاقد مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'}، وبعد أن أقر الطرفان بأهليتهما في إبرام هذا العقد تم الاتفاق على ما يلي:`}
          </div>
          <div className="ec-cell" style={en}>
            <span style={hdr}>Preamble: </span>
            {`The first party owns the establishment entitled ALAMANAR ALDAWLIYA working in the field of STREET CONSTRUCTION & MAINTENANCE; whereas it wishes to conclude a contract with the second party to work for it in the profession of ${jobTitleEn}; whereas the parties acknowledged their capacity to conclude this contract, they agreed upon the following:`}
          </div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الأول: </span>{'يعتبر التمهيد السابق جزءاً لا يتجزأ من هذا العقد.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article One: </span>{'The preamble above shall constitute an integral part of the present contract.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الثاني — طبيعة العمل: </span>{`تعاقد الطرف الأول مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'} داخل دولة الكويت.`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Two — Nature of Work: </span>{`The first party concluded a contract with the second party to work in the profession of ${jobTitleEn} in the State of Kuwait.`}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الثالث — فترة التجربة: </span>{`يخضع الطرف الثاني لفترة تجربة لمدة لا تزيد عن ${params.probationDays} يوم عمل، ويحق لكل طرف إنهاء العقد خلال تلك الفترة دون إخطار مسبق.`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Three — Probation Period: </span>{`The second party shall be subject to a probation period not exceeding ${params.probationDays} work days. Either party may terminate the contract during this period without prior notice.`}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}>
            <span style={hdr}>البند الرابع — قيمة الأجر: </span>
            {'يتقاضى الطرف الثاني عن تنفيذ هذا العقد أجراً شهرياً مقداره '}
            <strong>{sal} دينار كويتي</strong>
            {` (${salWords}) يدفع في نهاية كل شهر، ولا يجوز للطرف الأول تخفيض الأجر أثناء سريان العقد.`}
          </div>
          <div className="ec-cell" style={en}>
            <span style={hdr}>Article Four — Wage: </span>
            {'The second party shall receive a monthly wage of '}
            <strong>{sal} KWD</strong>
            {` (${salWords}) payable at the end of each month. The first party may not reduce the wage during the contract term.`}
          </div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الخامس — نفاذ العقد: </span>{`يبدأ نفاذ العقد اعتباراً من ${startFmt}، ويلتزم الطرف الثاني بالقيام بأداء عمله طوال مدة نفاذه.`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Five — Commencement: </span>{`The contract shall come into force on ${startFmt}. The second party shall perform his duties throughout the full term of the contract.`}</div>
        </div>

        <div className="ec-row" style={{ ...twoCol, borderBottom: 'none' }}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند السادس — مدة العقد: </span>{`هذا العقد محدد المدة، يبدأ اعتباراً من ${startFmt} ولمدة ${params.durationAr}، ويجوز تجديده بموافقة الطرفين لمدة مماثلة بحد أقصى خمس سنوات. (خيار العقد غير المحدد المدة يخضع لإرادة الطرفين.)`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Six — Contract Term: </span>{`This contract has a definite term, commencing ${startFmt} for a period of ${params.durationEn}. It may be renewed by mutual agreement for similar terms not exceeding five years. (An indefinite-term option is available subject to agreement of both parties.)`}</div>
        </div>

      </div>

      {/* PAGE 2 — Articles 7–16 + Signatures + NOTE */}
      <div className="ec-page ec-p2" style={wrap}>

        <div className="ec-row ec-page-2" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند السابع — الإجازة السنوية: </span>{`للطرف الثاني الحق في إجازة سنوية مدفوعة الأجر مدتها ${params.annualLeaveDays} يوماً، ولا يستحقها عن السنة الأولى إلا بعد انقضاء تسعة أشهر تحسب من تاريخ نفاذ العقد.`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Seven — Annual Leave: </span>{`The second party shall be entitled to a paid annual leave of ${params.annualLeaveDays} days. This entitlement does not accrue in the first year until the expiry of nine months from the contract commencement date.`}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الثامن — ساعات العمل: </span>{'لا يجوز للطرف الأول تشغيل الطرف الثاني لمدة تزيد عن ثماني ساعات عمل يومياً تتخللها فترة راحة لا تقل عن ساعة، باستثناء الحالات المقررة قانوناً.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Eight — Working Hours: </span>{'The first party may not require the second party to work more than eight daily hours with rest periods of not less than one hour, except as provided by law.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند التاسع — تذكرة السفر: </span>{'يتحمل الطرف الأول مصاريف عودة الطرف الثاني إلى بلده عند انتهاء علاقة العمل ومغادرته نهائياً للبلاد.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Nine — Travel Ticket: </span>{'The first party shall bear the cost of returning the second party to his home country upon expiry of the work relationship and final departure from Kuwait.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند العاشر — التأمين: </span>{'يلتزم الطرف الأول بالتأمين على الطرف الثاني ضد إصابات وأمراض العمل، كما يلتزم بقيمة التأمين الصحي طبقاً للقانون رقم (1) لسنة 1999.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Ten — Insurance: </span>{'The first party shall insure the second party against work injuries and occupational diseases, and shall also provide health insurance in accordance with Law No. (1) of 1999.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الحادي عشر — مكافأة نهاية الخدمة: </span>{'يستحق الطرف الثاني مكافأة نهاية الخدمة المنصوص عليها في القوانين المنظمة.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Eleven — End of Service: </span>{'The second party shall be entitled to end-of-service benefits as stipulated by the applicable labour laws.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الثاني عشر — القانون الواجب التطبيق: </span>{'تسري أحكام قانون العمل في القطاع الأهلي رقم 6 لسنة 2010 والقرارات المنفذة له فيما لم يرد بشأنه نص في هذا العقد، ويقع باطلاً كل شرط مخالف لأحكام القانون ما لم يكن أفضل للعامل.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Twelve — Applicable Law: </span>{'The provisions of Labour Law No. 6 of 2010 and its implementing decisions shall apply to all matters not covered in this contract. Any condition contrary to the law shall be null and void unless it provides a greater benefit to the worker.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الثالث عشر — شروط خاصة: </span>{`\n${params.specialConditionsAr || 'لا يوجد.'}`}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Thirteen — Special Conditions: </span>{`\n${params.specialConditionsEn || 'None.'}`}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الرابع عشر — المحكمة المختصة: </span>{'تختص المحكمة الكلية ودوائرها العمالية طبقاً لأحكام القانون رقم 46 لسنة 1987 بنظر كافة المنازعات الناشئة عن تطبيق أو تفسير هذا العقد.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Fourteen — Jurisdiction: </span>{'The Court of First Instance and its Labour Departments, pursuant to Law No. 46 of 1987, shall have jurisdiction over all disputes arising from the execution or interpretation of this contract.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند الخامس عشر — لغة العقد: </span>{'حُرِّر هذا العقد باللغتين العربية والإنجليزية، ويُعتدّ بنصوص اللغة العربية عند وقوع أي تعارض بينهما.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Fifteen — Contract Language: </span>{'This contract is made in Arabic and English. The Arabic text shall prevail in case of any conflict between them.'}</div>
        </div>

        <div className="ec-row" style={twoCol}>
          <div className="ec-cell" style={ar}><span style={hdr}>البند السادس عشر — نسخ العقد: </span>{'حُرِّر هذا العقد من ثلاث نسخ، بيد كل طرف نسخة للعمل بموجبها، والثالثة تودَع لدى الهيئة العامة للقوى العاملة.'}</div>
          <div className="ec-cell" style={en}><span style={hdr}>Article Sixteen — Contract Copies: </span>{'This contract is made in three copies: one for each party and the third to be deposited at the Public Authority for Manpower.'}</div>
        </div>

        <div className="ec-row" style={{ ...twoCol, borderBottom: 'none' }}>
          <div style={{ ...ar, padding: '12px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, direction: 'rtl' }}>الطرف الأول — صاحب العمل / First Party</div>
            <div style={{ fontSize: 10, color: '#374151', marginBottom: 48, direction: 'rtl' }}>
              شركة المنار الدولية · حسن فلاح نايف
            </div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 6, fontSize: 9.5, color: '#6b7280', direction: 'rtl' }}>
              التوقيع &nbsp;/&nbsp; Signature &nbsp;&nbsp;&nbsp; التاريخ / Date: ___________
            </div>
          </div>
          <div style={{ ...en, padding: '12px 10px' }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>Second Party — Employee / الطرف الثاني</div>
            <div style={{ fontSize: 10, color: '#374151', marginBottom: 48 }}>
              {emp.fullNameEn ?? emp.fullName}
              {emp.civilId ? ` · ${emp.civilId}` : ''}
            </div>
            <div style={{ borderTop: '1px solid #374151', paddingTop: 6, fontSize: 9.5, color: '#6b7280' }}>
              Signature &nbsp;/&nbsp; التوقيع &nbsp;&nbsp;&nbsp; Date / التاريخ: ___________
            </div>
          </div>
        </div>

        <div style={{ ...noteStyle, borderTop: '1px solid #888', borderBottom: 'none' }}>{NOTE}</div>

      </div>
    </>
  );
}
