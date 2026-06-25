import type { Request, Response } from 'express';
import { payrollBankImportService } from './service';
import { buildImportReportExcel, buildImportReportHtml } from './reportBuilder';
import { PreviewInputSchema, ExecuteInputSchema } from './schema';
import { ok } from '../../core/utils/response';
import { AppError } from '../../core/errors/AppError';
import type { ImportReport } from './types';

export async function previewHandler(req: Request, res: Response): Promise<void> {
  const parsed = PreviewInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');
  const summary = await payrollBankImportService.preview(parsed.data);
  ok(res, summary);
}

export async function executeHandler(req: Request, res: Response): Promise<void> {
  const parsed = ExecuteInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');
  const report = await payrollBankImportService.execute(parsed.data, req);
  ok(res, report);
}

export async function reportExcelHandler(req: Request, res: Response): Promise<void> {
  const report = req.body?.report as ImportReport | undefined;
  if (!report) throw AppError.badRequest('بيانات التقرير مفقودة');
  const buffer = await buildImportReportExcel(report);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-import-report.xlsx"`);
  res.send(buffer);
}

export async function reportPdfHandler(req: Request, res: Response): Promise<void> {
  const report = req.body?.report as ImportReport | undefined;
  if (!report) throw AppError.badRequest('بيانات التقرير مفقودة');
  const html = buildImportReportHtml(report);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline');
  res.send(html);
}
