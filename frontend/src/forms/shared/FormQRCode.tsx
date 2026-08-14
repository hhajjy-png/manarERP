import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QRData {
  formType: string;
  formNumber: string;
  entityName: string;
  entityId?: number;
  /**
   * Barcode Content Settings v1 — operator-authored fields, additive and optional.
   *
   * Absent on all twelve existing forms, whose encoded text is therefore byte-identical
   * to what it was. Present only where the operator can type them (Blank A4), and even
   * there an empty string is skipped rather than emitted as a dangling label.
   */
  subject?: string;
  details?: string;
  /**
   * **محتوى الرمز حرفيًا** — حين يُمرَّر، هذه الأسطر هي كل ما يُرمَّز: لا نوع مستند،
   * ولا رقم مستند، ولا رقم مرجعي، ولا موضوع، ولا بيانات إضافية.
   *
   * أُضيف لكشف مستحقات الموظف الشهرية وحده، الذي يقصر محتوى رمزه على ثلاثة عناصر
   * (الاسم · صافي المستحق · الفترة). غائب عن كل نموذج آخر، فنصّها المُرمَّز يخرج
   * مطابقًا حرفًا بحرف لما كان — الحقول أدناه لا تُقرأ أصلًا حين يوجد هذا الحقل.
   *
   * لا يمسّ السطر النصّي أسفل الرمز: ذاك يبقى `formNumber` كما هو في كل النماذج.
   */
  payloadLines?: string[];
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
  'blank-a4-print': 'ورقة A4 — طباعة حرة',
};

/**
 * يُنسّق حقول QRData كنص عربي مقروء بدل JSON خام — إصلاح لمشكلة ظهور
 * `{"formType":"...",...}` حرفيًا عند مسح الرمز بكاميرا الهاتف.
 *
 * تحديث (Barcode Content Settings v1): الحقلان `subject` و`details` أُضيفا **بعد**
 * الأسطر القائمة ولا يظهران إلا إذا كُتبا، والأسطر القائمة صارت تُتخطّى إن كانت
 * قيمتها فارغة بدل طبع عنوان بلا قيمة. النماذج الاثنا عشر القائمة تمرّر دائمًا
 * `formNumber` و`entityName` غير فارغين ولا تعرف الحقلين الجديدين، فنصّها المُرمَّز
 * يخرج مطابقًا حرفًا بحرف لما كان — هذا هو ضمان عدم الارتداد، لا مجرّد ترتيب.
 */
export function formatQrText(data: QRData): string {
  // محتوى صريح ⇒ هو المحتوى كاملًا. الخروج هنا قبل بناء الأسطر الافتراضية هو ما
  // يضمن ألّا يتسرّب حقل قائم — أو حقل يُضاف مستقبلًا — إلى رمزٍ حُدِّد محتواه.
  if (data.payloadLines) return data.payloadLines.join('\n');

  const lines = [FORM_TYPE_LABEL_AR[data.formType] ?? data.formType];
  if (data.formNumber.trim()) lines.push(`رقم المستند: ${data.formNumber.trim()}`);
  if (data.entityName.trim()) lines.push(`الاسم: ${data.entityName.trim()}`);
  if (data.entityId !== undefined) lines.push(`الرقم المرجعي: ${data.entityId}`);
  if (data.subject?.trim()) lines.push(`الموضوع: ${data.subject.trim()}`);
  // البيانات الإضافية نصّ حرّ متعدّد الأسطر — يُوضع تحت عنوانه كما كتبه المستخدم،
  // بلا إعادة تنسيق، فما يقرأه الماسح هو ما كُتب في النافذة تمامًا.
  if (data.details?.trim()) lines.push('البيانات:', data.details.trim());
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
      {/* بلا رقم ⇒ بلا سطر أصلًا (لا فراغ محجوز ولا رقم مُولَّد). النماذج القائمة
          تمرّر رقمًا دائمًا، فالسطر يظهر لها كما كان. */}
      {data.formNumber.trim() && (
        <span style={{ fontSize: 9, color: '#94a3b8', direction: 'ltr' }}>{data.formNumber.trim()}</span>
      )}
    </div>
  );
}
