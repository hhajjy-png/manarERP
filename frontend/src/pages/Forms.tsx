import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';

interface EmployeeOption {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  status: string;
}

export default function Forms() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api
      .get('/employees', { params: { pageSize: 500, status: 'ACTIVE' } })
      .then((res) => {
        const rows: EmployeeOption[] = res.data.data?.data ?? res.data.data ?? [];
        setEmployees(rows);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  function handlePrint() {
    if (!selectedId) return;
    navigate(`/forms/salary-certificate/${selectedId}`);
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {/* شهادة الراتب */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#e8f4f8',
                display: 'grid',
                placeItems: 'center',
                fontSize: 22,
              }}
            >
              📋
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>شهادة راتب</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                شهادة رسمية براتب الموظف الشهري
              </p>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}
            >
              اختر الموظف *
            </label>
            <select
              className="form-input"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
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

          <button
            className="btn"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handlePrint}
            disabled={!selectedId}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span>
            طباعة الشهادة
          </button>
        </div>
      </div>
    </div>
  );
}
