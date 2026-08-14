/**
 * قالب **كشف مستحقات الموظف الشهرية** — عربي/English في نفس السطر، صفحة A4 واحدة.
 *
 * ═══ ما يظهر ═══
 * بيانات الموظف والفترة · جدول البنود النهائية بمبالغها (عمودان لا ثالث لهما) ·
 * إجمالي المستحقات · إجمالي الاستقطاعات · صافي المستحق · الملاحظات ·
 * قسم واحد للاعتماد والاستلام.
 *
 * ═══ ما لا يظهر — قاعدة مغلقة (المتطلب ٢١) ═══
 * أجر الساعة · المعاملات القانونية · المراجع القانونية · معادلات الحساب · الحسبة
 * العكسية · المبلغ المستهدف · فرق التقريب · أي بيانات تشخيص.
 *
 * وهذا **مضمون بالبنية لا بالانضباط**: `StatementData` لا تحتوي تلك الحقول أصلًا —
 * مسار `/statement` على الخادم لا يرسلها. فلا يستطيع هذا القالب تسريبها حتى لو أراد.
 *
 * عدد الساعات يظهر داخل نصّ البند («عمل إضافي / Overtime — ١١ ساعة») لأن الكشف الذي
 * يوقّعه الموظف يجب أن يقول عمّاذا يُدفع له، لا أن يعرض مبلغًا مجرّدًا.
 *
 * ═══ ثنائية اللغة ═══
 * التسميات ثنائية دائمًا (نصوص نظام). أمّا **القيم** — اسم الموظف، المسمى الوظيفي،
 * الشهر/الفترة — فشقّها الإنجليزي يأتي من مصدر معتمد وحده (`statementBilingual.ts`)؛
 * غيابه ⇒ يظهر العربي وحده. والعناصر الإنجليزية معزولة اتجاهيًا بـ`<bdi dir="ltr">`
 * كي لا ينقلب ترتيبها داخل صفحة RTL.
 *
 * ═══ صفحة واحدة ═══
 * لا `overflow:hidden` ولا `transform: scale()` ولا قصّ: التوفير من حذف تاريخ الإعداد،
 * ودمج قسمَي الاعتماد القديمين في قسم أفقي واحد، وضغط الحشو وارتفاع الأسطر بقدر
 * مهني. تعريفات الأنماط محلّية هنا عمدًا — تعديل `formStyles` المشترك كان سيغيّر
 * أربعة عشر نموذجًا آخر.
 */
import type { CSSProperties, ReactNode } from 'react';
import { SECTION_HEADER_BG, longTextCell, money, tableWrapper } from '../forms/shared/formStyles';
import { OVERTIME_LABEL_AR, OVERTIME_LABEL_EN } from './labels';
import {
  employeeNameBilingual,
  jobTitleBilingual,
  joinBilingual,
  periodBilingual,
} from './statementBilingual';
import type { StatementData } from './types';

/** الاختبار الثابت لتخطيط «الاعتماد والاستلام» يلتقط الحاوية بهذه العلامة. */
export const APPROVAL_RECEIPT_TESTID = 'ecs-approval-receipt';

const BODY_FONT_SIZE = 12;

const exactColors: CSSProperties = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const cell: CSSProperties = { padding: '4px 10px', fontSize: BODY_FONT_SIZE, lineHeight: 1.45 };

const labelCell: CSSProperties = {
  ...cell,
  width: 190,
  fontWeight: 700,
  color: SECTION_HEADER_BG,
  background: '#f8fafc',
  borderInlineEnd: '1px solid #e2e8f0',
  flexShrink: 0,
  ...exactColors,
};

const valueCell: CSSProperties = { ...cell, flex: 1, color: '#0f172a' };

