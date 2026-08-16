/**
 * متحكّم مستحقات الموظف الشهرية — تفويض رقيق لا منطق.
 * كل قرار حسابي أو قانوني يعيش في المحرّك، وكل وصول لقاعدة البيانات في الخدمة.
 */
import { Request, Response } from 'express';
import { employeeCompensationService as service } from './employeeCompensation.service';
import { employeeCompensationDebtService as debtService } from './employeeCompensationDebt.service';
import { ok, created } from '../../core/utils/response';
import type { OvertimeType } from './engine';

const num = (v: unknown): number => Number(v);

export const employeeCompensationController = {
  async listSummaries(req: Request, res: Response) {
    ok(
      res,
      await service.listSummaries({
        year: num(req.query.year),
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      }),
    );
  },

  async getAnnualFile(req: Request, res: Response) {
    ok(res, await service.getAnnualFile(num(req.params.employeeId), num(req.params.year)));
  },

  async getMonth(req: Request, res: Response) {
    ok(res, await service.getMonth(num(req.params.employeeId), num(req.params.year), num(req.params.month)));
  },

  async getById(req: Request, res: Response) {
    ok(res, await service.getById(num(req.params.id)));
  },

  async create(req: Request, res: Response) {
    created(
      res,
      await service.create(num(req.params.employeeId), num(req.params.year), num(req.params.month), req.body, req),
      'تم إنشاء حسبة الشهر بنجاح',
    );
  },

  async update(req: Request, res: Response) {
    ok(res, await service.update(num(req.params.id), req.body, req), 'تم حفظ حسبة الشهر بنجاح');
  },

  async approve(req: Request, res: Response) {
    ok(res, await service.approve(num(req.params.id), req), 'تم اعتماد حسبة الشهر');
  },

  async remove(req: Request, res: Response) {
    ok(res, await service.remove(num(req.params.id), req), 'تم حذف حسبة الشهر');
  },

  async copyPrevious(req: Request, res: Response) {
    created(
      res,
      await service.copyPreviousMonth(num(req.params.employeeId), num(req.params.year), num(req.params.month), req),
      'تم نسخ بنود الشهر السابق',
    );
  },

  /** معاينة بلا كتابة — تُستدعى أثناء التحرير. */
  // صارت غير متزامنة فعلًا مع حزمة السجل اليومي: تقييم الالتزام يقرأ أيام السنة من
  // قاعدة البيانات (قراءة فقط، بلا أي كتابة).
  async preview(req: Request, res: Response) {
    ok(res, await service.preview(req.body));
  },

  /** الحسبة العكسية — أداة مساعدة بلا أثر تخزيني. */
  async reverseOvertime(req: Request, res: Response) {
    ok(res, service.reverseOvertime({ ...req.body, overtimeType: req.body.overtimeType as OvertimeType }));
  },

  /** الافتراضي العام لسعر ساعة الإضافي — قراءة. */
  async getCompanyOvertimeSettings(_req: Request, res: Response) {
    ok(res, await service.getCompanyOvertimeSettings());
  },

  /** الافتراضي العام — تعديل. لا يمسّ أي حسبة محفوظة. */
  async updateCompanyOvertimeSettings(req: Request, res: Response) {
    ok(
      res,
      await service.setCompanyOvertimeSettings(Number(req.body.baseRate), req),
      'تم حفظ سعر ساعة الإضافي الافتراضي — لا يؤثّر على الأشهر المحفوظة',
    );
  },

  async statement(req: Request, res: Response) {
    ok(res, await service.getStatementData(num(req.params.id)));
  },

  async detailedReport(req: Request, res: Response) {
    ok(res, await service.getDetailedReportData(num(req.params.id)));
  },
};

/**
 * متحكّم سجل المديونيات والسلف — تفويض رقيق كسابقه.
 * كل منطق الدفتر (الرصيد، التحقّق، المزامنة) في `employeeCompensationDebt.service`.
 */
export const employeeCompensationDebtController = {
  async list(req: Request, res: Response) {
    ok(res, await debtService.listForEmployee(num(req.params.employeeId)));
  },

  /** المفتوحة وحدها — تغذّي حوار «استقطاع من مديونية» داخل محرّر الشهر. */
  async listOpen(req: Request, res: Response) {
    ok(res, await debtService.listOpenForEmployee(num(req.params.employeeId)));
  },

  async getById(req: Request, res: Response) {
    ok(res, await debtService.getById(num(req.params.id)));
  },

  async create(req: Request, res: Response) {
    created(res, await debtService.create(num(req.params.employeeId), req.body, req), 'تم إنشاء السجل بنجاح');
  },

  async update(req: Request, res: Response) {
    ok(res, await debtService.update(num(req.params.id), req.body, req), 'تم حفظ التعديل');
  },

  async remove(req: Request, res: Response) {
    ok(res, await debtService.remove(num(req.params.id), req), 'تم حذف السجل');
  },

  async createManualPayment(req: Request, res: Response) {
    created(res, await debtService.createManualPayment(num(req.params.id), req.body, req), 'تم تسجيل السداد');
  },

  async updateManualPayment(req: Request, res: Response) {
    ok(res, await debtService.updateManualPayment(num(req.params.id), req.body, req), 'تم تعديل السداد');
  },

  async deleteManualPayment(req: Request, res: Response) {
    ok(res, await debtService.deleteManualPayment(num(req.params.id), req), 'تم حذف السداد');
  },
};
