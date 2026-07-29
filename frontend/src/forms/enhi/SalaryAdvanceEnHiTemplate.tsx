import {
  tableWrapper,
  fmtDateEn,
  issueDateStrEn,
  moneyEn,
  blankLine,
} from '../shared/formStyles';
import { useBusinessTermsHi } from '../../stores/settingsStore';
import {
  FieldRowEnHi,
  SectionHeaderEnHi,
  SignatureLabelEnHi,
  LabelEnHi,
} from './shared/enHiText';
import { hiParagraphText, EN_HI_SEPARATOR } from './shared/enHiStyles';
import { salaryAdvanceLabel as L } from './shared/salaryAdvanceEnHiLabels';

/**
 * «طلب سلفة راتب» — النسخة الثنائية English + हिन्दी.
 *
 * ملف **مستقل تمامًا**، على نفس بنية `LeaveRequestEnHiTemplate.tsx` المعتمدة —
 * نفس الذرّات، نفس الفاصل، سطر واحد أفقي لكل زوج. `SalaryAdvanceTemplate.tsx`
 * (العربي والإنجليزي) لم يُمَسّ.
 *
 * قاعدة القيم: الاسم لاتيني، والمبالغ (الراتب الشهري، مبلغ السلفة، قيمة القسط)
 * **قيمة واحدة بلا نظير هندي** — نفس قاعدة PHASE 1 للأرقام والمبالغ. `moneyEn`
 * نفسها المستوردة من `formStyles` القائمة، بلا أي نسخة موازية.
 */

interface Employee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn?: string | null;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
  salary: number;
}

interface Advance {
  amount: number;
  date: string;
  status: string;
  notes: string | null;
}

interface PrintFields {
  advanceAmount?: string;
  requestDate?: string;
  reason?: string;
  installments?: string;
  installmentAmount?: string;
  repaymentSchedule?: string;
}

interface Props {
  employee: Employee;
  latestAdvance: Advance | null;
  printFields?: PrintFields;
}

export default function SalaryAdvanceEnHiTemplate({
  employee: emp,
  latestAdvance,
  printFields,
}: Props) {
  const termHi = useBusinessTermsHi();

  return (
    <>
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

        <FieldRowEnHi
          labelEn={L('f.monthlySalary').en}
          labelHi={L('f.monthlySalary').hi}
          valueStyle={{ fontWeight: 700, color: '#065f46' }}
        >
          {moneyEn(emp.salary)}
        </FieldRowEnHi>
      </div>

      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.advanceDetails')} />

        <FieldRowEnHi
          labelEn={L('f.requestedAmount').en}
          labelHi={L('f.requestedAmount').hi}
          valueStyle={{ fontWeight: 700, color: '#065f46' }}
        >
          {latestAdvance
            ? moneyEn(latestAdvance.amount)
            : printFields?.advanceAmount?.trim()
              ? moneyEn(Number(printFields.advanceAmount))
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.requestDate').en} labelHi={L('f.requestDate').hi}>
          {latestAdvance
            ? fmtDateEn(latestAdvance.date)
            : printFields?.requestDate?.trim()
              ? fmtDateEn(printFields.requestDate)
              : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.reason').en} labelHi={L('f.reason').hi}>
          {latestAdvance?.notes ?? (printFields?.reason?.trim() ? <span>{printFields.reason}</span> : <span style={blankLine} />)}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.installments').en} labelHi={L('f.installments').hi}>
          {printFields?.installments?.trim() ? <span>{printFields.installments}</span> : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.installmentAmount').en} labelHi={L('f.installmentAmount').hi}>
          {printFields?.installmentAmount?.trim() ? moneyEn(Number(printFields.installmentAmount)) : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.repaymentSchedule').en}
          labelHi={L('f.repaymentSchedule').hi}
          valueStyle={{ minHeight: 36 }}
        >
          {printFields?.repaymentSchedule?.trim()
            ? <span>{printFields.repaymentSchedule}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151', lineHeight: 1.8, textAlign: 'justify', direction: 'ltr' }}>
        <p style={{ margin: 0 }}>
          {L('p.declaration').en}
          <span style={hiParagraphText}>{EN_HI_SEPARATOR}{L('p.declaration').hi}</span>
        </p>
      </div>

      {/* اعتماد الموارد البشرية/المالية يظهر في قسم الاعتماد المشترك بالتذييل — لا يُكرَّر هنا. */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <div style={{ width: '60%' }}>
          <SignatureLabelEnHi {...L('sig.employee')} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

      {/* سطر تاريخ التقديم المستقل أسفل التوقيع — كما في القالب الإنجليزي
          (منفصل عن حقل «Request Date» داخل الجدول أعلاه، الذي يعكس تاريخ
          السلفة المسجَّلة لا تاريخ تقديم هذه المطبوعة). */}
      <div style={{ fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <strong>
          <LabelEnHi en={L('f.requestDate').en} hi={L('f.requestDate').hi} />:
        </strong>{' '}
        {issueDateStrEn()}
      </div>
    </>
  );
}
