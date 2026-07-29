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
  SignatureLabelEnHi,
} from './shared/enHiText';
import { hiParagraphText, EN_HI_SEPARATOR } from './shared/enHiStyles';
import { resignationLabel as L } from './shared/resignationEnHiLabels';

/**
 * «طلب استقالة» — النسخة الثنائية English + हिन्दी.
 *
 * ملف **مستقل تمامًا**، على نفس بنية `LeaveRequestEnHiTemplate.tsx` المعتمدة —
 * نفس الذرّات، نفس الفاصل، سطر واحد أفقي لكل زوج. `ResignationTemplate.tsx`
 * (العربي والإنجليزي) لم يُمَسّ. الاسم لاتيني فقط، والتواريخ قيمة واحدة.
 */

interface Employee {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
  hireDate: string | null;
}

interface PrintFields {
  lastWorkingDay?: string;
  noticePeriod?: string;
  resignationReason?: string;
  handoverObligations?: string;
}

interface Props {
  employee: Employee;
  printFields?: PrintFields;
}

export default function ResignationEnHiTemplate({ employee: emp, printFields }: Props) {
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
          {emp.fullName}
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

        <FieldRowEnHi labelEn={L('f.dateOfHire').en} labelHi={L('f.dateOfHire').hi}>
          {fmtDateEn(emp.hireDate)}
        </FieldRowEnHi>
      </div>

      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.resignationDetails')} />

        <FieldRowEnHi labelEn={L('f.resignationDate').en} labelHi={L('f.resignationDate').hi}>
          {issueDateStrEn()}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.lastWorkingDay').en} labelHi={L('f.lastWorkingDay').hi}>
          {printFields?.lastWorkingDay?.trim() ? <span>{printFields.lastWorkingDay}</span> : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.noticePeriod').en} labelHi={L('f.noticePeriod').hi}>
          {printFields?.noticePeriod?.trim() ? <span>{printFields.noticePeriod}</span> : <span style={blankLine} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.reason').en}
          labelHi={L('f.reason').hi}
          valueStyle={{ minHeight: 40 }}
        >
          {printFields?.resignationReason?.trim()
            ? <span>{printFields.resignationReason}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.handover').en}
          labelHi={L('f.handover').hi}
          valueStyle={{ minHeight: 36 }}
        >
          {printFields?.handoverObligations?.trim()
            ? <span>{printFields.handoverObligations}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, textAlign: 'justify', direction: 'ltr' }}>
        <p style={{ margin: 0 }}>
          {L('p.declaration').en}
          <span style={hiParagraphText}>{EN_HI_SEPARATOR}{L('p.declaration').hi}</span>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <div>
          <SignatureLabelEnHi {...L('sig.employee')} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <SignatureLabelEnHi {...L('sig.hrReceipt')} />
          <div style={{ marginTop: 18, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>
    </>
  );
}
