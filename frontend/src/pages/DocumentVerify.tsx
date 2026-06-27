import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

interface VerificationResult {
  found: boolean;
  documentType?: string;
  documentNumber?: string;
  status?: string;
  statusAr?: string;
  issueDate?: string;
  updatedAt?: string;
  isCancelled?: boolean;
  isApproved?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-KW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const STATUS_COLOR: Record<string, string> = {
  PAID: '#16a34a',
  PARTIAL: '#d97706',
  UNPAID: '#dc2626',
  DRAFT: '#64748b',
  CANCELLED: '#dc2626',
};

export default function DocumentVerify() {
  const { uuid } = useParams<{ uuid: string }>();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uuid) { setLoading(false); return; }
    axios
      .get(`http://127.0.0.1:48211/api/verify/${uuid}`)
      .then((res) => setResult(res.data.data ?? res.data))
      .catch(() => setError('تعذّر الاتصال بالخادم. تأكد من تشغيل التطبيق.'))
      .finally(() => setLoading(false));
  }, [uuid]);

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: '"Cairo", Arial, sans-serif',
      }}
    >
      {/* Company header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, marginBottom: 4 }}>
          شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4e6f', letterSpacing: 0.5 }}>
          بوابة التحقق من الوثائق
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, direction: 'ltr' }}>
          Document Verification Portal
        </div>
      </div>

      {/* Verification card */}
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: 36,
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div>جارٍ التحقق من الوثيقة…</div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={{ color: '#dc2626', fontWeight: 600, marginBottom: 8 }}>خطأ في الاتصال</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{error}</div>
          </div>
        )}

        {!loading && !error && result && !result.found && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              وثيقة غير موجودة
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7 }}>
              لم يتم العثور على وثيقة بهذا الرمز.<br />
              تأكد من صحة رمز التحقق أو تواصل مع الشركة.
            </div>
          </div>
        )}

        {!loading && !error && result?.found && (
          <div>
            {/* Verification status banner */}
            <div
              style={{
                textAlign: 'center',
                padding: '16px 24px',
                borderRadius: 10,
                background: result.isCancelled ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${result.isCancelled ? '#fecaca' : '#bbf7d0'}`,
                marginBottom: 28,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>
                {result.isCancelled ? '🚫' : '✅'}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: result.isCancelled ? '#dc2626' : '#16a34a',
                }}
              >
                {result.isCancelled ? 'وثيقة ملغاة' : 'وثيقة أصلية موثّقة'}
              </div>
            </div>

            {/* Document details */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#64748b', width: '40%' }}>نوع الوثيقة</td>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: '#1e293b' }}>
                    {result.documentType === 'invoice' ? 'فاتورة' : result.documentType}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#64748b' }}>رقم الوثيقة</td>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: '#1e293b', direction: 'ltr', textAlign: 'right' }}>
                    {result.documentNumber}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#64748b' }}>الحالة</td>
                  <td style={{ padding: '10px 0' }}>
                    <span
                      style={{
                        padding: '2px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        background: `${STATUS_COLOR[result.status ?? ''] ?? '#64748b'}18`,
                        color: STATUS_COLOR[result.status ?? ''] ?? '#64748b',
                      }}
                    >
                      {result.statusAr ?? result.status}
                    </span>
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 0', color: '#64748b' }}>تاريخ الإصدار</td>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: '#1e293b' }}>
                    {result.issueDate ? formatDate(result.issueDate) : '—'}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '10px 0', color: '#64748b' }}>آخر تحديث</td>
                  <td style={{ padding: '10px 0', color: '#64748b', fontSize: 12 }}>
                    {result.updatedAt ? formatDate(result.updatedAt) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              style={{
                marginTop: 24,
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                fontSize: 11,
                color: '#94a3b8',
                lineHeight: 1.6,
                direction: 'ltr',
                textAlign: 'left',
              }}
            >
              UUID: {uuid}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: '#94a3b8' }}>
        نظام المنار لإدارة الأعمال • للاستفسار: تواصل مع الشركة مباشرةً
      </div>
    </div>
  );
}
