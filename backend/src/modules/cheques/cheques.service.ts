import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { CreateChequeInput, UpdateChequeInput } from './cheques.schema';

export class ChequesService {
  async stats() {
    const [total, draft, printed, cancelled] = await Promise.all([
      prisma.cheque.count(),
      prisma.cheque.count({ where: { status: 'DRAFT' } }),
      prisma.cheque.count({ where: { status: 'PRINTED' } }),
      prisma.cheque.count({ where: { status: 'CANCELLED' } }),
    ]);
    return { total, draft, printed, cancelled };
  }

  async list(query: PaginationQuery & { status?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.ChequeWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.chequeDate = {};
      if (query.from) where.chequeDate.gte = new Date(query.from);
      if (query.to) where.chequeDate.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { beneficiaryName: { contains: query.search } },
        { chequeNumber: { contains: query.search } },
        { bankName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.cheque.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cheque.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    return cheque;
  }

  async create(input: CreateChequeInput, req: Request) {
    const existing = await prisma.cheque.findUnique({ where: { chequeNumber: input.chequeNumber } });
    if (existing) throw AppError.conflict(`رقم الشيك «${input.chequeNumber}» مستخدم بالفعل (المستفيد: ${existing.beneficiaryName}، التاريخ: ${String(existing.chequeDate).slice(0, 10)})`);

    const cheque = await prisma.cheque.create({
      data: {
        chequeNumber: input.chequeNumber,
        chequeDate: input.chequeDate,
        beneficiaryName: input.beneficiaryName,
        amount: input.amount,
        currency: input.currency ?? 'KWD',
        description: input.description ?? null,
        bankName: input.bankName,
        notes: input.notes ?? null,
        status: 'DRAFT',
      },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'cheques',
      entityId: cheque.id,
      newValue: {
        chequeNumber: cheque.chequeNumber,
        beneficiaryName: cheque.beneficiaryName,
        bankName: cheque.bankName,
        amount: cheque.amount,
        currency: cheque.currency,
        chequeDate: cheque.chequeDate,
      },
    });
    return cheque;
  }

  async update(id: number, input: UpdateChequeInput, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل شيك ملغي');
    if (current.status === 'PRINTED') throw AppError.badRequest('لا يمكن تعديل شيك مطبوع');

    if (input.chequeNumber && input.chequeNumber !== current.chequeNumber) {
      const dup = await prisma.cheque.findUnique({ where: { chequeNumber: input.chequeNumber } });
      if (dup) throw AppError.conflict(`رقم الشيك «${input.chequeNumber}» مستخدم بالفعل (المستفيد: ${dup.beneficiaryName}، التاريخ: ${String(dup.chequeDate).slice(0, 10)})`);
    }

    const cheque = await prisma.cheque.update({
      where: { id },
      data: {
        chequeNumber: input.chequeNumber ?? current.chequeNumber,
        chequeDate: input.chequeDate ?? current.chequeDate,
        beneficiaryName: input.beneficiaryName ?? current.beneficiaryName,
        amount: input.amount ?? current.amount,
        currency: input.currency ?? current.currency,
        description: input.description === undefined ? current.description : (input.description ?? null),
        bankName: input.bankName ?? current.bankName,
        notes: input.notes === undefined ? current.notes : (input.notes ?? null),
      },
    });
    await recordAudit({
      req,
      action: 'UPDATE',
      module: 'cheques',
      entityId: id,
      oldValue: current,
      newValue: input,
    });
    return cheque;
  }

  async markPrinted(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن طباعة شيك ملغي');
    if (current.status === 'PRINTED') throw AppError.badRequest('الشيك مطبوع بالفعل');

    const cheque = await prisma.cheque.update({
      where: { id },
      data: { status: 'PRINTED', printedAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'PRINT',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'PRINTED' },
    });
    return cheque;
  }

  async cancel(id: number, req: Request) {
    const current = await prisma.cheque.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('الشيك غير موجود');
    if (current.status === 'CANCELLED') throw AppError.badRequest('الشيك ملغي بالفعل');

    const cheque = await prisma.cheque.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await recordAudit({
      req,
      action: 'CANCEL',
      module: 'cheques',
      entityId: id,
      newValue: { status: 'CANCELLED' },
    });
    return cheque;
  }

  /**
   * Returns the Payment Voucher number for a cheque, generating one on first call.
   *
   * Generation rules:
   * - Number is generated ONLY when the user requests it (Print Payment Voucher).
   * - Sequence is stored in the Setting key "finance.paymentVoucher.lastSequence".
   * - Format: PV-000001 (global, never resets, never reuses deleted numbers).
   * - The entire read-increment-write is atomic inside a Prisma transaction.
   * - Subsequent calls for the same cheque return the already-stored number (idempotent).
   */
  async getOrCreatePaymentVoucherNumber(id: number): Promise<string> {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');
    if (cheque.status === 'CANCELLED') throw AppError.badRequest('لا يمكن إصدار سند صرف لشيك ملغي');

    // Idempotent: return existing number without writing
    if (cheque.paymentVoucherNumber) return cheque.paymentVoucherNumber;

    const SETTINGS_KEY = 'finance.paymentVoucher.lastSequence';

    const voucherNumber = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: two concurrent requests can both see null
      // outside, but only the first one to acquire the write lock will find null here.
      const fresh = await tx.cheque.findUnique({ where: { id } });
      if (!fresh) throw AppError.notFound('الشيك غير موجود');
      if (fresh.paymentVoucherNumber) return fresh.paymentVoucherNumber;

      const setting = await tx.setting.findUnique({ where: { key: SETTINGS_KEY } });
      const lastSeq = setting ? parseInt(setting.value, 10) : 0;
      const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
      const number = `PV-${String(nextSeq).padStart(6, '0')}`;

      await tx.setting.upsert({
        where: { key: SETTINGS_KEY },
        update: { value: String(nextSeq) },
        create: { key: SETTINGS_KEY, value: String(nextSeq), group: 'finance' },
      });

      await tx.cheque.update({
        where: { id },
        data: { paymentVoucherNumber: number },
      });

      return number;
    });

    return voucherNumber;
  }

