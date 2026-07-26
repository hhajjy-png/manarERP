import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QRData {
  formType: string;
  formNumber: string;
  entityName: string;
  entityId?: number;
}

/**
 * عنوان عربي لكل formType — منقول حرفيًا من نص العنوان المعتمد أصلًا لنفس النموذج
 * (frontend/src/lib/i18n.ts، مفاتيح page.*.title/voucher.receipt.title، ونص
 * printProfiles.ts's labelAr لسند الصرف). لا نص جديد يُخترع هنا؛ هذا تنسيق عرض فقط
 * لقيمة formType الحالية نفسها — انظر تقرير Forms QR Human-Readable Formatting Fix v1.
 * إن ظهر formType غير مُدرَج هنا (نموذج مستقبلي)، يُعرض كما وصل بلا كسر.
 */
const FORM_TYPE_LABEL_AR: Record<string, string> = {
  'salary-certificate': 'شهادة راتب',
  'to-whom-it-may-concern': 'إلى من يهمه الأمر',
  'leave-request': 'طلب إجازة',
  'return-to-work': 'إشعار العودة إلى العمل',
  'salary-advance': 'طلب سلفة راتب',
  'resignation': 'طلب استقالة',
  'employee-warning': 'إنذار موظف',
  'performance-evaluation': 'تقييم أداء الموظف',
  'employment-contract': 'عقد عمل',
  'quotation': 'عرض سعر',
  'purchase-request': 'طلب شراء',
  'receipt-voucher': 'سند قبض',
  'payment-voucher': 'سند صرف',
};

/**
 * يُنسّق نفس حقول QRData الأربعة (بلا إضافة أو حذف أي حقل) كنص عربي مقروء
 * بدل JSON خام — إصلاح لمشكلة ظهور `{"formType":"...",...}` حرفيًا عند مسح
 * الرمز بكاميرا الهاتف. البيانات المُعتمدة نفسها؛ التنسيق فقط تغيّر.
 */
function formatQrText(data: QRData): string {
  const lines = [
    FORM_TYPE_LABEL_AR[data.formType] ?? data.formType,
    `رقم المستند: ${data.formNumber}`,
    `الاسم: ${data.entityName}`,
  ];
  if (data.entityId !== undefined) {
    lines.push(`الرقم المرجعي: ${data.entityId}`);
  }
  return lines.join('\n');
}

export default function FormQRCode({ data, size = 80 }: { data: QRData; size?: number }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    QRCode.toDataURL(formatQrText(data), {
      width: size * 2,
      margin: 1,
      color: { dark: '#1d4e6f', light: '#ffffff' },
    })
      .then(setSrc)
      .catch(() => {});
  }, [data, size]);

  if (!src) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <img src={src} alt="QR Code" style={{ width: size, height: size }} />
      <span style={{ fontSize: 9, color: '#94a3b8', direction: 'ltr' }}>{data.formNumber}</span>
    </div>
  );
}
