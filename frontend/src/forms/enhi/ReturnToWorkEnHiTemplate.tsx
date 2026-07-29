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
import {
  returnToWorkLabel as L,
  leaveTypeEnHi,
} from './shared/returnToWorkEnHiLabels';

/**
 * «إشعار العودة إلى العمل» — النسخة الثنائية English + हिन्दी.
 *
 * ملف **مستقل تمامًا**، على نفس بنية `LeaveRequestEnHiTemplate.tsx` المعتمدة في
 * PHASE 1 حرفيًا: نفس الذرّات المشتركة (`forms/enhi/shared/enHiText.tsx`)، نفس
 * الفاصل `EN_HI_SEPARATOR`، نفس أوليّات `formStyles`، ونفس القاعدة — **سطر واحد
 * أفقي** لكل زوج EN/HI (لا سطر ثانٍ) حتى يبقى النموذج على صفحة A4 واحدة.
 * `ReturnToWorkTemplate.tsx` (العربي والإنجليزي) لم يُمَسّ بأي بايت.
 *
 * قاعدة القيم المعتمدة: الاسم (لاتيني)، الأكواد، التواريخ، الأرقام — **قيمة
 * واحدة بلا نظير هندي**. القيمة التعدادية وحدها (نوع الإجازة) ثنائية.
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
  printFields?: PrintFields;
}

export default function ReturnToWorkEnHiTemplate({
  employee: emp,
  latestLeave,
  printFields,
}: Props) {
  const termHi = useBusinessTermsHi();

  const leaveTypeKey = latestLeave?.type ?? printFields?.leaveType ?? '';
  const leaveType = leaveTypeKey ? leaveTypeEnHi(leaveTypeKey) : null;

  return (
    <>
      {/* عنوان المستند يُدمج في سطر واحد ويصل من الصفحة إلى `FormLayout.title`
          — لا سطر عنوان داخل القالب، تمامًا كما في «طلب الإجازة». */}
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

        <FieldRowEnHi labelEn={L('f.jobTitle').en} labelHi={L('f.jobTitle').hi}>
          {termHi('jobTitle', emp.jobTitle)}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.department').en} labelHi={L('f.department').hi}>
          {termHi('department', emp.department)}
        </FieldRowEnHi>
      </div>

      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.returnDetails')} />

        <FieldRowEnHi labelEn={L('f.leaveType').en} labelHi={L('f.leaveType').hi}>
          {leaveType ? <EnumValueEnHi {...leaveType} /> : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.leaveStartDate').en} labelHi={L('f.leaveStartDate').hi}>
          {latestLeave
            ? fmtDateEn(latestLeave.startDate)
            : printFields?.leaveStartDate
              ? fmtDateEn(printFields.leaveStartDate)
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.leaveEndDate').en} labelHi={L('f.leaveEndDate').hi}>
          {latestLeave
            ? fmtDateEn(latestLeave.endDate)
            : printFields?.leaveEndDate
              ? fmtDateEn(printFields.leaveEndDate)
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.days').en} labelHi={L('f.days').hi}>
          {latestLeave
            ? `${latestLeave.days} day(s)`
            : printFields?.leaveDays
              ? `${printFields.leaveDays} day(s)`
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.actualReturnDate').en} labelHi={L('f.actualReturnDate').hi}>
          {printFields?.actualReturnDate?.trim()
            ? fmtDateEn(printFields.actualReturnDate)
            : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.medicalNotes').en}
          labelHi={L('f.medicalNotes').hi}
          valueStyle={{ minHeight: 40 }}
        >
          {printFields?.medicalNotes?.trim()
            ? <span>{printFields.medicalNotes}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
        <p style={{ margin: 0 }}>
          {L('p.declaration').en}
          <span style={hiParagraphText}>{EN_HI_SEPARATOR}{L('p.declaration').hi}</span>
        </p>
      </div>

      <div style={{ marginBottom: 10, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <strong>
          <LabelEnHi en={L('f.noticeDate').en} hi={L('f.noticeDate').hi} />:
        </strong>{' '}
        {issueDateStrEn()}
      </div>

      {/* تأكيد المدير المباشر يظهر في قسم الاعتماد المشترك بالتذييل — لا يُكرَّر هنا. */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <div style={{ width: '65%' }}>
          <SignatureLabelEnHi {...L('sig.employee')} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>
    </>
  );
}
