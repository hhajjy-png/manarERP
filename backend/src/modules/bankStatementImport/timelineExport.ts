/* ════════════════════════════════════════════════════════════════════════════
   Timeline Export — عقد أعمدة واحد لـ Excel و CSV معًا
   --------------------------------------------------------------------------
   نتيجة تدقيق v1: زر التصدير كان يُصدِّر **الصفحة الحالية فقط** (≤50 صفًا) بينما
   المستخدم يظنّه يُصدِّر نتيجة الفلترة كاملة. هنا يُبنى التصدير من نفس خيارات
   الفلترة التي بنت الشاشة (`TimelineFilterOptions`) وبنفس الترتيب
   (`TIMELINE_ORDER_BY`) وبنفس منفذ التصنيف — فالمُصدَّر مطابق للمعروض بالبناء.

   تعريف الأعمدة واحد لكلا الصيغتين: أي عمود يُضاف يظهر في الاثنين بنفس الترتيب،
   فلا يمكن أن ينحرف CSV عن Excel.
   ════════════════════════════════════════════════════════════════════════════ */
import type { ReportColumn, ReportInput } from '@shared/services/reportEngine/excel.service.js';
import { txCategory, txDirection, type TxCategory, type TxDirection } from './timelineClassification.js';
import type { TimelineTransaction } from './types.js';
import type { TimelineTotals } from './service.js';

// ── تسميات عربية (تطابق نصوص الواجهة العربية حرفيًا) ─────────────────────────

export const DIRECTION_LABELS_AR: Record<TxDirection, string> = {
  deposit:    'إيداع',
  withdrawal: 'سحب',
  neutral:    'بدون حركة',
};

export const CATEGORY_LABELS_AR: Record<TxCategory, string> = {
  cheque:          'شيك',
  transfer:        'حوالة',
  invoice:         'فاتورة',
  expense:         'مصروف',
  payroll:         'رواتب',
  voucher:         'سند',
  receipt_voucher: 'سند قبض',
  payment_voucher: 'سند صرف',
  journal:         'قيد يومية',
  bank_fee:        'رسوم بنكية',
  interest:        'فوائد',
  adjustment:      'تسوية',
  opening_balance: 'رصيد افتتاحي',
  cash:            'نقدي',
  unclassified:    'غير مصنف',
};

const RECONCILE_LABELS_AR: Record<string, string> = {
  MATCHED:   'مطابَقة',
  UNMATCHED: 'غير مطابَقة',
  REVIEW:    'قيد المراجعة',
  IGNORED:   'مُتجاهَلة',
  DUPLICATE: 'مكرّرة',
  PENDING:   'معلّقة',
};

// ── عقد الأعمدة الموحّد ───────────────────────────────────────────────────────

export const TIMELINE_EXPORT_COLUMNS: ReportColumn[] = [
  { header: 'التاريخ',        key: 'statementDate', width: 14, type: 'text',     align: 'center' },
  { header: 'النوع',          key: 'direction',     width: 12, type: 'text',     align: 'center' },
  { header: 'التصنيف',        key: 'category',      width: 16, type: 'text',     align: 'center' },
  { header: 'الوصف',          key: 'description',   width: 52, type: 'text',     align: 'right'  },
  { header: 'المرجع',         key: 'reference',     width: 18, type: 'text',     align: 'right'  },
  { header: 'رقم الشيك',      key: 'chequeNumber',  width: 14, type: 'text',     align: 'center' },
  { header: 'مدين',           key: 'debit',         width: 16, type: 'currency', align: 'left', format: 'currency' },
  { header: 'دائن',           key: 'credit',        width: 16, type: 'currency', align: 'left', format: 'currency' },
  { header: 'صافي الحركة',    key: 'net',           width: 16, type: 'currency', align: 'left', format: 'currency' },
  { header: 'الرصيد بعد العملية', key: 'balance',   width: 18, type: 'currency', align: 'left', format: 'currency' },
  { header: 'العملة',         key: 'currency',      width: 10, type: 'text',     align: 'center' },
  { header: 'حالة المطابقة',  key: 'reconcile',     width: 16, type: 'text',     align: 'center' },
  { header: 'تكرار محتمل',    key: 'duplicate',     width: 12, type: 'text',     align: 'center' },
  { header: 'الدفعة',         key: 'batch',         width: 14, type: 'text',     align: 'center' },
];

/** صف تصدير واحد — نفس القيم التي يراها المستخدم في الجدول، بلا إعادة اشتقاق. */
export function toExportRow(t: TimelineTransaction): Record<string, unknown> {
  return {
    statementDate: t.statementDate ?? '',
    direction:     DIRECTION_LABELS_AR[txDirection(t)],
    category:      CATEGORY_LABELS_AR[txCategory(t)],
    description:   t.description,
    reference:     t.reference ?? '',
    chequeNumber:  t.chequeNumber ?? '',
    debit:         t.debit,
    credit:        t.credit,
    net:           Math.round((t.credit - t.debit) * 1000) / 1000,
    balance:       t.balance ?? '',
    currency:      t.currency,
    reconcile:     RECONCILE_LABELS_AR[t.reconcileStatus] ?? t.reconcileStatus,
    duplicate:     t.isDuplicate ? 'نعم' : '',
    batch:         t.importBatchLabel,
  };
}

