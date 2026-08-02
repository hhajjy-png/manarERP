import { Request, Response } from 'express';
import { ok, created, noContent } from '@core/utils/response';
import { asyncHandler } from '@core/utils/asyncHandler';
import { sendExcel } from '@core/utils/excelResponse';
import { ENUMS } from '@config/constants';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import { buildReportHtml } from '@shared/services/reportEngine/html.service';
import { loadReportBranding } from '@shared/services/reportEngine/brandingLoader';
import * as service from './workAnalysis.service';
import { buildWorkAnalysisReportInput, buildWorkAnalysisNotes } from './workAnalysis.report';

type WorkAnalysisStatus = (typeof ENUMS.workAnalysisStatus)[number];

function parseStatus(raw: unknown): WorkAnalysisStatus | undefined {
  return typeof raw === 'string' && (ENUMS.workAnalysisStatus as readonly string[]).includes(raw)
    ? (raw as WorkAnalysisStatus)
    : undefined;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const customerId = Number(req.query.customerId) || undefined;

  ok(res, await service.listWorkAnalyses({
    page,
    pageSize,
    search: req.query.search as string | undefined,
    status: parseStatus(req.query.status),
    customerId,
    ownerName: req.query.ownerName as string | undefined,
    sortBy: req.query.sortBy as string | undefined,
    sortDir: req.query.sortDir as string | undefined,
  }));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.getWorkAnalysis(Number(req.params.id)));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const analysis = await service.createWorkAnalysis(req.body, {
    id: req.user?.userId,
    name: req.user?.username,
  });
  created(res, analysis);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.updateWorkAnalysis(Number(req.params.id), req.body));
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  await service.archiveWorkAnalysis(Number(req.params.id));
  noContent(res, 'تمت أرشفة التحليل');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteWorkAnalysis(Number(req.params.id));
  noContent(res, 'تم حذف التحليل');
});

export const ownerSuggestions = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await service.getOwnerSuggestions());
});

export const stats = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await service.getWorkAnalysisStats());
});

/**
 * تصدير تحليل واحد عبر محرّك التقارير القائم — `format=excel` (افتراضي) أو
 * `format=html`. لا يوجد `format=pdf`: الواجهة تطلب HTML ثم ترسمه في Chromium عبر
 * `exportPdfFromHtml`، وهو نفس مسار PDF المستقر في وحدة التقارير (PDFKit متقاعد
 * لأنه لا يشكّل العربية).
 *
 * مسار قراءة بحت: يقرأ التحليل ثم يبني مستندًا في الذاكرة. لا كتابة في أي جدول.
 */
export const exportOne = asyncHandler(async (req: Request, res: Response) => {
  const analysis = await service.getWorkAnalysis(Number(req.params.id));
  const input = buildWorkAnalysisReportInput(analysis);

  if (req.query.format === 'html') {
    const branding = await loadReportBranding();
    const html = buildReportHtml(input, {
      profile: 'a4-landscape',
      branding,
      // الوسم القاطع بأن الورقة ليست مستندًا محاسبيًا.
      watermark: 'internal',
      showPageNumbers: true,
      generatedBy: req.user?.username,
      notes: buildWorkAnalysisNotes(analysis),
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="work-analysis-${analysis.id}.html"`);
    res.send(Buffer.from(html, 'utf-8'));
    return;
  }

  sendExcel(res, await buildExcel(input), `تحليل-الشغل-والعمولة-${analysis.id}.xlsx`);
});
