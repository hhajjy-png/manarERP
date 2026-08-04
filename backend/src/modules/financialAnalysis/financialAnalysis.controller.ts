import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { sendExcel } from '../../core/utils/excelResponse';
import { recordAudit } from '../../core/middleware/audit';
import { financialAnalysisService } from './financialAnalysis.service';
import { analysisQuerySchema, drilldownQuerySchema } from './financialAnalysis.schema';

/** معالِجات رفيعة: تحقّق من المدخل ← استدعاء الخدمة ← استجابة موحّدة. */
export const financialAnalysisController = {
  async report(req: Request, res: Response): Promise<void> {
    const query = analysisQuerySchema.parse(req.query);
    ok(res, await financialAnalysisService.build(query));
  },

  async drilldown(req: Request, res: Response): Promise<void> {
    const query = drilldownQuerySchema.parse(req.query);
    ok(res, await financialAnalysisService.drilldown(query));
  },

  /** تصدير Excel — يُسجَّل في سجل التدقيق كأي تصدير تقرير في النظام. */
  async exportExcel(req: Request, res: Response): Promise<void> {
    const query = analysisQuerySchema.parse(req.query);
    // المستخدم ولحظة التوليد يُلتقطان هنا — طبقة الطلب هي التي تعرفهما.
    const buffer = await financialAnalysisService.exportExcel(query, {
      username: req.user?.username ?? '—',
      generatedAt: new Date(),
    });
    await recordAudit({
      req,
      action: 'EXPORT',
      module: 'reports',
      entityId: 'financial-analysis',
      newValue: { format: 'excel', from: query.from, to: query.to },
    });
    sendExcel(res, buffer, 'financial-analysis.xlsx');
  },
};
