import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
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
}

interface Props {
  employee: Employee;
  lang?: 'ar' | 'en';
}

const WARNING_LEVELS = ['أولى (شفهية)', 'ثانية (خطية)', 'نهائية (إنذار)'];
const WARNING_LEVELS_EN = ['First (Verbal)', 'Second (Written)', 'Final (Notice)'];

const checkboxStyle = {
  width: 14,
  height: 14,
  border: '1px solid #94a3b8',
  borderRadius: 2,
  display: 'inline-block',
  flexShrink: 0,
  cursor: 'default',
  userSelect: 'none',
} as const;

export default function EmployeeWarningTemplate({ employee: emp, lang = 'ar' }: Props) {
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
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Warning Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Date</div>
            <div style={valueCell}>{issueDateStrEn()}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Level</div>
            <div style={{ ...valueCell, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {WARNING_LEVELS_EN.map((lvl) => (
                <span key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={checkboxStyle} />
                  {lvl}
                </span>
              ))}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Reason</div>
            <div style={{ ...valueCell, minHeight: 48 }}>
              <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
              <span style={{ ...blankLine, width: '100%', display: 'block' }} />
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Violation Details</div>
            <div style={{ ...valueCell, minHeight: 48 }}>
              <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
              <span style={{ ...blankLine, width: '100%', display: 'block' }} />
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Corrective Action</div>
            <div style={{ ...valueCell, minHeight: 40 }}>
              <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
              <span style={{ ...blankLine, width: '100%', display: 'block' }} />
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Additional Notes</div>
            <div style={{ ...valueCell, minHeight: 36 }}>
              <span style={{ ...blankLine, width: '100%', display: 'block' }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            The above-mentioned employee has been notified of this warning and has been informed of its
            contents. The employee is required not to repeat this violation in the future, failing which
            they will be subject to the prescribed disciplinary measures.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 16, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div>
            <strong>Employee Signature (Acknowledgment):</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>Supervisor Signature:</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>Date:</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
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
        <div style={sectionHeader}>تفاصيل الإنذار</div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ الإنذار</div>
          <div style={valueCell}>{issueDateStr()}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>درجة الإنذار</div>
          <div style={{ ...valueCell, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {WARNING_LEVELS.map((lvl) => (
              <span key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: '1px solid #94a3b8',
                    borderRadius: 2,
                    display: 'inline-block',
                    flexShrink: 0,
                    cursor: 'default',
                    userSelect: 'none',
                  }}
                />
                {lvl}
              </span>
            ))}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الإنذار</div>
          <div style={{ ...valueCell, minHeight: 48 }}>
            <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
            <span style={{ ...blankLine, width: '100%', display: 'block' }} />
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تفاصيل المخالفة</div>
          <div style={{ ...valueCell, minHeight: 48 }}>
            <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
            <span style={{ ...blankLine, width: '100%', display: 'block' }} />
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الإجراء التصحيحي</div>
          <div style={{ ...valueCell, minHeight: 40 }}>
            <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} />
            <span style={{ ...blankLine, width: '100%', display: 'block' }} />
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>ملاحظات إضافية</div>
          <div style={{ ...valueCell, minHeight: 36 }}>
            <span style={{ ...blankLine, width: '100%', display: 'block' }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          أُفيد الموظف/ة المذكور/ة بهذا الإنذار، وأُحاط علماً بمضمونه، ويُلتزم
          بعدم تكرار المخالفة مستقبلاً وإلا تعرّض/تتعرّض للإجراءات التأديبية المقررة.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <div>
          <strong>توقيع الموظف (إقرار الاستلام):</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>توقيع المشرف المباشر:</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>التاريخ:</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

    </>
  );
}
