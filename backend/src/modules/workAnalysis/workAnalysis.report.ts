import type { ReportInput } from '@shared/services/reportEngine/excel.service';
import { calcLine, calcTotals } from './workAnalysis.calc';

/**
 * يحوّل تحليلًا محفوظًا إلى `ReportInput` الخاص بمحرّك التقارير القائم
 * (`reportEngine`) — نفس المحرّك الذي تستخدمه كل تقارير النظام: خط Cairo مضمّن،
 * ترويسة الشركة، بطاقات المؤشرات، جدول، وعلامة مائية.
 *
 * لا يوجد هنا محرّك تصدير جديد ولا تنسيق يدوي: هذه الوحدة **مُحوِّل بيانات** فقط
 * (analysis → ReportInput)، ثم `buildExcel` / `buildReportHtml` يفعلان الباقي.
 *
 * الوسم الإلزامي «تحليل داخلي — ليس فاتورة» يظهر في ثلاثة مواضع مستقلة حتى لا
 * يسقط بأي إعداد طباعة: العنوان الفرعي، الملاحظات أسفل الجدول، والعلامة المائلة
 * (`watermark: 'internal'`) التي يمرّرها المسار.
 */

export const INTERNAL_ANALYSIS_NOTICE = 'تحليل داخلي — ليس فاتورة. مستند تشغيلي لا أثر محاسبي له.';

export interface WorkAnalysisReportLine {
  itemLabel: string;
  priceAgreementName: string;
  unit: string;
  quantity: number;
  customerPrice: number;
  ownerPrice: number;
}

export interface WorkAnalysisReportSource {
  id: number;
  analysisDate: Date;
  status: string;
  customerName: string;
  contractName: string | null;
  asphaltPlant: string | null;
  ownerName: string;
  notes: string | null;
  lines: WorkAnalysisReportLine[];
}

const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة',
  COMPLETED: 'مكتمل',
  ARCHIVED: 'مؤرشف',
};

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** نسبة مئوية معروضة — خانتان، و`-0` تُطبَّع إلى `0`. */
function pct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${(safe === 0 ? 0 : safe).toFixed(2)}%`;
}

export function buildWorkAnalysisReportInput(analysis: WorkAnalysisReportSource): ReportInput {
  const totals = calcTotals(analysis.lines);

  const rows = analysis.lines.map((line) => {
    const amounts = calcLine(line);
    return {
      itemLabel: line.itemLabel,
      priceAgreementName: line.priceAgreementName,
      unit: line.unit,
      quantity: line.quantity,
      customerPrice: line.customerPrice,
      ownerPrice: line.ownerPrice,
      commissionPerUnit: amounts.commissionPerUnit,
      commissionPct: pct(amounts.commissionPct),
      customerTotal: amounts.customerTotal,
      ownerTotal: amounts.ownerTotal,
      commissionTotal: amounts.commissionTotal,
    };
  });

  const subtitleParts = [
    INTERNAL_ANALYSIS_NOTICE,
    `العميل: ${analysis.customerName}`,
    `صاحب المعدة: ${analysis.ownerName}`,
    analysis.contractName ? `العقد: ${analysis.contractName}` : '',
    analysis.asphaltPlant ? `مصنع الأسفلت: ${analysis.asphaltPlant}` : '',
    `التاريخ: ${formatDateOnly(analysis.analysisDate)}`,
    `الحالة: ${STATUS_AR[analysis.status] ?? analysis.status}`,
  ].filter(Boolean);

  return {
    title: `تحليل الشغل والعمولة رقم ${analysis.id}`,
    subtitle: subtitleParts.join('  •  '),
    sheetName: 'تحليل الشغل والعمولة',
    columns: [
      { header: 'البند', key: 'itemLabel', width: 26, align: 'right' },
      { header: 'الاتفاقية', key: 'priceAgreementName', width: 26, align: 'right' },
      { header: 'الوحدة', key: 'unit', width: 10, align: 'center' },
      { header: 'الكمية', key: 'quantity', width: 12, type: 'number', align: 'center' },
      { header: 'سعر العميل', key: 'customerPrice', width: 14, type: 'currency', format: 'currency' },
      { header: 'سعر صاحب المعدة', key: 'ownerPrice', width: 16, type: 'currency', format: 'currency' },
      { header: 'عمولة الوحدة', key: 'commissionPerUnit', width: 14, type: 'currency', format: 'currency' },
      { header: 'نسبة العمولة', key: 'commissionPct', width: 12, align: 'center' },
      { header: 'إجمالي العميل', key: 'customerTotal', width: 16, type: 'currency', format: 'currency' },
      { header: 'إجمالي صاحب المعدة', key: 'ownerTotal', width: 18, type: 'currency', format: 'currency' },
      { header: 'إجمالي العمولة', key: 'commissionTotal', width: 16, type: 'currency', format: 'currency' },
    ],
    rows,
    totalsRow: {
      itemLabel: 'الإجمالي',
      quantity: totals.totalQuantity,
      customerTotal: totals.totalCustomerValue,
      ownerTotal: totals.totalOwnerCost,
      commissionTotal: totals.totalCommission,
    },
    kpis: [
      { label: 'إجمالي قيمة العميل', value: totals.totalCustomerValue, format: 'currency', color: 'blue' },
      { label: 'إجمالي تكلفة صاحب المعدة', value: totals.totalOwnerCost, format: 'currency', color: 'red' },
      { label: 'إجمالي العمولة', value: totals.totalCommission, format: 'currency', color: totals.totalCommission < 0 ? 'red' : 'green' },
      { label: 'هامش الربح', value: pct(totals.grossMarginPct), color: totals.grossMarginPct < 0 ? 'red' : 'green' },
      { label: 'متوسط العمولة للوحدة', value: totals.avgCommissionPerUnit, format: 'currency' },
      { label: 'إجمالي الكميات', value: totals.totalQuantity },
      { label: 'عدد البنود', value: totals.lineCount },
    ],
    sections: [
      {
        title: 'ملخّص الربحية',
        note: INTERNAL_ANALYSIS_NOTICE,
        sheetName: 'ملخّص الربحية',
        columns: [
          { header: 'البيان', key: 'label', width: 30, align: 'right' },
          { header: 'القيمة', key: 'value', width: 20, type: 'currency', format: 'currency' },
        ],
        rows: [
          { label: 'إجمالي إيراد العميل', value: totals.totalCustomerValue },
          { label: 'ناقص: تكلفة صاحب المعدة', value: totals.totalOwnerCost },
          { label: 'يساوي: إجمالي العمولة', value: totals.totalCommission },
        ],
      },
    ],
    // يظهر أسفل المجاميع في Excel وفي HTML معًا — الموضع الثالث للوسم الإلزامي،
    // فلا يسقط بحذف العنوان الفرعي أو تعطيل العلامة المائية.
    metaFooter: [
      INTERNAL_ANALYSIS_NOTICE,
      ...(analysis.notes ? [`ملاحظات: ${analysis.notes}`] : []),
    ],
  };
}

/** ملاحظات المستند لمسار HTML/PDF (`ReportOptions.notes`). */
export function buildWorkAnalysisNotes(analysis: Pick<WorkAnalysisReportSource, 'notes'>): string {
  return analysis.notes ? `${INTERNAL_ANALYSIS_NOTICE} — ${analysis.notes}` : INTERNAL_ANALYSIS_NOTICE;
}
