import type { WatermarkType } from './reportTypes';

const WATERMARK_LABELS: Record<WatermarkType, string> = {
  draft:        'مسودة',
  copy:         'نسخة',
  original:     'أصل',
  cancelled:    'ملغى',
  approved:     'معتمد',
  rejected:     'مرفوض',
  confidential: 'سري',
  // تحليل الشغل والعمولة — مستند تحليل داخلي لا قيمة مستندية له. العلامة المائلة
  // القاطعة هي الضمانة البصرية بأن الورقة لا تُقرأ أبدًا كفاتورة أو مطالبة.
  // إضافة بحتة: لا مستدعي قائم يمرّر هذه القيمة، فمخرجات كل التقارير الأخرى كما هي.
  internal:     'تحليل داخلي — ليس فاتورة',
};

export function buildWatermark(type?: WatermarkType): string {
  if (!type) return '';
  return `<div class="watermark">${WATERMARK_LABELS[type]}</div>`;
}
