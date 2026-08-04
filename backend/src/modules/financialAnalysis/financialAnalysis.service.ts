/* ════════════════════════════════════════════════════════════════════════════
   Financial Analysis Engine — طبقة التنسيق.

   **منسِّق بحت**: يحمّل مجموعة البيانات مرّة واحدة ثم يمرّرها إلى الطبقة النقيّة.
   لا استعلام Prisma هنا ولا قاعدة عمل — كلاهما في ملفّه المخصَّص.
   ════════════════════════════════════════════════════════════════════════════ */

import { buildExcelWorkbook } from '../../shared/services/reportEngine/excel.service';
import { computeFinancialAnalysis } from './financialAnalysis.compute';
import { loadAnalysisDataset, loadDrilldown, type DrilldownInput } from './financialAnalysis.dataset';
import { buildFinancialAnalysisSheets, type ExportContext } from './financialAnalysis.excel';
import type { FinancialAnalysisReport, DrilldownResult } from './financialAnalysis.types';
import type { AnalysisQuery } from './financialAnalysis.schema';

export class FinancialAnalysisService {
  /** التقرير الكامل بأقسامه السبعة من تحميل واحد للبيانات. */
  async build(query: AnalysisQuery): Promise<FinancialAnalysisReport> {
    const dataset = await loadAnalysisDataset(query);
    return computeFinancialAnalysis(dataset);
  }

  /** سجلات الخليّة المضغوط عليها — نفس شروط التقرير حرفيًا. */
  async drilldown(input: DrilldownInput): Promise<DrilldownResult> {
    return loadDrilldown(input);
  }

  /**
   * مصنّف Excel: ورقة «الملخص» ثم ورقة لكل جدول في الصفحة، **من نفس التقرير
   * المعروض حرفيًا** (نفس `build`) فلا يمكن أن يختلف رقم في الملف عن رقم الشاشة.
   *
   * `ctx` يحمل ما لا يعرفه التقرير (المستخدم ولحظة التوليد) — يُمرَّر من طبقة
   * الطلب فتبقى وحدة بناء الأوراق نقيّة وقابلة للاختبار بلا ساعة ولا جلسة.
   */
  async exportExcel(query: AnalysisQuery, ctx: ExportContext): Promise<Buffer> {
    const report = await this.build(query);
    return buildExcelWorkbook(buildFinancialAnalysisSheets(report, ctx));
  }
}

export const financialAnalysisService = new FinancialAnalysisService();
