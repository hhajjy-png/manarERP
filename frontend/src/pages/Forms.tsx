import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { PrintMode, PRINT_MODE_LABELS } from '../forms/shared/printMode';

interface EmployeeOption {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
}

interface FormCard {
  key: string;
  route: string;
  titleAr: string;
  titleEn: string;
  description: string;
  icon: string;
}

const FORM_CARDS: FormCard[] = [
  {
    key: 'salary-certificate',
    route: 'salary-certificate',
    titleAr: 'شهادة راتب',
    titleEn: 'Salary Certificate',
    description: 'شهادة رسمية تُثبت راتب الموظف الشهري للجهات الطالبة.',
    icon: '📋',
  },
  {
    key: 'to-whom-it-may-concern',
    route: 'to-whom-it-may-concern',
    titleAr: 'إلى من يهمه الأمر',
    titleEn: 'To Whom It May Concern',
    description: 'شهادة عمل عامة لتقديمها للجهات الخارجية.',
    icon: '📄',
  },
  {
    key: 'leave-request',
    route: 'leave-request',
    titleAr: 'طلب إجازة',
    titleEn: 'Leave Request',
    description: 'نموذج طلب إجازة سنوية أو مرضية أو طارئة.',
    icon: '🗓️',
  },
  {
    key: 'return-to-work',
    route: 'return-to-work',
    titleAr: 'إشعار العودة إلى العمل',
    titleEn: 'Return To Work Notice',
    description: 'إشعار رسمي بعودة الموظف من الإجازة.',
    icon: '↩️',
  },
  {
    key: 'salary-advance',
    route: 'salary-advance',
    titleAr: 'طلب سلفة راتب',
    titleEn: 'Salary Advance Request',
    description: 'نموذج طلب سلفة مالية يُخصم من الراتب الشهري.',
    icon: '💰',
  },
  {
    key: 'resignation',
    route: 'resignation',
    titleAr: 'طلب استقالة',
    titleEn: 'Resignation Request',
    description: 'نموذج استقالة رسمي مع تحديد آخر يوم عمل.',
    icon: '✉️',
  },
  {
    key: 'employee-warning',
    route: 'employee-warning',
    titleAr: 'إنذار موظف',
    titleEn: 'Employee Warning Notice',
    description: 'نموذج إنذار رسمي للموظف يُحدد درجة المخالفة وسببها.',
    icon: '⚠️',
  },
  {
    key: 'performance-evaluation',
    route: 'performance-evaluation',
    titleAr: 'تقييم أداء الموظف',
    titleEn: 'Employee Performance Evaluation',
    description: 'نموذج تقييم الأداء السنوي بمعايير موضوعية.',
    icon: '⭐',
  },
  {
    key: 'employment-contract',
    route: 'employment-contract',
    titleAr: 'عقد العمل',
    titleEn: 'Employment Contract',
    description: 'نموذج عقد العمل الرسمي الصادر عن الهيئة العامة للقوى العاملة، ثنائي اللغة (عربي / إنجليزي).',
    icon: '📝',
  },
];

const sel: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontWeight: 600,
  fontSize: 13,
  width: '100%',
};

export default function Forms() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [printModes, setPrintModes] = useState<Record<string, PrintMode>>(() =>
    Object.fromEntries(FORM_CARDS.map((c) => [c.key, 'full-template' as PrintMode])),
  );

  useEffect(() => {
    api
      .get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => setEmployees(res.data.data?.data ?? res.data.data ?? []))
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  function setMode(key: string, mode: PrintMode) {
    setPrintModes((prev) => ({ ...prev, [key]: mode }));
  }

  function handlePrint(card: FormCard) {
    if (!selectedId) return;
    navigate(`/forms/${card.route}/${selectedId}?printMode=${printModes[card.key]}`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>النماذج الإدارية</h2>
          <p>طباعة النماذج والشهادات الرسمية للموظفين</p>
        </div>
      </div>

      {loadError && (
        <div className="alert error" style={{ marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      {/* Employee selector — shared across all cards */}
      <div
        className="card"
        style={{ padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}
      >
        <span className="material-symbols-outlined" style={{ color: 'var(--text-muted)', fontSize: 22 }}>
          person
        </span>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>
            اختر الموظف (مشترك لجميع النماذج) *
          </label>
          <select title="اختر الموظف" style={sel} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— اختر موظفًا —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName}
                {emp.jobTitle ? ` — ${emp.jobTitle}` : ''}
                {' '}({emp.code})
              </option>
            ))}
          </select>
        </div>
        {!selectedId && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            يجب اختيار موظف أولاً
          </span>
        )}
      </div>

      {/* 8 form cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        {FORM_CARDS.map((card) => (
          <div key={card.key} className="card" style={{ padding: 22 }}>
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}
              >
                {card.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{card.titleAr}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{card.titleEn}</div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
              {card.description}
            </p>

            {/* Print mode selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--text-muted)' }}>
                وضع الطباعة
              </label>
              <select
                title="وضع الطباعة"
                style={{ ...sel, fontSize: 12 }}
                value={printModes[card.key]}
                onChange={(e) => setMode(card.key, e.target.value as PrintMode)}
              >
                {(Object.entries(PRINT_MODE_LABELS) as [PrintMode, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Print button */}
            <button
              type="button"
              className="btn"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              onClick={() => handlePrint(card)}
              disabled={!selectedId}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span>
              طباعة
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