  /**
   * معاينة الحذف النهائي (SYSTEM_ADMIN فقط عبر الراوت).
   * لا تحذف شيئاً — تُرجع بيانات الشيك وما سيتأثر لعرضها في نافذة التأكيد.
   */
  async forceRemovePreview(id: number) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');

    // حركات كشف الحساب البنكي المطابَقة بهذا الشيك (مرجع تسوية، بلا FK)
    const bankMatchesCount = await prisma.bankStatementTransaction.count({
      where: { matchedType: 'cheque', matchedId: id },
    });

    const willBeDeleted: string[] = ['سجل الشيك'];

    const warnings: string[] = [];
    if (cheque.status === 'CANCELLED') {
      warnings.push('هذا الشيك ملغى بالفعل — الإلغاء هو الإجراء المعتاد، والحذف النهائي استثنائي لا يمكن التراجع عنه');
    }
    if (cheque.status === 'PRINTED') {
      warnings.push('هذا الشيك مطبوع — الحذف النهائي يزيل سجله بالكامل من النظام');
    }
    if (cheque.paymentVoucherNumber) {
      warnings.push(`صدر لهذا الشيك سند صرف رقم ${cheque.paymentVoucherNumber} — لن يُعاد استخدام هذا الرقم بعد الحذف`);
    }
    if (bankMatchesCount > 0) {
      warnings.push(`هذا الشيك مطابَق بـ ${bankMatchesCount} حركة في كشف حساب بنكي — سيتم فك ارتباطها (تُحفظ الحركات وتعود «غير مطابَقة» ولا تُحذف)`);
    }

    return {
      id: cheque.id,
      chequeNumber: cheque.chequeNumber,
      beneficiaryName: cheque.beneficiaryName,
      amount: cheque.amount,
      currency: cheque.currency,
      bankName: cheque.bankName,
      chequeDate: cheque.chequeDate,
      status: cheque.status,
      printedAt: cheque.printedAt,
      cancelledAt: cheque.cancelledAt,
      paymentVoucherNumber: cheque.paymentVoucherNumber,
      hasPaymentVoucher: !!cheque.paymentVoucherNumber,
      bankMatchesCount,
      willBeDeleted,
      warnings,
    };
  }

  /**
   * الحذف النهائي للشيك (SYSTEM_ADMIN فقط عبر الراوت).
   * يتطلب تطابق رقم الشيك للتأكيد. يفك ارتباط حركات كشف الحساب البنكي المطابَقة
   * (دون حذفها) ثم يحذف سجل الشيك داخل معاملة واحدة، ويسجّل الحدث في سجل التدقيق.
   */
  async forceRemove(id: number, confirmation: string, req: Request) {
    const cheque = await prisma.cheque.findUnique({ where: { id } });
    if (!cheque) throw AppError.notFound('الشيك غير موجود');

    if (confirmation !== cheque.chequeNumber) {
      throw AppError.badRequest('يجب كتابة رقم الشيك بشكل مطابق للتأكيد');
    }

    const bankMatchesCount = await prisma.bankStatementTransaction.count({
      where: { matchedType: 'cheque', matchedId: id },
    });

    await prisma.$transaction(async (tx) => {
      // فك ارتباط حركات كشف الحساب المطابَقة بهذا الشيك — نحفظ السجلات البنكية المستوردة ولا نحذفها
      if (bankMatchesCount > 0) {
        await tx.bankStatementTransaction.updateMany({
          where: { matchedType: 'cheque', matchedId: id },
          data: { reconcileStatus: 'UNMATCHED', matchedType: null, matchedId: null, matchedRef: null, matchConfidence: null },
        });
      }
      await tx.cheque.delete({ where: { id } });
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'cheques',
      entityId: id,
      newValue: {
        forceDelete: true,
        chequeNumber: cheque.chequeNumber,
        beneficiaryName: cheque.beneficiaryName,
        amount: cheque.amount,
        currency: cheque.currency,
        bankName: cheque.bankName,
        status: cheque.status,
        hadPaymentVoucher: !!cheque.paymentVoucherNumber,
        paymentVoucherNumber: cheque.paymentVoucherNumber,
        bankMatchesCleared: bankMatchesCount,
      },
    });

    return { deleted: true };
  }
}

export const chequesService = new ChequesService();