const row: CSSProperties = { display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0' };

const section: CSSProperties = {
  background: SECTION_HEADER_BG,
  color: '#fff',
  fontWeight: 800,
  fontSize: BODY_FONT_SIZE,
  padding: '5px 10px',
  ...exactColors,
};

const wrapper: CSSProperties = { ...tableWrapper, marginBottom: 8 };

const th: CSSProperties = {
  ...section,
  padding: '5px 10px',
  textAlign: 'start',
};

/**
 * `background: transparent` ليس زخرفًا — هو **إبطال تسرّب**.
 *
 * `app/theme.css` يحمل قاعدتين عامّتين بلا نطاق تصيبان كل جدول في التطبيق:
 *   `tbody tr:nth-child(even) td { background: var(--surface-2) }`
 *   `tbody tr:hover td        { background: var(--surface-hover) }`
 * فكانت أسطر البنود الواقعة في ترتيب زوجي (العمل الإضافي، مكافأة الأداء…) تُظلَّل
 * داخل مستند مطبوع لم يُصمَّم بتظليل متناوب أصلًا. صفوف الإجماليات لم تتأثّر لأنها
 * تحمل خلفية سطرية (`#f8fafc` / `#eef2ff`) تغلب ورقة الأنماط.
 *
 * الإصلاح هنا يعطي خلية البند خلفيةً سطرية صريحة أيضًا، فتغلب القاعدتين معًا —
 * والنطاق هذا القالب وحده: لا `theme.css` يُمسّ، ولا جدول آخر في النظام يتغيّر.
 */
const td: CSSProperties = { ...cell, borderBottom: '1px solid #e2e8f0', background: 'transparent' };
const tdAmount: CSSProperties = {
  ...td,
  textAlign: 'end',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};
const totalRow: CSSProperties = { ...td, fontWeight: 800, background: '#f8fafc', ...exactColors };

/**
 * سطر ثنائي اللغة: «عربي / English» في **نفس السطر**، مع عزل الشقّ الإنجليزي.
 *
 * `<bdi dir="ltr">` تمنع خوارزمية الاتجاه من ابتلاع الأقواس والأرقام المجاورة داخل
 * الجريان العربي — بدونها تخرج «Amount (KWD)» مقلوبة القوسين داخل صفحة RTL.
 * بلا شقّ إنجليزي (`en` غائبة) يخرج النصّ العربي وحده بلا شرطة معلّقة.
 */
function Bi({ ar, en }: { ar: string; en?: string | null }): ReactNode {
  if (!en) return <>{ar}</>;
  return (
    <>
      {ar}
      {' / '}
      <bdi dir="ltr">{en}</bdi>
    </>
  );
}

/** خانة توقيع داخل قسم الاعتماد والاستلام — تسمية ثنائية فوق مساحة توقيع عملية. */
function SignatureSlot({ ar, en }: { ar: string; en: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: BODY_FONT_SIZE, fontWeight: 700, color: SECTION_HEADER_BG }}>
        <Bi ar={ar} en={en} />
      </div>
      <div style={{ height: 32, borderBottom: '1px solid #64748b', marginTop: 4 }} />
    </div>
  );
}

