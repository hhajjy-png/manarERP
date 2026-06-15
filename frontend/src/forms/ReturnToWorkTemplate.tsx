import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  issueDateStr,
  blankLine,
} from './shared/formStyles';

const LEAVE_TYPES: Record<string, string> = {
  ANNUAL: 'إجازة سنوية',
  SICK: 'إجازة مرضية',
  UNPAID: 'إجازة بدون راتب',
  EMERGENCY: 'إجازة طارئة',
};

interface Employee {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
}

interface Leave {
  type: string;
  startDate: string;
  endDate: string;
  days: number;
}

interface Props {
  employee: Employee;
  latestLeave: Leave | null;
}

export default function ReturnToWorkTemplate({ employee: emp, latestLeave }: Props) {
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
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>القسم / الإدارة</div>
          <div style={valueCell}>{emp.department ?? '—'}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات العودة إلى العمل</div>
        <div style={tableRow}>
          <div style={labelCell}>نوع الإجازة المنقضية</div>
          <div style={valueCell}>
            {latestLeave ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ بداية الإجازة</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.startDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ نهاية الإجازة</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.endDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>عدد الأيام</div>
          <div style={valueCell}>
            {latestLeave ? `${latestLeave.days} يوم` : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ العودة الفعلية</div>
          <div style={valueCell}>
            <span style={blankLine} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 2 }}>
        <p style={{ margin: 0 }}>
          أُفيد بأن الموظف/ة المذكور/ة أعلاه قد عاد/ت إلى العمل بعد انقضاء إجازته/إجازتها
          وهو/هي في حالة جيدة وجاهز/ة لاستئناف مهام عمله/عملها.
        </p>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الإشعار:</strong> {issueDateStr()}
      </div>

    </>
  );
}
