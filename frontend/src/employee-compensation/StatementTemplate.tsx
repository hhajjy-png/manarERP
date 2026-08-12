/**
 * قالب **الكشف الرسمي المختصر** — «كشف مستحقات موظف».
 *
 * ═══ ما يظهر ═══
 * بيانات الموظف · الفترة · جدول البنود النهائية بمبالغها · إجمالي الاستحقاقات ·
 * إجمالي الاستقطاعات · صافي المستحق · الملاحظات.
 *
 * ═══ ما لا يظهر — قاعدة مغلقة (المتطلب ٢١) ═══
 * أجر الساعة · المعاملات القانونية · المراجع القانونية · معادلات الحساب · الحسبة
 * العكسية · المبلغ المستهدف · فرق التقريب · أي بيانات تشخيص.
 *
 * وهذا **مضمون بالبنية لا بالانضباط**: `StatementData` لا تحتوي تلك الحقول أصلًا —
 * مسار `/statement` على الخادم لا يرسلها. فلا يستطيع هذا القالب تسريبها حتى لو أراد.
 *
 * عدد الساعات يظهر داخل نصّ البند («عمل إضافي — ١١ ساعة») لأن الكشف الذي يوقّعه
 * الموظف يجب أن يقول عمّاذا يُدفع له، لا أن يعرض مبلغًا مجرّدًا.
 */
import {
  fmtDate,
  issueDateStr,
  labelCell,
  longTextCell,
  money,
  sectionHeader,
  tableRow,
  tableWrapper,
  valueCell,
} from '../forms/shared/formStyles';
import { OVERTIME_LABEL_AR, monthNameAr } from './labels';
import type { StatementData } from './types';

const th: React.CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 800,
  fontSize: 13,
  padding: '8px 14px',
  textAlign: 'start',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};
const td: React.CSSProperties = { padding: '7px 14px', fontSize: 13, borderBottom: '1px solid #e2e8f0' };
const tdAmount: React.CSSProperties = { ...td, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const totalRow: React.CSSProperties = { ...td, fontWeight: 800, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

export default function StatementTemplate({ data }: { data: StatementData }) {
  const { employee, totals } = data;

  return (
    <>
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الموظف والفترة</div>
        <div style={tableRow}>
          <div style={labelCell}>اسم الموظف</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{employee.fullName}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{employee.code}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{employee.jobTitle ?? '—'}</div>
        </div>
        {employee.civilId && (
          <div style={tableRow}>
            <div style={labelCell}>الرقم المدني</div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>{employee.civilId}</div>
          </div>
        )}
        <div style={tableRow}>
          <div style={labelCell}>الشهر / الفترة</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{monthNameAr(data.month)} {data.year}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ إعداد الكشف</div>
          <div style={valueCell}>{issueDateStr()}</div>
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>البند</th>
              <th style={{ ...th, textAlign: 'end', width: 160 }}>المبلغ (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>الراتب الأساسي</td>
              <td style={tdAmount}>{money(data.basicSalary)}</td>
            </tr>

            {data.overtime.map((o) => (
              <tr key={o.overtimeType}>
                <td style={td}>
                  {OVERTIME_LABEL_AR[o.overtimeType]} — {o.hours} ساعة
                </td>
                <td style={tdAmount}>{money(o.amount)}</td>
              </tr>
            ))}

            {data.earnings.map((e, i) => (
              <tr key={`e${i}`}>
                <td style={td}>{e.label}</td>
                <td style={tdAmount}>{money(e.amount)}</td>
              </tr>
            ))}

            <tr>
              <td style={totalRow}>إجمالي الاستحقاقات</td>
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
              <td style={totalRow}>إجمالي الاستقطاعات</td>
              <td style={{ ...totalRow, textAlign: 'end', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                {totals.totalDeductions > 0 ? `(${money(totals.totalDeductions)})` : money(0)}
              </td>
            </tr>

            <tr>
              <td style={{ ...totalRow, fontSize: 14, background: '#eef2ff' }}>صافي المستحق</td>
              <td style={{ ...totalRow, fontSize: 14, background: '#eef2ff', textAlign: 'end', color: '#065f46', fontVariantNumeric: 'tabular-nums' }}>
                {money(totals.netAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {data.notes && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>ملاحظات</div>
          <div style={tableRow}>
            <div style={longTextCell}>{data.notes}</div>
          </div>
        </div>
      )}

      <div style={tableWrapper}>
        <div style={sectionHeader}>الإقرار والاستلام</div>
        <div style={tableRow}>
          <div style={labelCell}>أُعدّ بواسطة</div>
          <div style={valueCell}>{data.preparedByName ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>اعتماد المسؤول</div>
          <div style={valueCell}>
            {data.status === 'APPROVED'
              ? `${data.approvedByName ?? '—'}${data.approvedAt ? ` — ${fmtDate(data.approvedAt)}` : ''}`
              : 'غير معتمد'}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>توقيع الموظف بالاستلام</div>
          <div style={{ ...valueCell, height: 44 }} />
        </div>
      </div>
    </>
  );
}
