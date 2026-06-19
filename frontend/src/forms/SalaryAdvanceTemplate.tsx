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
  money,
  moneyEn,
  blankLine,
} from './shared/formStyles';

interface Employee {
  id: number;
  code: string;
  fullName: string;
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
  repaymentSchedule?: string;
}

interface Props {
  employee: Employee;
  latestAdvance: Advance | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
}

export default function SalaryAdvanceTemplate({ employee: emp, latestAdvance, lang = 'ar', printFields }: Props) {
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
            <div style={{ ...labelCell, textAlign: 'left' }}>Monthly Salary</div>
            <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>{moneyEn(emp.salary)}</div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Salary Advance Request Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Requested Amount</div>
            <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>
              {latestAdvance ? moneyEn(latestAdvance.amount) : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Request Date</div>
            <div style={valueCell}>
              {latestAdvance ? fmtDateEn(latestAdvance.date) : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Purpose / Reason</div>
            <div style={valueCell}>
              {latestAdvance?.notes ?? <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Repayment Schedule</div>
            <div style={{ ...valueCell, minHeight: 40 }}>
              {printFields?.repaymentSchedule?.trim() ? <span>{printFields.repaymentSchedule}</span> : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 2, textAlign: 'justify', direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            The above-mentioned employee agrees to the deduction of the advance amount from their
            monthly salary according to the agreed repayment schedule, and acknowledges receipt
            of the stated amount.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div>
            <strong>Employee Signature:</strong>
            <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>HR / Finance Approval:</strong>
            <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Request Date:</strong> {issueDateStrEn()}
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
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>{money(emp.salary)}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>تفاصيل طلب السلفة</div>
        <div style={tableRow}>
          <div style={labelCell}>المبلغ المطلوب</div>
          <div style={{ ...valueCell, fontWeight: 700, color: '#065f46' }}>
            {latestAdvance ? money(latestAdvance.amount) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ الطلب</div>
          <div style={valueCell}>
            {latestAdvance ? fmtDate(latestAdvance.date) : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الغرض / السبب</div>
          <div style={valueCell}>
            {latestAdvance?.notes ?? <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>جدول السداد</div>
          <div style={{ ...valueCell, minHeight: 40 }}>
            {printFields?.repaymentSchedule?.trim() ? <span>{printFields.repaymentSchedule}</span> : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 2, textAlign: 'justify' }}>
        <p style={{ margin: 0 }}>
          أوافق/توافق الموظف/ة المذكور/ة على خصم مبلغ السلفة من راتبه/راتبها الشهري
          وفق الجدول الزمني المتفق عليه، ويُقرّ/تُقرّ بالحصول على المبلغ المذكور.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div>
          <strong>توقيع الموظف:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>اعتماد الموارد البشرية / المالية:</strong>
          <div style={{ marginTop: 22, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الطلب:</strong> {issueDateStr()}
      </div>

    </>
  );
}
