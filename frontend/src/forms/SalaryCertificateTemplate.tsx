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
import { amountToWordsKWD } from '../lib/tafqeet';

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

interface LatestPayroll {
  month: number;
  year: number;
  netSalary: number;
  snapshotBaseSalary: number;
}

export interface PrintOverrides {
  purpose?: string;
  jobTitle?: string;
  department?: string;
  salaryText?: string;
  issueDate?: string;
  notes?: string;
}

interface Props {
  employee: Employee;
  latestPayroll: LatestPayroll | null;
  lang?: 'ar' | 'en';
  printOverrides?: PrintOverrides;
}

function val(override: string | undefined, fallback: string | null | undefined, dash = '—'): string {
  return override?.trim() || fallback || dash;
}

export default function SalaryCertificateTemplate({ employee: emp, latestPayroll, lang = 'ar', printOverrides }: Props) {
  const baseSalary = latestPayroll?.snapshotBaseSalary ?? emp.salary;
  const salaryDisplay = printOverrides?.salaryText?.trim() || null;
  const issueDateDisplay = printOverrides?.issueDate?.trim() || null;

  if (lang === 'en') {
    return (
      <>
        <p style={{ fontSize: 14, lineHeight: 2, marginBottom: 22, textAlign: 'justify', direction: 'ltr' }}>
          This is to certify that the below-named employee is currently employed by{' '}
          <strong>{COMPANY_NAME_EN}</strong>, as follows:
        </p>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Employee Information</div>
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
            <div style={valueCell}>{val(printOverrides?.jobTitle, emp.jobTitle)}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Department</div>
            <div style={valueCell}>{val(printOverrides?.department, emp.department)}</div>
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
            <div style={{ ...labelCell, textAlign: 'left' }}>Purpose</div>
            <div style={valueCell}>
              {printOverrides?.purpose?.trim()
                ? <span>{printOverrides.purpose}</span>
                : <span style={blankLine} />}
            </div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Salary Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Monthly Basic Salary</div>
            <div style={{ ...valueCell, fontWeight: 700, fontSize: 15, color: '#065f46' }}>
              {salaryDisplay ?? moneyEn(baseSalary)}
            </div>
          </div>
          {latestPayroll && (
            <div style={{ ...tableRow, direction: 'ltr' }}>
              <div style={{ ...labelCell, textAlign: 'left' }}>Last Net Salary</div>
              <div style={{ ...valueCell, fontWeight: 600 }}>
                {moneyEn(latestPayroll.netSalary)}
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                  ({latestPayroll.month}/{latestPayroll.year})
                </span>
              </div>
            </div>
          )}
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Salary in Words</div>
            <div style={valueCell}>{amountToWordsKWD(baseSalary, 'en')}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Currency</div>
            <div style={valueCell}>Kuwaiti Dinar (KWD)</div>
          </div>
        </div>

        <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 20, textAlign: 'justify', direction: 'ltr', color: '#374151' }}>
          This certificate has been issued upon the employee's request for official use and to be
          presented wherever needed, without any liability on the company's part.
        </p>

        {printOverrides?.notes?.trim() && (
          <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 16, direction: 'ltr', color: '#374151', fontStyle: 'italic' }}>
            <strong>Notes:</strong> {printOverrides.notes}
          </p>
        )}

        <div style={{ marginBottom: 16, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Date of Issue:</strong> {issueDateDisplay ?? issueDateStrEn()}
        </div>
      </>
    );
  }

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
          <div style={valueCell}>{val(printOverrides?.jobTitle, emp.jobTitle)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>القسم / الإدارة</div>
          <div style={valueCell}>{val(printOverrides?.department, emp.department)}</div>
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
          <div style={labelCell}>الغرض</div>
          <div style={valueCell}>
            {printOverrides?.purpose?.trim()
              ? <span>{printOverrides.purpose}</span>
              : <span style={blankLine} />}
          </div>
        </div>
      </div>

      {/* Salary table */}
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الراتب</div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, fontSize: 15, color: '#065f46' }}>
            {salaryDisplay ?? money(baseSalary)}
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
          <div style={labelCell}>الراتب كتابة</div>
          <div style={valueCell}>{amountToWordsKWD(baseSalary, 'ar')}</div>
        </div>
      </div>

      <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 20, textAlign: 'justify', color: '#374151' }}>
        وقد أُعطيت هذه الشهادة بناءً على طلب الموظف/ة للاستخدام الرسمي فيما يُقدّمها إليه/إليها،
        دون أي مسؤولية على الشركة تجاه الجهة المقدَّمة إليها.
      </p>

      {printOverrides?.notes?.trim() && (
        <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 16, color: '#374151', fontStyle: 'italic' }}>
          <strong>ملاحظات:</strong> {printOverrides.notes}
        </p>
      )}

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الإصدار:</strong> {issueDateDisplay ?? issueDateStr()}
      </div>

    </>
  );
}
