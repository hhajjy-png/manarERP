import type { Request, Response } from 'express';
import { ok }                          from '@core/utils/response.js';
import { asyncHandler }                from '@core/utils/asyncHandler.js';
import { AppError }                    from '@core/errors/AppError.js';
import { AccountKeyParamSchema }       from './bankAccounts.schema.js';
import {
  listBankAccounts,
  getBankAccountDashboard,
} from './bankAccounts.service.js';

// GET /api/bank-accounts
export const listBankAccountsHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    const accounts = await listBankAccounts();
    return ok(res, { accounts, total: accounts.length });
  },
);

// GET /api/bank-accounts/:accountKey/dashboard
export const getDashboardHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = AccountKeyParamSchema.safeParse({
      accountKey: decodeURIComponent(req.params.accountKey ?? ''),
    });
    if (!parsed.success) {
      throw AppError.badRequest('مفتاح الحساب غير صالح');
    }

    const dashboard = await getBankAccountDashboard(parsed.data.accountKey);
    if (!dashboard) {
      throw AppError.notFound('لا توجد بيانات لهذا الحساب');
    }

    return ok(res, dashboard);
  },
);
