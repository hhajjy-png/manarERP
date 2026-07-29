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
  LabelEnHi,
} from './shared/enHiText';
import { hiParagraphText, EN_HI_SEPARATOR } from './shared/enHiStyles';
import {
  employeeWarningLabel as L,
  warningLevelEnHi,
  WARNING_LEVELS_EN_HI,
  type WarningLevelKey,
} from './shared/employeeWarningEnHiLabels';

/**
 * «إنذار موظف» — النسخة الثنائية English + हिन्दी.
 *
 * ملف **مستقل تمامًا**، على نفس بنية `LeaveRequestEnHiTemplate.tsx` المعتمدة —
 * نفس الذرّات، نفس الفاصل، سطر واحد أفقي لكل زوج. `EmployeeWarningTemplate.tsx`
 * (العربي والإنجليزي) لم يُمَسّ.
 *
 * صندوق درجة الإنذار (`WarningCheckboxRowEnHi`) مكوّن محلي لهذا الملف وحده —
 * لا نموذج آخر يستعمله، فليس ذرّة مشتركة في `forms/enhi/shared/`. نفس السلوك
 * التفاعلي للنسخة الأصلية (نقر/لوحة مفاتيح)، وتسمية كل درجة `EN — HI`.
 */

type WarningLevel = '' | WarningLevelKey;

interface Employee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn?: string | null;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
}

interface PrintFields {
  warningLevel?: WarningLevel;
  warningDate?: string;
  warningReason?: string;
  violationDetails?: string;
  correctiveAction?: string;
  additionalNotes?: string;
}

interface Props {
  employee: Employee;
  printFields?: PrintFields;
  onWarningLevelChange?: (level: WarningLevel) => void;
}

function WarningCheckboxRowEnHi({
  printFields,
  onWarningLevelChange,
}: {
  printFields?: PrintFields;
  onWarningLevelChange?: (level: WarningLevel) => void;
}) {
  const keys = Object.keys(WARNING_LEVELS_EN_HI) as WarningLevelKey[];
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {keys.map((key) => {
        const isSelected = printFields?.warningLevel === key;
        const { en, hi } = warningLevelEnHi(key);
        return (
          <span
            key={key}
            role="checkbox"
            aria-checked={isSelected ? 'true' : 'false'}
            tabIndex={onWarningLevelChange ? 0 : -1}
            onClick={() => onWarningLevelChange?.(isSelected ? '' : key)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onWarningLevelChange?.(isSelected ? '' : key);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: onWarningLevelChange ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${isSelected ? '#1d4e6f' : '#94a3b8'}`,
                borderRadius: 2,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                background: isSelected ? '#1d4e6f' : 'transparent',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {isSelected && (
                <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 700 }}>
                  ✓
                </span>
              )}
            </span>
            <LabelEnHi en={en} hi={hi} />
          </span>
        );
      })}
    </div>
  );
}

export default function EmployeeWarningEnHiTemplate({
  employee: emp,
  printFields,
  onWarningLevelChange,
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
      </div>

      <div style={{ ...tableWrapper, direction: 'ltr' }}>
        <SectionHeaderEnHi {...L('sec.warningDetails')} />

        <FieldRowEnHi labelEn={L('f.warningDate').en} labelHi={L('f.warningDate').hi}>
          {printFields?.warningDate?.trim() ? fmtDateEn(printFields.warningDate) : issueDateStrEn()}
        </FieldRowEnHi>

        <FieldRowEnHi labelEn={L('f.warningLevel').en} labelHi={L('f.warningLevel').hi}>
          <WarningCheckboxRowEnHi printFields={printFields} onWarningLevelChange={onWarningLevelChange} />
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.warningReason').en}
          labelHi={L('f.warningReason').hi}
          valueStyle={{ minHeight: 36 }}
        >
          {printFields?.warningReason?.trim()
            ? <span>{printFields.warningReason}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.violationDetails').en}
          labelHi={L('f.violationDetails').hi}
          valueStyle={{ minHeight: 36 }}
        >
          {printFields?.violationDetails?.trim()
            ? <span>{printFields.violationDetails}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.correctiveAction').en}
          labelHi={L('f.correctiveAction').hi}
          valueStyle={{ minHeight: 32 }}
        >
          {printFields?.correctiveAction?.trim()
            ? <span>{printFields.correctiveAction}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>

        <FieldRowEnHi
          labelEn={L('f.additionalNotes').en}
          labelHi={L('f.additionalNotes').hi}
          valueStyle={{ minHeight: 28 }}
        >
          {printFields?.additionalNotes?.trim()
            ? <span>{printFields.additionalNotes}</span>
            : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
        </FieldRowEnHi>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
        <p style={{ margin: 0 }}>
          {L('p.declaration').en}
          <span style={hiParagraphText}>{EN_HI_SEPARATOR}{L('p.declaration').hi}</span>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
        <div>
          <SignatureLabelEnHi {...L('sig.employee')} />
          <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <SignatureLabelEnHi {...L('sig.supervisor')} />
          <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <SignatureLabelEnHi {...L('sig.date')} />
          <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>
    </>
  );
}
