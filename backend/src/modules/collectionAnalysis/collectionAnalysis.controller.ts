import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { sendExcel } from '../../core/utils/excelResponse';
import { recordAudit } from '../../core/middleware/audit';
import { collectionAnalysisService } from './collectionAnalysis.service';
import { collectionDrilldownSchema, collectionFiltersSchema } from './collectionAnalysis.schema';
import type { CollectionFilters, DrilldownScope } from './collectionAnalysis.types';

/** معالِجات رفيعة: تحقّق من المدخل ← استدعاء الخدمة ← استجابة موحّدة. */
export const collectionAnalysisController = {
  async report(req: Request, res: Response): Promise<void> {
    const filters = collectionFiltersSchema.parse(req.query);
    ok(res, await collectionAnalysisService.build(filters));
  },

  async drilldown(req: Request, res: Response): Promise<void> {
    const query = collectionDrilldownSchema.parse(req.query);
    // الحصر (الخليّة المضغوط عليها) يُفصل عن الفلاتر: المحرّك يطبّق الأولى فوق
    // الثانية، فتبقى نتيجة النافذة داخل نفس تصفية الصفحة دائمًا.
    const { scopeInvoiceYear, scopeCollectionYear, dimension, dimensionId, ...filters } = query;
    const scope: DrilldownScope = { scopeInvoiceYear, scopeCollectionYear, dimension, dimensionId };
    ok(res, await collectionAnalysisService.drilldown(filters as CollectionFilters, scope));
  },

  /** تصدير Excel — يُسجَّل في سجل التدقيق كأي تصدير تقرير في النظام. */
  async exportExcel(req: Request, res: Response): Promise<void> {
    const filters = collectionFiltersSchema.parse(req.query);
    const buffer = await collectionAnalysisService.exportExcel(filters, {
      username: req.user?.username ?? '—',
      generatedAt: new Date(),
    });
    await recordAudit({
      req,
      action: 'EXPORT',
      module: 'reports',
      entityId: 'collection-analysis',
      newValue: {
        format: 'excel',
        invoiceFrom: filters.invoiceFrom,
        invoiceTo: filters.invoiceTo,
        collectionFrom: filters.collectionFrom,
        collectionTo: filters.collectionTo,
      },
    });
    sendExcel(res, buffer, 'collection-analysis.xlsx');
  },
};
