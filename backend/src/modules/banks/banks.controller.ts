import { Request, Response } from 'express';
import { banksService } from './banks.service';
import { ok, created } from '../../core/utils/response';

export const banksController = {
  async listBanks(_req: Request, res: Response) {
    ok(res, await banksService.listBanks());
  },
  async createBank(req: Request, res: Response) {
    created(res, await banksService.createBank(req.body, req), 'تم إضافة البنك');
  },
  async updateBank(req: Request, res: Response) {
    ok(res, await banksService.updateBank(Number(req.params.id), req.body, req), 'تم تحديث البنك');
  },

  /** `?activeOnly=true` هو ما يستهلكه منتقي الحساب في نموذج الشيك. */
  async listAccounts(req: Request, res: Response) {
    ok(res, await banksService.listAccounts({ activeOnly: req.query.activeOnly === 'true' }));
  },
  async getAccount(req: Request, res: Response) {
    ok(res, await banksService.getAccount(Number(req.params.id)));
  },
  async createAccount(req: Request, res: Response) {
    created(res, await banksService.createAccount(req.body, req), 'تم إضافة الحساب البنكي');
  },
  async updateAccount(req: Request, res: Response) {
    ok(res, await banksService.updateAccount(Number(req.params.id), req.body, req), 'تم تحديث الحساب البنكي');
  },

  async unlinkedCheques(_req: Request, res: Response) {
    ok(res, await banksService.unlinkedChequesReport());
  },
};
