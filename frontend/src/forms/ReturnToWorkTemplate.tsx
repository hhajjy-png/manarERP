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
}

interface PrintFields {
  leaveType?: '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY';
  leaveStartDate?: string;
  leaveEndDate?: string;
  leaveDays?: string;
  actualReturnDate?: string;
  medicalNotes?: string;
}

interface Props {
  employee: Employee;
  latestLeave: Leave | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
}

export default function ReturnToWorkTemplate({ employee: emp, latestLeave, lang = 'ar', printFields }: Props) {
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
            <div style={{ ...labelCell, textAlign: 'left' }}>Job Title</div>
            <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Department</div>
            <div style={valueCell}>{emp.department ?? '—'}</div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Return to Work Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Leave Type</div>
            <div style={valueCell}>
              {latestLeave ? (LEAVE_TYPES_EN[latestLeave.type] ?? latestLeave.type) : printFields?.leaveType ? (LEAVE_TYPES_EN[printFields.leaveType] ?? printFields.leaveType) : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Leave Start Date</div>
            <div style={valueCell}>
              {latestLeave ? fmtDateEn(latestLeave.startDate) : printFields?.leaveStartDate ? fmtDateEn(printFields.leaveStartDate) : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Leave End Date</div>
            <div style={valueCell}>
              {latestLeave ? fmtDateEn(latestLeave.endDate) : printFields?.leaveEndDate ? fmtDateEn(printFields.leaveEndDate) : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Days</div>
            <div style={valueCell}>
              {latestLeave ? `${latestLeave.days} day(s)` : printFields?.leaveDays ? `${printFields.leaveDays} day(s)` : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Actual Return Date</div>
            <div style={valueCell}>{printFields?.actualReturnDate?.trim() ? fmtDateEn(printFields.actualReturnDate) : <span style={blankLine} />}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Medical Notes / Doctor's Report</div>
            <div style={{ ...valueCell, minHeight: 44 }}>
              {printFields?.medicalNotes?.trim() ? <span>{printFields.medicalNotes}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            The above-mentioned employee has returned to work after the expiry of their leave
            and is in good condition and ready to resume their duties.
          </p>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Notice Date:</strong> {issueDateStrEn()}
        </div>

        {/* Manager confirmation is provided by the shared ApprovalSection footer — not repeated here. */}
        <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div style={{ width: '48%' }}>
            <strong>Employee Signature (Return Confirmation):</strong>
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
            {latestLeave ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type) : printFields?.leaveType ? (LEAVE_TYPES[printFields.leaveType] ?? printFields.leaveType) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ بداية الإجازة</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.startDate) : printFields?.leaveStartDate ? fmtDate(printFields.leaveStartDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ نهاية الإجازة</div>
          <div style={valueCell}>
            {latestLeave ? fmtDate(latestLeave.endDate) : printFields?.leaveEndDate ? fmtDate(printFields.leaveEndDate) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>عدد الأيام</div>
          <div style={valueCell}>
            {latestLeave ? `${latestLeave.days} يوم` : printFields?.leaveDays ? `${printFields.leaveDays} يوم` : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ العودة الفعلية</div>
          <div style={valueCell}>{printFields?.actualReturnDate?.trim() ? fmtDate(printFields.actualReturnDate) : <span style={blankLine} />}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>ملاحظات طبية / تقرير الطبيب</div>
          <div style={{ ...valueCell, minHeight: 44 }}>
            {printFields?.medicalNotes?.trim() ? <span>{printFields.medicalNotes}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          أُفيد بأن الموظف/ة المذكور/ة أعلاه قد عاد/ت إلى العمل بعد انقضاء إجازته/إجازتها
          وهو/هي في حالة جيدة وجاهز/ة لاستئناف مهام عمله/عملها.
        </p>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الإشعار:</strong> {issueDateStr()}
      </div>

      {/* تأكيد المدير المباشر يظهر في قسم الاعتماد المشترك بالتذييل (ApprovalSection) — لا يُكرَّر هنا. */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div style={{ width: '48%' }}>
          <strong>توقيع الموظف (تأكيد العودة):</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

    </>
  );
}
