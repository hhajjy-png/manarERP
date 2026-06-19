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
  reason: string | null;
}

interface Props {
  employee: Employee;
  latestLeave: Leave | null;
}

export default function LeaveRequestTemplate({ employee: emp, latestLeave }: Props) {
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
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>تفاصيل طلب الإجازة</div>
        <div style={tableRow}>
          <div style={labelCell}>نوع الإجازة</div>
          <div style={valueCell}>
            {latestLeave ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ البداية</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.startDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ النهاية</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.endDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>عدد الأيام</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {latestLeave ? `${latestLeave.days} يوم` : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الطلب</div>
          <div style={valueCell}>
            {latestLeave?.reason ?? <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ العودة المتوقعة</div>
          <div style={valueCell}>
            <span style={blankLine} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          أتقدم/تتقدم بطلب الإجازة المذكورة أعلاه، وأتعهد بالعودة إلى العمل في
          الموعد المحدد.
        </p>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ تقديم الطلب:</strong> {issueDateStr()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div>
          <strong>توقيع الموظف:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>اعتماد المدير المباشر:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

    </>
  );
}
