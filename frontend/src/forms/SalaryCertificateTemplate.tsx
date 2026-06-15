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

interface LatestPayroll {
  month: number;
  year: number;
  netSalary: number;
  snapshotBaseSalary: number;
}

interface Props {
  employee: Employee;
  latestPayroll: LatestPayroll | null;
}

export default function SalaryCertificateTemplate({ employee: emp, latestPayroll }: Props) {
  const baseSalary = latestPayroll?.snapshotBaseSalary ?? emp.salary;

  return (
    <>
      <p style={{ fontSize: 14, lineHeight: 2, marginBottom: 22, textAlign: 'justify' }}>
        تشهد <strong>{COMPANY_NAME}</strong> بأن الموظف/ة المذكور/ة أدناه
        يعمل/تعمل لدينا، وذلك على النحو التالي:
      </p>

      {/* Employee table */}
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
      </div>

      {/* Salary table */}
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الراتب</div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, fontSize: 15, color: '#065f46' }}>
            {money(baseSalary)}
          </div>
        </div>
        {latestPayroll && (
          <div style={tableRow}>
            <div style={labelCell}>آخر راتب صافٍ مستحق</div>
            <div style={{ ...valueCell, fontWeight: 600 }}>
              {money(latestPayroll.netSalary)}
              <span style={{ fontSize: 11, color: '#64748b', marginRight: 8 }}>
                ({latestPayroll.month}/{latestPayroll.year})
              </span>
            </div>
          </div>
        )}
        <div style={tableRow}>
          <div style={labelCell}>العملة</div>
          <div style={valueCell}>دينار كويتي (KWD)</div>
        </div>
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
