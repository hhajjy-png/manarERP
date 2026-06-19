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
}

interface PerformanceReview {
  period: string;
  score: number;
  reviewer: string | null;
  comments: string | null;
  date: string;
}

interface Props {
  employee: Employee;
  latestReview: PerformanceReview | null;
  lang?: 'ar' | 'en';
}

const CRITERIA = [
  { label: 'جودة العمل', labelEn: 'Work Quality', max: 20 },
  { label: 'الالتزام والانضباط', labelEn: 'Commitment & Discipline', max: 20 },
  { label: 'العمل الجماعي', labelEn: 'Teamwork', max: 20 },
  { label: 'المبادرة والإبداع', labelEn: 'Initiative & Creativity', max: 20 },
  { label: 'الانضباط في المواعيد', labelEn: 'Punctuality', max: 20 },
];

const RATINGS = ['ممتاز (90-100)', 'جيد جدًا (75-89)', 'جيد (60-74)', 'مقبول (50-59)', 'ضعيف (أقل من 50)'];
const RATINGS_EN = ['Excellent (90-100)', 'Very Good (75-89)', 'Good (60-74)', 'Acceptable (50-59)', 'Poor (Below 50)'];

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

export default function PerformanceEvaluationTemplate({ employee: emp, latestReview, lang = 'ar' }: Props) {
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
            <div style={{ ...labelCell, textAlign: 'left' }}>Job Title</div>
            <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Department</div>
            <div style={valueCell}>{emp.department ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Review Period</div>
            <div style={valueCell}>
              {latestReview ? latestReview.period : <span style={blankLine} />}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Review Date</div>
            <div style={valueCell}>
              {latestReview ? fmtDateEn(latestReview.date) : issueDateStrEn()}
            </div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Evaluation Criteria</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', background: '#f8fafc', padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#1d4e6f', borderBottom: '1px solid #e2e8f0', direction: 'ltr' }}>
            <span>Criterion</span>
            <span style={{ textAlign: 'center', minWidth: 60 }}>Max Score</span>
            <span style={{ textAlign: 'center', minWidth: 80 }}>Score</span>
          </div>
          {CRITERIA.map((c) => (
            <div key={c.labelEn} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '9px 14px', fontSize: 13, borderBottom: '1px solid #e2e8f0', direction: 'ltr' }}>
              <span>{c.labelEn}</span>
              <span style={{ textAlign: 'center', minWidth: 60, color: '#64748b' }}>{c.max}</span>
              <span style={{ textAlign: 'center', minWidth: 80 }}>
                <span style={{ ...blankLine, width: 50 }} />
              </span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '9px 14px', fontSize: 13, fontWeight: 800, background: '#f0f3f7', direction: 'ltr', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <span>Total</span>
            <span style={{ textAlign: 'center', minWidth: 60 }}>100</span>
            <span style={{ textAlign: 'center', minWidth: 80 }}>
              {latestReview ? (
                <span style={{ color: '#065f46', fontWeight: 800 }}>{latestReview.score}</span>
              ) : (
                <span style={{ ...blankLine, width: 50 }} />
              )}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Overall Rating:</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {RATINGS_EN.map((r) => (
              <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={checkboxStyle} />
                {r}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Reviewer Comments & Recommendations:</div>
          {latestReview?.comments ? (
            <p style={{ margin: 0, lineHeight: 1.8 }}>{latestReview.comments}</p>
          ) : (
            <>
              <div style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} />
              <div style={{ ...blankLine, width: '100%', display: 'block' }} />
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Reviewer Signature{latestReview?.reviewer ? ` — ${latestReview.reviewer}` : ':'}
            </div>
            <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              {latestReview ? fmtDateEn(latestReview.date) : issueDateStrEn()}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Employee Signature (Acknowledgment):</div>
            <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Date: ___________</div>
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
        <div style={tableRow}>
          <div style={labelCell}>فترة التقييم</div>
          <div style={valueCell}>
            {latestReview ? latestReview.period : <span style={blankLine} />}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ التقييم</div>
          <div style={valueCell}>
            {latestReview ? fmtDate(latestReview.date) : issueDateStr()}
          </div>
        </div>
      </div>

      {/* Evaluation criteria table */}
      <div style={tableWrapper}>
        <div style={sectionHeader}>معايير التقييم</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            background: '#f8fafc',
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 700,
            color: '#1d4e6f',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <span>المعيار</span>
          <span style={{ textAlign: 'center', minWidth: 60 }}>الدرجة العظمى</span>
          <span style={{ textAlign: 'center', minWidth: 80 }}>الدرجة المحصّلة</span>
        </div>
        {CRITERIA.map((c) => (
          <div
            key={c.label}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              padding: '9px 14px',
              fontSize: 13,
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <span>{c.label}</span>
            <span style={{ textAlign: 'center', minWidth: 60, color: '#64748b' }}>{c.max}</span>
            <span style={{ textAlign: 'center', minWidth: 80 }}>
              <span style={{ ...blankLine, width: 50 }} />
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            padding: '9px 14px',
            fontSize: 13,
            fontWeight: 800,
            background: '#f0f3f7',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <span>المجموع</span>
          <span style={{ textAlign: 'center', minWidth: 60 }}>100</span>
          <span style={{ textAlign: 'center', minWidth: 80 }}>
            {latestReview ? (
              <span style={{ color: '#065f46', fontWeight: 800 }}>{latestReview.score}</span>
            ) : (
              <span style={{ ...blankLine, width: 50 }} />
            )}
          </span>
        </div>
      </div>

      {/* Rating level */}
      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>التقدير العام:</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {RATINGS.map((r) => (
            <span key={r} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              {r}
            </span>
          ))}
        </div>
      </div>

      {/* Comments */}
      <div style={{ marginBottom: 14, fontSize: 13, color: '#374151' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>ملاحظات المقيِّم والتوصيات:</div>
        {latestReview?.comments ? (
          <p style={{ margin: 0, lineHeight: 1.8 }}>{latestReview.comments}</p>
        ) : (
          <>
            <div style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 8 }} />
            <div style={{ ...blankLine, width: '100%', display: 'block' }} />
          </>
        )}
      </div>

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 8, fontSize: 13, color: '#374151' }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            توقيع المقيِّم
            {latestReview?.reviewer ? ` — ${latestReview.reviewer}` : ':'}
          </div>
          <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            {latestReview ? fmtDate(latestReview.date) : issueDateStr()}
          </div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>توقيع الموظف (اطلاع وقبول):</div>
          <div style={{ marginTop: 20, borderBottom: '1px solid #64748b', width: '100%' }} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>التاريخ: ___________</div>
        </div>
      </div>

    </>
  );
}
