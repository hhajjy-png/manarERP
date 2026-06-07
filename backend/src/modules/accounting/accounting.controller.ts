import { Request, Response } from 'express';
import { z } from 'zod';
import { accountingService } from './accounting.service';
import { ok, created } from '../../core/utils/response';

const accountSchema = z.object({
  code: z.string().min(1, 'رمز الحساب مطلوب'),
  name: z.string().min(1, 'اسم الحساب مطلوب'),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  isActive: z.boolean().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
});

const journalLineSchema = z.object({
  accountId: z.number().int().positive('معرّف الحساب مطلوب'),
  description: z.string().optional(),
  debit: z.coerce.number().nonnegative().default(0),
  credit: z.coerce.number().nonnegative().default(0),
});

const journalEntrySchema = z.object({
  date: z.coerce.date().optional(),
  description: z.string().min(1, 'البيان مطلوب'),
  referenceType: z.string().optional(),
  referenceId: z.number().int().positive().optional(),
  lines: z.array(journalLineSchema).min(2, 'القيد يجب أن يحتوي على سطرين على الأقل'),
});

export const accountingController = {
  // Accounts
  async listAccounts(req: Request, res: Response) {
    ok(res, await accountingService.listAccounts(req.query as never));
  },
  async createAccount(req: Request, res: Response) {
    const input = accountSchema.parse(req.body);
    created(res, await accountingService.createAccount(input, req));
  },
  async updateAccount(req: Request, res: Response) {
    const id = Number(req.params.id);
    const input = accountSchema.partial().parse(req.body);
    ok(res, await accountingService.updateAccount(id, input, req));
  },
  async deleteAccount(req: Request, res: Response) {
    const id = Number(req.params.id);
    ok(res, await accountingService.deleteAccount(id, req));
  },

  // Journal Entries
  async listJournalEntries(req: Request, res: Response) {
    ok(res, await accountingService.listJournalEntries(req.query as never));
  },
  async createJournalEntry(req: Request, res: Response) {
    const input = journalEntrySchema.parse(req.body);
    created(res, await accountingService.createJournalEntry(input, req));
  },
  async cancelJournalEntry(req: Request, res: Response) {
    const id = Number(req.params.id);
    ok(res, await accountingService.cancelJournalEntry(id, req));
  },

  // Payments
  async listPayments(req: Request, res: Response) {
    ok(res, await accountingService.listPayments(req.query as never));
  },

  // Summary
  async financialSummary(req: Request, res: Response) {
    const { from, to } = req.query as { from?: string; to?: string };
    ok(res, await accountingService.financialSummary(from, to));
  },
};
