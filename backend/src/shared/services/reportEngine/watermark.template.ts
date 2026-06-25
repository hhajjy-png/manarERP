import type { WatermarkType } from './reportTypes';

const WATERMARK_LABELS: Record<WatermarkType, string> = {
  draft:        'مسودة',
  copy:         'نسخة',
  original:     'أصل',
  cancelled:    'ملغى',
  approved:     'معتمد',
  rejected:     'مرفوض',
  confidential: 'سري',
};

export function buildWatermark(type?: WatermarkType): string {
  if (!type) return '';
  return `<div class="watermark">${WATERMARK_LABELS[type]}</div>`;
}
