import { Request, Response } from 'express';
import { z } from 'zod';
import { transactionsService } from './transactions.service';
import { ENUMS } from '../../config/constants';
import { ok, created } from '../../core/utils/response';

const manualSchema = z.object({
  description: z.string().min(1, 'الوصف مطلوب'),
  type: z.enum(ENUMS.transactionType),
  account: z.string().min(1, 'الحساب مطلوب'),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
  date: z.coerce.date().optional(),
});

export const transactionsController = {
  async list(req: Request, res: Response) {
    ok(res, await transactionsService.list(req.query));
  },
  async ledger(req: Request, res: Response) {
    const { account, from, to } = req.query as Record<string, string>;
    ok(res, await transactionsService.ledger(account, from, to));
  },
  async profitAndLoss(req: Request, res: Response) {
    const { from, to } = req.query as Record<string, string>;
    ok(res, await transactionsService.profitAndLoss(from, to));
  },
  async createManual(req: Request, res: Response) {
    const input = manualSchema.parse(req.body);
    created(res, await transactionsService.createManual(input, req));
  },
};
