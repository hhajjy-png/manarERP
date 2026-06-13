import { CSSProperties, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';

// ── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn: string | null;
  civilId: string | null;
  jobTitle: string | null;
  department: string | null;
  salary: number;
  hireDate: string | null;
  nationality: string | null;
  status: string;
}

interface LatestPayroll {
  month: number;
  year: number;
  netSalary: number;
  snapshotBaseSalary: number;
  status: string;
}

interface CertificateData {
  employee: Employee;
  latestPayroll: LatestPayroll | null;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

const row: CSSProperties = {
  display: 'flex',
  gap: 0,
  borderBottom: '1px solid #e2e8f0',
};
const cell: CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  lineHeight: 1.6,
};
const labelCell: CSSProperties = {
  ...cell,
  width: 180,
  fontWeight: 700,
  color: '#1d4e6f',
  background: '#f8fafc',
  borderInlineEnd: '1px solid #e2e8f0',
  flexShrink: 0,
};
const valueCell: CSSProperties = {
  ...cell,
  flex: 1,
  color: '#0f172a',
};

function money(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' د.ك';
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });
}

function issueDateStr(): string {
  return new Date().toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalaryCertificate() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CertificateData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/salary-certificate/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (error)
    return (
      <div className="center-msg">
        تعذّر تحميل بيانات الشهادة: {error}
      </div>
    );
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ تجهيز شهادة الراتب…
      </div>
    );

  const { employee: emp, latestPayroll } = data;
  const baseSalary = latestPayroll?.snapshotBaseSalary ?? emp.salary;

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
        maxWidth: 820,
        margin: '0 auto',
        color: '#0f172a',
        background: '#fff',
        minHeight: '100vh',
        direction: 'rtl',
      }}
    >
      {/* No-print toolbar */}
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button className="btn" onClick={() => window.print()}>
          🖨️ طباعة / حفظ PDF
        </button>
        <button className="btn secondary" onClick={() => navigate(-1)}>
          رجوع
        </button>
      </div>

      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 28, borderBottom: '3px solid #1d4e6f', paddingBottom: 18 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: '#1d4e6f',
            color: '#fff',
            display: 'inline-grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 26,
            marginBottom: 10,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          م
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
          {COMPANY_NAME}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
          دولة الكويت
        </div>
      </div>

      {/* ── Title ── */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#1d4e6f',
            margin: '0 0 6px',
            letterSpacing: 1,
          }}
        >
          شـهـادة راتـب
        </h1>
        <div
          style={{
            width: 60,
            height: 3,
            background: '#1d4e6f',
            margin: '0 auto',
            borderRadius: 2,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        />
      </div>

      {/* ── Opening statement ── */}
      <p style={{ fontSize: 14, lineHeight: 2, marginBottom: 22, textAlign: 'justify' }}>
        تشهد <strong>{COMPANY_NAME}</strong> بأن الموظف/ة المذكور/ة أدناه
        يعمل/تعمل لدينا، وذلك على النحو التالي:
      </p>

      {/* ── Employee details table ── */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 24,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div style={{ ...row, background: '#1d4e6f', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div style={{ ...cell, color: '#fff', fontWeight: 800, fontSize: 13 }}>بيانات الموظف</div>
        </div>

        <div style={row}>
          <div style={labelCell}>الاسم (عربي)</div>
          <div style={{ ...valueCell, fontWeight: 700, fontSize: 15 }}>{emp.fullName}</div>
        </div>

        {emp.fullNameEn && (
          <div style={row}>
            <div style={labelCell}>الاسم (إنجليزي)</div>
            <div style={{ ...valueCell, direction: 'ltr', textAlign: 'left' }}>{emp.fullNameEn}</div>
          </div>
        )}

        <div style={row}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace', fontWeight: 600 }}>{emp.code}</div>
        </div>

        <div style={row}>
          <div style={labelCell}>الرقم المدني</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.civilId ?? '—'}</div>
        </div>

        <div style={row}>
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
        </div>

        <div style={row}>
          <div style={labelCell}>القسم / الإدارة</div>
          <div style={valueCell}>{emp.department ?? '—'}</div>
        </div>

        <div style={row}>
          <div style={labelCell}>الجنسية</div>
          <div style={valueCell}>{emp.nationality ?? '—'}</div>
        </div>

        <div style={row}>
          <div style={labelCell}>تاريخ التعيين</div>
          <div style={valueCell}>{fmtDate(emp.hireDate)}</div>
        </div>
      </div>

      {/* ── Salary details table ── */}
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 24,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        <div style={{ ...row, background: '#1d4e6f', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
          <div style={{ ...cell, color: '#fff', fontWeight: 800, fontSize: 13 }}>بيانات الراتب</div>
        </div>

        <div style={row}>
          <div style={labelCell}>الراتب الشهري</div>
          <div style={{ ...valueCell, fontWeight: 700, fontSize: 15, color: '#065f46' }}>
            {money(baseSalary)}
          </div>
        </div>

        {latestPayroll && (
          <div style={row}>
            <div style={labelCell}>آخر راتب صافٍ مستحق</div>
            <div style={{ ...valueCell, fontWeight: 600 }}>
              {money(latestPayroll.netSalary)}
              <span style={{ fontSize: 11, color: '#64748b', marginRight: 8 }}>
                ({latestPayroll.month}/{latestPayroll.year})
              </span>
            </div>
          </div>
        )}

        <div style={row}>
          <div style={labelCell}>العملة</div>
          <div style={valueCell}>دينار كويتي (KWD)</div>
        </div>
      </div>

      {/* ── Closing statement ── */}
      <p style={{ fontSize: 13, lineHeight: 2, marginBottom: 28, textAlign: 'justify', color: '#374151' }}>
        وقد أُعطيت هذه الشهادة بناءً على طلب الموظف/ة للاستخدام الرسمي فيما يُقدّمها إليه/إليها،
        دون أي مسؤولية على الشركة تجاه الجهة المقدَّمة إليها.
      </p>

      {/* ── Issue date ── */}
      <div style={{ marginBottom: 40, fontSize: 13, color: '#374151' }}>
        <strong>تاريخ الإصدار:</strong> {issueDateStr()}
      </div>

      {/* ── Signature block ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
          marginTop: 20,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              height: 70,
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 8,
              color: '#94a3b8',
              fontSize: 11,
            }}
          >
            التوقيع
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4e6f' }}>المفوّض بالتوقيع</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{COMPANY_NAME}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              height: 70,
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontSize: 11,
            }}
          >
            ختم الشركة
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4e6f' }}>الختم الرسمي</div>
        </div>
      </div>
    </div>
  );
}
