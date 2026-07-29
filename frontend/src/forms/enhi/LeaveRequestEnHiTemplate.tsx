import {
  tableWrapper,
  fmtDateEn,
  issueDateStrEn,
  blankLine,
} from '../shared/formStyles';
import { useBusinessTermsHi } from '../../stores/settingsStore';
import {
  FieldRowEnHi,
  SectionHeaderEnHi,
  EnumValueEnHi,
  SignatureLabelEnHi,
  LabelEnHi,
} from './shared/enHiText';
import { hiParagraphText, EN_HI_SEPARATOR } from './shared/enHiStyles';
import { leaveRequestLabel as L, leaveTypeEnHi } from './shared/enHiLabels';

/**
 * «طلب إجازة» — النسخة الثنائية English + हिन्दी.
 *
 * ملف **مستقل تمامًا**: `LeaveRequestTemplate.tsx` (العربي والإنجليزي) لم يُمَسّ
 * بأي بايت، والصفحة هي التي تختار أي القالبين تُصيّر.
 *
 * التصميم مأخوذ من الفرع الإنجليزي القائم كما هو — نفس الأقسام، نفس ترتيب
 * الحقول، نفس أوليّات `formStyles` (`tableWrapper` / `tableRow` / `blankLine`)،
 * ونفس سلاسل السقوط `latestLeave ?? printFields ?? blankLine`. الفرق الوحيد هو
 * السطر الهندي تحت التسميات وترويسات الأقسام وقيم التعداد. **لا إعادة تصميم.**
 *
 * قاعدة القيم المعتمدة: الاسم (لاتيني)، الأكواد، الرقم المدني، التواريخ، الأرقام
 * والمبالغ — **قيمة واحدة بلا نظير هندي**. القيم التعدادية وحدها (نوع الإجازة)
 * تحمل السطرين.
 */

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
  printFields?: PrintFields;
}

export default function LeaveRequestEnHiTemplate({
  employee: emp,
  latestLeave,
  printFields,
}: Props) {
  const termHi = useBusinessTermsHi();

  // نوع الإجازة: نفس أولوية القالب الإنجليزي (سجل الإجازة ثم حقل الطباعة).
  const leaveTypeKey = latestLeave?.type ?? printFields?.leaveType ?? '';
  const leaveType = leaveTypeKey ? leaveTypeEnHi(leaveTypeKey) : null;

  return (
    <>
      {/* عنوان المستند `Leave Request — अवकाश अनुरोध` يرسمه `FormLayout` في سطر
          `<h1>` الواحد نفسه (الصفحة تمرّره مدموجًا) — فلا سطر عنوان إضافي هنا. */}
      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.employeeInfo')} />

        <FieldRowEnHi
          labelEn={L('f.name').en}
          labelHi={L('f.name').hi}
          valueStyle={{ fontWeight: 700 }}
        >
          {emp.fullNameEn ?? emp.fullName}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.employeeId').en}
          labelHi={L('f.employeeId').hi}
          valueStyle={{ fontFamily: 'monospace' }}
        >
          {emp.code}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.civilId').en}
          labelHi={L('f.civilId').hi}
          valueStyle={{ fontFamily: 'monospace' }}
        >
          {emp.civilId ?? '—'}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.jobTitle').en} labelHi={L('f.jobTitle').hi}>
          {termHi('jobTitle', emp.jobTitle)}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.department').en} labelHi={L('f.department').hi}>
          {termHi('department', emp.department)}
        </FieldRowEnHi>
      </div>

      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.leaveDetails')} />

        <FieldRowEnHi labelEn={L('f.leaveType').en} labelHi={L('f.leaveType').hi}>
          {leaveType ? <EnumValueEnHi {...leaveType} /> : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.startDate').en} labelHi={L('f.startDate').hi}>
          {latestLeave
            ? fmtDateEn(latestLeave.startDate)
            : printFields?.startDate
              ? fmtDateEn(printFields.startDate)
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.endDate').en} labelHi={L('f.endDate').hi}>
          {latestLeave
            ? fmtDateEn(latestLeave.endDate)
            : printFields?.endDate
              ? fmtDateEn(printFields.endDate)
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.days').en}
          labelHi={L('f.days').hi}
          valueStyle={{ fontWeight: 700 }}
        >
          {latestLeave
            ? `${latestLeave.days} day(s)`
            : printFields?.days
              ? `${printFields.days} day(s)`
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.reason').en} labelHi={L('f.reason').hi}>
          {latestLeave
            ? (latestLeave.reason ?? <span style={blankLine} />)
            : printFields?.reason?.trim()
              ? printFields.reason
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.expectedReturn').en} labelHi={L('f.expectedReturn').hi}>
          {printFields?.expectedReturnDate?.trim()
            ? <span>{fmtDateEn(printFields.expectedReturnDate)}</span>
            : <span style={blankLine} />}
        </FieldRowEnHi>
      </div>

      {/* الفقرة الثنائية: جملة إنجليزية ثم الفاصل ثم الهندية **في نفس الفقرة**
          — لا فقرة ثانية مستقلة. النصّان كاملان بلا حذف ولا اختصار. */}
      <div style={{ marginBottom: 12, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
        <p style={{ margin: 0 }}>
          {L('p.declaration').en}
          <span style={hiParagraphText}>{EN_HI_SEPARATOR}{L('p.declaration').hi}</span>
        </p>
      </div>

      <div style={{ marginBottom: 10, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <strong>
          <LabelEnHi en={L('f.requestDate').en} hi={L('f.requestDate').hi} />:
        </strong>{' '}
        {issueDateStrEn()}
      </div>

      {/* اعتماد المدير المباشر يظهر في قسم الاعتماد المشترك بالتذييل
          (`ApprovalSection` عبر `approvalSecondaryLabels`) — لا يُكرَّر هنا. */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <div style={{ width: '60%' }}>
          <SignatureLabelEnHi {...L('sig.employee')} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>
    </>
  );
}