export default function StatementTemplate({ data }: { data: StatementData }) {
  const { employee, totals } = data;

  const name = employeeNameBilingual(employee.fullName, employee.fullNameEn);
  const jobTitle = jobTitleBilingual(employee.jobTitle);
  const period = periodBilingual(data.year, data.month);

  return (
    <>
      <div style={wrapper}>
        <div style={section}>
          <Bi ar="بيانات الموظف والفترة" en="Employee & Period Information" />
        </div>
        <div style={row}>
          <div style={labelCell}><Bi ar="اسم الموظف" en="Employee Name" /></div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            <Bi ar={name.ar} en={name.en} />
          </div>
        </div>
        <div style={row}>
          <div style={labelCell}><Bi ar="الرقم الوظيفي" en="Employee No." /></div>
          {/* رقم واحد لا يُكرَّر بلغتين — يُعزل اتجاهيًا فقط. */}
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>
            <bdi dir="ltr">{employee.code}</bdi>
          </div>
        </div>
        <div style={row}>
          <div style={labelCell}><Bi ar="المسمى الوظيفي" en="Job Title" /></div>
          <div style={valueCell}><Bi ar={jobTitle.ar} en={jobTitle.en} /></div>
        </div>
        {employee.civilId && (
          <div style={row}>
            <div style={labelCell}><Bi ar="الرقم المدني" en="Civil ID" /></div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>
              <bdi dir="ltr">{employee.civilId}</bdi>
            </div>
          </div>
        )}
        <div style={row}>
          <div style={labelCell}><Bi ar="الشهر / الفترة" en="Month / Period" /></div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            <Bi ar={period.ar} en={period.en} />
          </div>
        </div>
      </div>

      <div style={wrapper}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}><Bi ar="البند" en="Description" /></th>
              <th style={{ ...th, textAlign: 'end', width: 170 }}>
                <Bi ar="المبلغ (د.ك)" en="Amount (KWD)" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><Bi ar="الراتب الأساسي" en="Basic Salary" /></td>
              <td style={tdAmount}>{money(data.basicSalary)}</td>
            </tr>

            {data.overtime.map((o) => (
              <tr key={o.overtimeType}>
                <td style={td}>
                  <Bi ar={OVERTIME_LABEL_AR[o.overtimeType]} en={OVERTIME_LABEL_EN[o.overtimeType]} />
                  {' — '}
                  <bdi dir="ltr">{o.hours}</bdi>
                  {' ساعة / hours'}
                </td>
                <td style={tdAmount}>{money(o.amount)}</td>
              </tr>
            ))}

            {/* بنود يكتبها المستخدم — تُعرض كما أُدخلت. لا ترجمة مُخترعة لنصّ حرّ. */}
            {data.earnings.map((e, i) => (
              <tr key={`e${i}`}>
                <td style={td}>{e.label}</td>
                <td style={tdAmount}>{money(e.amount)}</td>
              </tr>
            ))}

            <tr>
              <td style={totalRow}><Bi ar="إجمالي المستحقات" en="Total Entitlements" /></td>
              <td style={{ ...totalRow, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>
                {money(totals.grossEntitlements)}
              </td>
            </tr>

            {data.deductions.map((d, i) => (
              <tr key={`d${i}`}>
                <td style={td}>{d.label}</td>
                {/* الاستقطاع بين قوسين — العرف المحاسبي العربي للمبلغ المطروح. */}
                <td style={{ ...tdAmount, color: '#b91c1c' }}>({money(d.amount)})</td>
              </tr>
            ))}

            <tr>
              <td style={totalRow}><Bi ar="إجمالي الاستقطاعات" en="Total Deductions" /></td>
              <td style={{ ...totalRow, textAlign: 'end', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                {totals.totalDeductions > 0 ? `(${money(totals.totalDeductions)})` : money(0)}
              </td>
            </tr>

            <tr>
              <td style={{ ...totalRow, fontSize: BODY_FONT_SIZE + 1, background: '#eef2ff' }}>
                <Bi ar="صافي المستحق" en="Net Entitlement" />
              </td>
              <td
                style={{
                  ...totalRow,
                  fontSize: BODY_FONT_SIZE + 1,
                  background: '#eef2ff',
                  textAlign: 'end',
                  color: '#065f46',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {money(totals.netAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.notes && (
        <div style={wrapper}>
          <div style={section}><Bi ar="ملاحظات" en="Notes" /></div>
          <div style={row}>
            <div style={{ ...valueCell, ...longTextCell }}>{data.notes}</div>
          </div>
        </div>
      )}

      {/* القسم الموحّد — بديل «الإقرار والاستلام» و«اعتماد المدير المباشر» معًا.
          بندان في صفّ أفقي واحد؛ لا «أعد بواسطة» ولا «اعتماد المسؤول» ولا حالة
          اعتماد ولا تاريخ ولا ختم — تلك هي المساحة التي كانت تدفع الكشف لصفحة ثانية. */}
      <div style={{ ...wrapper, marginBottom: 0 }}>
        <div style={section}><Bi ar="الاعتماد والاستلام" en="Approval & Receipt" /></div>
        <div
          data-testid={APPROVAL_RECEIPT_TESTID}
          style={{ display: 'flex', flexDirection: 'row', gap: 24, padding: '6px 10px 8px' }}
        >
          <SignatureSlot ar="توقيع الموظف بالاستلام" en="Employee Receipt Signature" />
          <SignatureSlot ar="اعتماد المدير" en="Manager Approval" />
        </div>
      </div>
    </>
  );
}
