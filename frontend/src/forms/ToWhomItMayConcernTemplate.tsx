import {
  COMPANY_NAME,
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
  fullNameEn: string | null;
  civilId: string | null;
  jobTitle: string | null;
  department: string | null;
  salary: number;
  hireDate: string | null;
  nationality: string | null;
}

interface Props {
  employee: Employee;
  latestPayroll: { month: number; year: number; netSalary: number; snapshotBaseSalary: number } | null;
}

export default function ToWhomItMayConcernTemplate({ employee: emp, latestPayroll }: Props) {
  const baseSalary = latestPayroll?.snapshotBaseSalary ?? emp.salary;

  return (
    <>
      <p style={{ fontSize: 14, lineHeight: 2, marginBottom: 22, textAlign: 'justify' }}>
        تشهد <strong>{COMPANY_NAME}</strong> بأن الموظف/ة المذكور/ة أدناه
        يعمل/تعمل لدينا بصفة رسمية، وذلك اعتباراً من تاريخ التعيين المبيّن أدناه.
        وتُصدر هذه الشهادة لمن يهمه الأمر بناءً على طلب الموظف/ة.
      </p>

      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الموظف</div>
        <div style={tableRow}>
          <div style={labelCell}>الاسم (عربي)</div>
          <div style={{ ...valueCell, fontWeight: 700, fontSize: 15 }}>{emp.fullName}</div>
        </div>
        {emp.fullNameEn && (
          <div style={tableRow}>
            <div style={labelCell}>الاسم (إنجليزي)</div>
            <div style={{ ...valueCell, direction: 'ltr', textAlign: 'left' }}>{emp.fullNameEn}</div>
          </div>
        )}
        <div style={tableRow}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace', fontWeight: 600 }}>{emp.code}</div>
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
          <div style={labelCell}>الجنسية</div>
          <div style={valueCell}>{emp.nationality ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ التعيين</div>
          <div style={valueCell}>{fmtDate(emp.hireDate)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>{money(baseSalary)}</div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151' }}>
        <strong>الغرض من الشهادة:</strong>{' '}
        <span style={blankLine} />
      </div>

      <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 20, textAlign: 'justify', color: '#374151' }}>
        وقد أُعطيت هذه الشهادة بناءً على طلب الموظف/ة للاستخدام الرسمي فيما يُقدّمها إليه/إليها،
        دون أي مسؤولية على الشركة تجاه الجهة المقدَّمة إليها.
      </p>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الإصدار:</strong> {issueDateStr()}
      </div>

    </>
  );
}
