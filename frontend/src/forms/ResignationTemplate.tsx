import ApprovalSection from './shared/ApprovalSection';
import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  issueDateStr,
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

interface Props {
  employee: Employee;
}

export default function ResignationTemplate({ employee: emp }: Props) {
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
          <div style={valueCell}>
            <span style={blankLine} />
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الاستقالة</div>
          <div style={{ ...valueCell, minHeight: 60 }}>
            <span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} />
            <span style={{ ...blankLine, width: '100%', display: 'block' }} />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', lineHeight: 2, textAlign: 'justify' }}>
        <p style={{ margin: 0 }}>
          أتقدم/تتقدم بهذا الطلب للاستقالة من وظيفتي في الشركة المذكورة،
          وأتعهد بتسليم ما بعهدتي من مهام ومستندات خلال فترة الإشعار المحددة.
        </p>
      </div>

      <div style={{ marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <strong>توقيع الموظف:</strong> <span style={blankLine} />
      </div>

      <ApprovalSection />
    </>
  );
}