export interface ExportContext {
  accountKey:  string;
  bankName?:   string | null;
  /** وصف الفلاتر المطبَّقة بلغة المستخدم — يُبنى في المتحكّم. */
  filterSummary: string[];
  /** تغطية الحساب كاملة (مستقلة عن الفلاتر). */
  coverageFrom: string | null;
  coverageTo:   string | null;
  /** لحظة التصدير — تُمرَّر من الخارج ليبقى البنّاء نقيًّا وقابلًا للاختبار. */
  exportedAt:   Date;
  exportedBy?:  string | null;
  truncated?:   boolean;
}

function fmtDateTime(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * يبني مُدخل محرك التقارير: العنوان، الفترة، لحظة التصدير، الفلاتر، الأعمدة،
 * الصفوف، صف المجاميع، وتذييل تدقيقي. المحرك نفسه يتكفّل بـ RTL وتجميد الرأس
 * والفلترة التلقائية وتنسيق الدينار بثلاث منازل.
 */
export function buildTimelineReportInput(
  rows: TimelineTransaction[],
  totals: TimelineTotals,
  ctx: ExportContext,
): ReportInput {
  const period = totals.filteredFromDate && totals.filteredToDate
    ? `${totals.filteredFromDate} — ${totals.filteredToDate}`
    : 'كل الفترات';

  const metaFooter: string[] = [
    `نطاق التصدير: جميع النتائج بعد تطبيق الفلاتر (${rows.length.toLocaleString('en-US')} حركة)`,
    `الفلاتر المطبَّقة: ${ctx.filterSummary.length ? ctx.filterSummary.join(' · ') : 'بلا فلاتر'}`,
    `صافي الحركة: ${totals.netMovement.toFixed(3)} — حجم التداول: ${totals.turnover.toFixed(3)}`,
    `تغطية الحساب الكاملة: ${ctx.coverageFrom ?? '—'} — ${ctx.coverageTo ?? '—'}`,
    `تاريخ ووقت التصدير: ${fmtDateTime(ctx.exportedAt)}${ctx.exportedBy ? ` — بواسطة ${ctx.exportedBy}` : ''}`,
  ];
  if (totals.currencies.length > 1) {
    metaFooter.push(`تنبيه: النتائج تحتوي أكثر من عملة (${totals.currencies.join('، ')}) — الإجماليات مختلطة.`);
  }
  if (totals.duplicateCount > 0) {
    metaFooter.push(`تنبيه: ${totals.duplicateCount} حركة معلَّمة كتكرار محتمل مضمَّنة في الإجماليات.`);
  }
  if (ctx.truncated) {
    metaFooter.push('تنبيه: بلغت النتائج الحدّ الأقصى للتصدير وتم اقتطاع الزائد.');
  }

  return {
    title:    `كشف حركات الحساب — ${ctx.bankName ?? ''} ${ctx.accountKey}`.trim(),
    subtitle: `الفترة: ${period}`,
    columns:  TIMELINE_EXPORT_COLUMNS,
    rows:     rows.map(toExportRow),
    totalsRow: {
      statementDate: 'الإجمالي',
      debit:  totals.totalDebits,
      credit: totals.totalCredits,
      net:    totals.netMovement,
    },
    sheetName: 'حركات الحساب',
    autoFilter: true,
    metaFooter,
  };
}

// ── CSV من نفس العقد ──────────────────────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV بنفس الأعمدة والترتيب والصفوف تمامًا. يبدأ بـ BOM كي تفتحه Excel بالعربية
 * صحيحةً، ويُسبَق بأسطر ترويسة تدقيقية مطابقة لتذييل ملف Excel.
 */
export function buildTimelineCsv(
  rows: TimelineTransaction[],
  totals: TimelineTotals,
  ctx: ExportContext,
): string {
  const input = buildTimelineReportInput(rows, totals, ctx);
  const lines: string[] = [];
  lines.push(csvCell(input.title));
  lines.push(csvCell(input.subtitle ?? ''));
  for (const m of input.metaFooter ?? []) lines.push(csvCell(m));
  lines.push('');
  lines.push(TIMELINE_EXPORT_COLUMNS.map((c) => csvCell(c.header)).join(','));
  for (const row of input.rows) {
    lines.push(TIMELINE_EXPORT_COLUMNS.map((c) => csvCell(row[c.key])).join(','));
  }
  if (input.totalsRow) {
    lines.push(TIMELINE_EXPORT_COLUMNS.map((c) => csvCell(input.totalsRow![c.key] ?? '')).join(','));
  }
  return `﻿${lines.join('\r\n')}`;
}
