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
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
}

export default function ResignationTemplate({ employee: emp, lang = 'ar', printFields }: Props) {
  if (lang === 'en') {
    return (
      <>
        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Employee Information</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Name</div>
            <div style={{ ...valueCell, fontWeight: 700 }}>{emp.fullName}</div>
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
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Date of Hire</div>
            <div style={valueCell}>{fmtDateEn(emp.hireDate)}</div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Resignation Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Resignation Date</div>
            <div style={valueCell}>{issueDateStrEn()}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Last Working Day</div>
            <div style={valueCell}>{printFields?.lastWorkingDay?.trim() ? <span>{printFields.lastWorkingDay}</span> : <span style={blankLine} />}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Notice Period</div>
            <div style={valueCell}>{printFields?.noticePeriod?.trim() ? <span>{printFields.noticePeriod}</span> : <span style={blankLine} />}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Reason for Resignation</div>
            <div style={{ ...valueCell, minHeight: 52 }}>
              {printFields?.resignationReason?.trim() ? <span>{printFields.resignationReason}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Handover Obligations</div>
            <div style={{ ...valueCell, minHeight: 48 }}>
              {printFields?.handoverObligations?.trim() ? <span>{printFields.handoverObligations}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, textAlign: 'justify', direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            I hereby submit my resignation from my position at the company and pledge to complete the
            handover of all tasks and documents within the specified notice period.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div>
            <strong>Employee Signature:</strong>
            <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>HR Receipt / Date:</strong>
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
        <div style={tableRow}>
          <div style={labelCell}>تاريخ التعيين</div>
          <div style={valueCell}>{fmtDate(emp.hireDate)}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>تفاصيل الاستقالة</div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ تقديم الاستقالة</div>
          <div style={valueCell}>{issueDateStr()}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>آخر يوم عمل</div>
          <div style={valueCell}>{printFields?.lastWorkingDay?.trim() ? <span>{printFields.lastWorkingDay}</span> : <span style={blankLine} />}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>فترة الإشعار</div>
          <div style={valueCell}>{printFields?.noticePeriod?.trim() ? <span>{printFields.noticePeriod}</span> : <span style={blankLine} />}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الاستقالة</div>
          <div style={{ ...valueCell, minHeight: 52 }}>
            {printFields?.resignationReason?.trim() ? <span>{printFields.resignationReason}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>التزامات التسليم</div>
          <div style={{ ...valueCell, minHeight: 48 }}>
            {printFields?.handoverObligations?.trim() ? <span>{printFields.handoverObligations}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, textAlign: 'justify' }}>
        <p style={{ margin: 0 }}>
          أتقدم/تتقدم بهذا الطلب للاستقالة من وظيفتي في الشركة المذكورة،
          وأتعهد بتسليم ما بعهدتي من مهام ومستندات خلال فترة الإشعار المحددة.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div>
          <strong>توقيع الموظف:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>استلام الإدارة / التاريخ:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

    </>
  );
}
