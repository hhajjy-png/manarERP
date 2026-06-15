import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  issueDateStr,
  money,
  blankLine,
} from './shared/formStyles';

interface Employee {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
  salary: number;
}

interface Advance {
  amount: number;
  date: string;
  status: string;
  notes: string | null;
}

interface Props {
  employee: Employee;
  latestAdvance: Advance | null;
}

export default function SalaryAdvanceTemplate({ employee: emp, latestAdvance }: Props) {
  return (
    <>
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الموظف</div>
        <div style={tableRow}>
          <div style={labelCell}>الاسم</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{emp.fullName}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.code}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم المدني</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.civilId ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>القسم / الإدارة</div>
          <div style={valueCell}>{emp.department ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>{money(emp.salary)}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>تفاصيل طلب السلفة</div>
        <div style={tableRow}>
          <div style={labelCell}>المبلغ المطلوب</div>
          <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>
            {latestAdvance ? money(latestAdvance.amount) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ الطلب</div>
          <div style={valueCell}>
            {latestAdvance ? fmtDate(latestAdvance.date) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الغرض / السبب</div>
          <div style={valueCell}>
            {latestAdvance?.notes ?? <span style={blankLine} />}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 2, textAlign: 'justify' }}>
        <p style={{ margin: 0 }}>
          أوافق/توافق الموظف/ة المذكور/ة على خصم مبلغ السلفة من راتبه/راتبها الشهري
          وفق الجدول الزمني المتفق عليه، ويُقرّ/تُقرّ بالحصول على المبلغ المذكور.
        </p>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <strong>توقيع الموظف:</strong> <span style={blankLine} />
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الطلب:</strong> {issueDateStr()}
      </div>

    </>
  );
}
