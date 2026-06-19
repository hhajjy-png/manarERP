import {
  COMPANY_NAME,
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  fmtDateEn,
  issueDateStr,
  issueDateStrEn,
  money,
  moneyEn,
  blankLine,
} from './shared/formStyles';

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

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

interface PrintFields {
  certPurpose?: string;
}

interface Props {
  employee: Employee;
  latestPayroll: { month: number; year: number; netSalary: number; snapshotBaseSalary: number } | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
}

export default function ToWhomItMayConcernTemplate({ employee: emp, latestPayroll, lang = 'ar', printFields }: Props) {
  const baseSalary = latestPayroll?.snapshotBaseSalary ?? emp.salary;

  if (lang === 'en') {
    return (
      <>
        <p style={{ fontSize: 14, lineHeight: 2, marginBottom: 22, textAlign: 'justify', direction: 'ltr' }}>
          <strong>{COMPANY_NAME_EN}</strong> hereby certifies that the below-named employee
          is officially employed with us, effective from the hire date stated below.
          This certificate is issued to whom it may concern upon the employee's request.
        </p>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Employee Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Full Name (Arabic)</div>
            <div style={{ ...valueCell, fontWeight: 700, fontSize: 15 }}>{emp.fullName}</div>
          </div>
          {emp.fullNameEn && (
            <div style={{ ...tableRow, direction: 'ltr' }}>
              <div style={{ ...labelCell, textAlign: 'left' }}>Full Name (English)</div>
              <div style={{ ...valueCell, fontWeight: 700, fontSize: 15 }}>{emp.fullNameEn}</div>
            </div>
          )}
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Employee ID</div>
            <div style={{ ...valueCell, fontFamily: 'monospace', fontWeight: 600 }}>{emp.code}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Civil ID</div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.civilId ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Job Title</div>
            <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Department</div>
            <div style={valueCell}>{emp.department ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Nationality</div>
            <div style={valueCell}>{emp.nationality ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Date of Hire</div>
            <div style={valueCell}>{fmtDateEn(emp.hireDate)}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Monthly Salary</div>
            <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>{moneyEn(baseSalary)}</div>
          </div>
        </div>

        <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Purpose:</strong>{' '}
          {printFields?.certPurpose?.trim()
            ? <span>{printFields.certPurpose}</span>
            : <span style={blankLine} />}
        </div>

        <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 20, textAlign: 'justify', direction: 'ltr', color: '#374151' }}>
          This certificate has been issued upon the employee's request for official use and to be
          presented wherever needed, without any liability on the company's part.
        </p>

        <div style={{ marginBottom: 16, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Date of Issue:</strong> {issueDateStrEn()}
        </div>
      </>
    );
  }

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
        {printFields?.certPurpose?.trim()
          ? <span>{printFields.certPurpose}</span>
          : <span style={blankLine} />}
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
