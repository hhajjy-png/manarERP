import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  fmtDateEn,
  issueDateStr,
  issueDateStrEn,
  blankLine,
} from './shared/formStyles';

const LEAVE_TYPES: Record<string, string> = {
  ANNUAL: 'إجازة سنوية',
  SICK: 'إجازة مرضية',
  UNPAID: 'إجازة بدون راتب',
  EMERGENCY: 'إجازة طارئة',
};

const LEAVE_TYPES_EN: Record<string, string> = {
  ANNUAL: 'Annual Leave',
  SICK: 'Sick Leave',
  UNPAID: 'Unpaid Leave',
  EMERGENCY: 'Emergency Leave',
};

interface Employee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn?: string | null;
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

interface PrintFields {
  expectedReturnDate?: string;
  leaveType?: '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY';
  startDate?: string;
  endDate?: string;
  days?: string;
  reason?: string;
}

interface Props {
  employee: Employee;
  latestLeave: Leave | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
}

export default function LeaveRequestTemplate({ employee: emp, latestLeave, lang = 'ar', printFields }: Props) {
  if (lang === 'en') {
    return (
      <>
        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Employee Information</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Name</div>
            <div style={{ ...valueCell, fontWeight: 700 }}>{emp.fullNameEn ?? emp.fullName}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Employee ID</div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.code}</div>
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
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Leave Request Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Leave Type</div>
            <div style={valueCell}>
              {latestLeave
                ? (LEAVE_TYPES_EN[latestLeave.type] ?? latestLeave.type)
                : printFields?.leaveType
                  ? (LEAVE_TYPES_EN[printFields.leaveType] ?? printFields.leaveType)
                  : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Start Date</div>
            <div style={valueCell}>
              {latestLeave
                ? fmtDateEn(latestLeave.startDate)
                : printFields?.startDate
                  ? fmtDateEn(printFields.startDate)
                  : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>End Date</div>
            <div style={valueCell}>
              {latestLeave
                ? fmtDateEn(latestLeave.endDate)
                : printFields?.endDate
                  ? fmtDateEn(printFields.endDate)
                  : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Days</div>
            <div style={{ ...valueCell, fontWeight: 700 }}>
              {latestLeave
                ? `${latestLeave.days} day(s)`
                : printFields?.days
                  ? `${printFields.days} day(s)`
                  : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Reason</div>
            <div style={valueCell}>
              {latestLeave
                ? (latestLeave.reason ?? <span style={blankLine} />)
                : printFields?.reason?.trim()
                  ? printFields.reason
                  : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Expected Return Date</div>
            <div style={valueCell}>
              {printFields?.expectedReturnDate?.trim()
                ? <span>{fmtDateEn(printFields.expectedReturnDate)}</span>
                : <span style={blankLine} />}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            I hereby request the above-mentioned leave and pledge to return to work on the specified date.
          </p>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Request Date:</strong> {issueDateStrEn()}
        </div>

        {/* Manager approval is provided by the shared ApprovalSection footer — not repeated here. */}
        <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div style={{ width: '48%' }}>
            <strong>Employee Signature:</strong>
            <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
        </div>
      </>
    );
  }

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
            {latestLeave
              ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type)
              : printFields?.leaveType
                ? (LEAVE_TYPES[printFields.leaveType] ?? printFields.leaveType)
                : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ البداية</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDate(latestLeave.startDate)
              : printFields?.startDate
                ? fmtDate(printFields.startDate)
                : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ النهاية</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDate(latestLeave.endDate)
              : printFields?.endDate
                ? fmtDate(printFields.endDate)
                : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>عدد الأيام</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {latestLeave
              ? `${latestLeave.days} يوم`
              : printFields?.days
                ? `${printFields.days} يوم`
                : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الطلب</div>
          <div style={valueCell}>
            {latestLeave
              ? (latestLeave.reason ?? <span style={blankLine} />)
              : printFields?.reason?.trim()
                ? printFields.reason
                : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ العودة المتوقعة</div>
          <div style={valueCell}>
            {printFields?.expectedReturnDate?.trim()
              ? <span>{fmtDate(printFields.expectedReturnDate)}</span>
              : <span style={blankLine} />}
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

      {/* اعتماد المدير المباشر يظهر في قسم الاعتماد المشترك بالتذييل (ApprovalSection) — لا يُكرَّر هنا. */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div style={{ width: '48%' }}>
          <strong>توقيع الموظف:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

    </>
  );
}
