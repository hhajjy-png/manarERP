/* ════════════════════════════════════════════════════════════════════════════
   تحليل التحصيلات — طبقة التنسيق.

   **منسِّق بحت**: يحمّل مجموعة البيانات مرّة واحدة ثم يسلّمها إلى المحرّك النقيّ.
   لا استعلام Prisma هنا ولا قاعدة عمل — كلاهما في ملفّه المخصَّص.
   ════════════════════════════════════════════════════════════════════════════ */

import { buildExcelWorkbook } from '../../shared/services/reportEngine/excel.service';
import { loadCollectionDataset } from './collectionAnalysis.dataset';
import { CollectionAnalysisEngine } from './collectionAnalysis.engine';
import { buildCollectionAnalysisSheets, type CollectionExportContext } from './collectionAnalysis.excel';
import type {
  CollectionAnalysisReport,
  CollectionDrilldownResult,
  CollectionFilters,
  DrilldownScope,
} from './collectionAnalysis.types';

export class CollectionAnalysisService {
  /** التقرير الكامل بجداوله الخمسة من تحميل واحد للبيانات. */
  async build(filters: CollectionFilters): Promise<CollectionAnalysisReport> {
    const dataset = await loadCollectionDataset(filters);
    return new CollectionAnalysisEngine(dataset, filters).report();
  }

  /**
   * فواتير الخليّة المضغوط عليها مع خطّ زمن تحصيلاتها.
   *
   * يمرّ بنفس المحرّك ونفس الفلاتر، فيستحيل أن يختلف مجموع النافذة عن الرقم
   * الذي فُتحت منه.
   */
  async drilldown(filters: CollectionFilters, scope: DrilldownScope): Promise<CollectionDrilldownResult> {
    const dataset = await loadCollectionDataset(filters);
    return new CollectionAnalysisEngine(dataset, filters).drilldown(scope);
  }

  /** مصنّف Excel — من نفس التقرير المعروض حرفيًا (نفس `build`). */
  async exportExcel(filters: CollectionFilters, ctx: CollectionExportContext): Promise<Buffer> {
    const report = await this.build(filters);
    return buildExcelWorkbook(buildCollectionAnalysisSheets(report, ctx));
  }
}

export const collectionAnalysisService = new CollectionAnalysisService();
