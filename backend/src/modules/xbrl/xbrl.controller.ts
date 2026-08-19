/**
 * متحكّمات جاهزية XBRL — طبقة رقيقة: تقرأ الطلب، تنادي الخدمة، تُعيد الاستجابة.
 * لا منطق نطاق هنا ولا استعلام Prisma واحد.
 */
import { Request, Response } from 'express';
import { created, noContent, ok } from '../../core/utils/response';
import { resolveExporter } from './export/exporter';
import { conceptService } from './services/concept.service';
import { reportingContextService } from './services/context.service';
import { accountMappingService } from './services/mapping.service';
import { readinessService, type ReadinessQuery } from './services/readiness.service';
import { snapshotService } from './services/snapshot.service';
import { statementMappingService } from './services/statementMapping.service';
import { taxonomyService } from './services/taxonomy.service';

const id = (req: Request) => Number(req.params.id);

/** يقرأ معايير الجاهزية من الاستعلام أو الجسم بشكل موحّد. */
function readinessQuery(source: Record<string, unknown>): ReadinessQuery {
  return {
    taxonomyId: source.taxonomyId ? Number(source.taxonomyId) : undefined,
    contextId: source.contextId ? Number(source.contextId) : undefined,
    fiscalYear: source.fiscalYear ? Number(source.fiscalYear) : undefined,
    asOfDate: typeof source.asOfDate === 'string' ? source.asOfDate : undefined,
  };
}

export const taxonomyController = {
  async list(req: Request, res: Response) {
    ok(res, await taxonomyService.list(req.query as { status?: string; jurisdiction?: string }));
  },
  async getById(req: Request, res: Response) {
    ok(res, await taxonomyService.getById(id(req)));
  },
  async create(req: Request, res: Response) {
    created(res, await taxonomyService.create(req, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await taxonomyService.update(req, id(req), req.body));
  },
  async setStatus(req: Request, res: Response) {
    ok(res, await taxonomyService.setStatus(req, id(req), req.body.status));
  },
  async remove(req: Request, res: Response) {
    await taxonomyService.remove(req, id(req));
    noContent(res, 'تم حذف التصنيف');
  },
};

export const conceptController = {
  async list(req: Request, res: Response) {
    const { taxonomyId, statementType, search } = req.query as Record<string, string>;
    ok(res, await conceptService.list({
      taxonomyId: taxonomyId ? Number(taxonomyId) : undefined,
      statementType,
      search,
    }));
  },
  async getById(req: Request, res: Response) {
    ok(res, await conceptService.getById(id(req)));
  },
  async create(req: Request, res: Response) {
    created(res, await conceptService.create(req, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await conceptService.update(req, id(req), req.body));
  },
  async remove(req: Request, res: Response) {
    await conceptService.remove(req, id(req));
    noContent(res, 'تم حذف المفهوم');
  },
};

export const accountMappingController = {
  async list(req: Request, res: Response) {
    const { taxonomyId, accountId, conceptId, status } = req.query as Record<string, string>;
    ok(res, await accountMappingService.list({
      taxonomyId: taxonomyId ? Number(taxonomyId) : undefined,
      accountId: accountId ? Number(accountId) : undefined,
      conceptId: conceptId ? Number(conceptId) : undefined,
      status,
    }));
  },
  async create(req: Request, res: Response) {
    created(res, await accountMappingService.create(req, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await accountMappingService.update(req, id(req), req.body));
  },
  async remove(req: Request, res: Response) {
    await accountMappingService.remove(req, id(req));
    noContent(res, 'تم حذف الربط');
  },
};

export const statementMappingController = {
  async list(req: Request, res: Response) {
    const { taxonomyId, statementType } = req.query as Record<string, string>;
    ok(res, await statementMappingService.list({
      taxonomyId: taxonomyId ? Number(taxonomyId) : undefined,
      statementType,
    }));
  },
  async create(req: Request, res: Response) {
    created(res, await statementMappingService.create(req, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await statementMappingService.update(req, id(req), req.body));
  },
  async remove(req: Request, res: Response) {
    await statementMappingService.remove(req, id(req));
    noContent(res, 'تم حذف بند القائمة');
  },
};

export const contextController = {
  async list(req: Request, res: Response) {
    const { fiscalYear } = req.query as Record<string, string>;
    ok(res, await reportingContextService.list({ fiscalYear: fiscalYear ? Number(fiscalYear) : undefined }));
  },
  async getById(req: Request, res: Response) {
    ok(res, await reportingContextService.getById(id(req)));
  },
  async create(req: Request, res: Response) {
    created(res, await reportingContextService.create(req, req.body));
  },
  async update(req: Request, res: Response) {
    ok(res, await reportingContextService.update(req, id(req), req.body));
  },
  async remove(req: Request, res: Response) {
    await reportingContextService.remove(req, id(req));
    noContent(res, 'تم حذف سياق التقرير');
  },
};

export const readinessController = {
  /** التقرير الكامل: المؤشر + التحقق + صفوف ربط الحسابات. */
  async getReport(req: Request, res: Response) {
    ok(res, await readinessService.getReport(readinessQuery(req.query as Record<string, unknown>)));
  },
  /** نتائج التحقق وحدها — لتبويب «التحقق» بلا نقل جدول الحسابات كاملًا. */
  async validate(req: Request, res: Response) {
    const report = await readinessService.getReport(readinessQuery(req.query as Record<string, unknown>));
    ok(res, { generatedAt: report.generatedAt, validation: report.validation, score: report.score });
  },
};

export const snapshotController = {
  async list(req: Request, res: Response) {
    const { fiscalYear } = req.query as Record<string, string>;
    ok(res, await snapshotService.list({ fiscalYear: fiscalYear ? Number(fiscalYear) : undefined }));
  },
  async getById(req: Request, res: Response) {
    ok(res, await snapshotService.getById(id(req)));
  },
  async create(req: Request, res: Response) {
    created(res, await snapshotService.create(req, readinessQuery(req.body ?? {})), 'تم إنشاء اللقطة');
  },
  // لا `update` ولا `remove`: اللقطة غير قابلة للتعديل بالتصميم (انظر snapshot.service.ts).
};

export const exportController = {
  /**
   * التصدير. المُصدِّر الرسمي يرفض دائمًا في هذه المرحلة برسالة واضحة، والمعاينة
   * الداخلية تُنتج مجموعة بيانات موسومة صراحةً بأنها غير رسمية.
   */
  async run(req: Request, res: Response) {
    const { format } = req.body as { format: string };
    const exporter = resolveExporter(format);
    const dataset = await readinessService.buildDataset(readinessQuery(req.body ?? {}));
    const report = readinessService.buildReportFromDataset(dataset);
    ok(res, await exporter.export({ dataset, report }));
  },
};
