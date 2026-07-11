import { Request, Response } from 'express';
import { ok } from '../../core/utils/response';
import { printingService } from './printing.service';
import type { PrintEventInput } from './printing.schema';

export class PrintingController {
  /** POST /api/printing/events — record a PRINT / PDF_EXPORT outcome. */
  async recordEvent(req: Request, res: Response) {
    const result = await printingService.recordPrintEvent(req.body as PrintEventInput, req);
    ok(res, result, 'تم تسجيل عملية الطباعة');
  }
}

export const printingController = new PrintingController();
