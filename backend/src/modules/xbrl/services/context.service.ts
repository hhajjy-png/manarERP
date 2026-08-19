/**
 * سياق التقرير (Reporting Context) — الكيان والفترة والعملة واللغة.
 *
 * السياق **وصفي بالكامل**: لا يقفل فترة مالية، ولا يُنشئ سنة مالية، ولا يتفاعل مع
 * `periodLock.service`. تحديد فترة هنا لا يمنع ترحيل قيد فيها ولا يفتح فترة مقفلة.
 *
 * العملة الافتراضية `KWD` والدقة ثلاث منازل — نفس عملة النظام ونفس دقّته، لا إعداد
 * موازٍ يمكن أن ينحرف عنها.
 */
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';
import { XBRL_DEFAULT_CURRENCY, XBRL_DEFAULT_DECIMALS, XBRL_DEFAULT_LANGUAGE } from '../xbrl.constants';
import type { ReportingContextSnapshot } from '../xbrl.types';

export interface ReportingContextInput {
  name: string;
  taxonomyId?: number | null;
  entityName: string;
  entityNameEn?: string | null;
  entityIdentifier?: string | null;
  entityScheme?: string | null;
  fiscalYear: number;
  periodStart: Date;
  periodEnd: Date;
  instantDate?: Date | null;
  comparativePeriodStart?: Date | null;
  comparativePeriodEnd?: Date | null;
  currency?: string;
  decimals?: number;
  reportingLanguage?: string;
  isDefault?: boolean;
  notes?: string | null;
}

const AUDIT_MODULE = 'xbrl';

const SELECT = {
  id: true,
  name: true,
  taxonomyId: true,
  entityName: true,
  entityNameEn: true,
  entityIdentifier: true,
  entityScheme: true,
  fiscalYear: true,
  periodStart: true,
  periodEnd: true,
  instantDate: true,
  comparativePeriodStart: true,
  comparativePeriodEnd: true,
  currency: true,
  decimals: true,
  reportingLanguage: true,
  isDefault: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ContextRow = {
  id: number; name: string; taxonomyId: number | null;
  entityName: string; entityNameEn: string | null; entityIdentifier: string | null; entityScheme: string | null;
  fiscalYear: number; periodStart: Date; periodEnd: Date; instantDate: Date | null;
  comparativePeriodStart: Date | null; comparativePeriodEnd: Date | null;
  currency: string; decimals: number; reportingLanguage: string; isDefault: boolean;
};

export function toContextSnapshot(row: ContextRow): ReportingContextSnapshot {
  return {
    id: row.id,
    name: row.name,
    taxonomyId: row.taxonomyId,
    entityName: row.entityName,
    entityNameEn: row.entityNameEn,
    entityIdentifier: row.entityIdentifier,
    entityScheme: row.entityScheme,
    fiscalYear: row.fiscalYear,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    // تاريخ اللحظة يُشتق من نهاية الفترة عند غيابه — لا يُترك فارغًا فيضطر كل
    // مستهلك لاحق إلى اشتقاقه بطريقته الخاصة.
    instantDate: (row.instantDate ?? row.periodEnd).toISOString(),
    comparativePeriodStart: row.comparativePeriodStart?.toISOString() ?? null,
    comparativePeriodEnd: row.comparativePeriodEnd?.toISOString() ?? null,
    currency: row.currency,
    decimals: row.decimals,
    reportingLanguage: row.reportingLanguage,
    isDefault: row.isDefault,
  };
}

export class ReportingContextService {
  async list(filters: { fiscalYear?: number } = {}) {
    return prisma.xbrlReportingContext.findMany({
      where: { ...(filters.fiscalYear && { fiscalYear: filters.fiscalYear }) },
      select: SELECT,
      orderBy: [{ fiscalYear: 'desc' }, { id: 'desc' }],
    });
  }

  async getById(id: number) {
    const context = await prisma.xbrlReportingContext.findUnique({ where: { id }, select: SELECT });
    if (!context) throw AppError.notFound('سياق التقرير غير موجود');
    return context;
  }

  /**
   * السياق المستخدَم في حساب الجاهزية: المطلوب صراحةً، ثم الافتراضي، ثم الأحدث سنةً.
   * غياب أي سياق ليس خطأً هنا — محرّك التحقق يبلّغ عنه بالقاعدة RPT-001.
   */
  async resolve(params: { contextId?: number; fiscalYear?: number } = {}): Promise<ReportingContextSnapshot | null> {
    if (params.contextId) return toContextSnapshot(await this.getById(params.contextId));

    const row = await prisma.xbrlReportingContext.findFirst({
      where: { ...(params.fiscalYear && { fiscalYear: params.fiscalYear }) },
      select: SELECT,
      orderBy: [{ isDefault: 'desc' }, { fiscalYear: 'desc' }, { id: 'desc' }],
    });
    return row ? toContextSnapshot(row) : null;
  }

  private assertPeriodSane(input: Pick<ReportingContextInput, 'periodStart' | 'periodEnd' | 'comparativePeriodStart' | 'comparativePeriodEnd'>) {
    if (input.periodStart >= input.periodEnd) {
      throw AppError.badRequest('تاريخ بداية الفترة يجب أن يسبق تاريخ نهايتها');
    }
    const { comparativePeriodStart: cs, comparativePeriodEnd: ce } = input;
    if ((cs && !ce) || (!cs && ce)) {
      throw AppError.badRequest('يجب تحديد بداية فترة المقارنة ونهايتها معًا');
    }
    if (cs && ce) {
      if (cs >= ce) throw AppError.badRequest('تاريخ بداية فترة المقارنة يجب أن يسبق تاريخ نهايتها');
      if (ce >= input.periodStart) throw AppError.badRequest('فترة المقارنة يجب أن تنتهي قبل بداية الفترة الحالية');
    }
  }

  async create(req: Request, input: ReportingContextInput) {
    this.assertPeriodSane(input);

    const created = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.xbrlReportingContext.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.xbrlReportingContext.create({
        data: {
          name: input.name,
          taxonomyId: input.taxonomyId ?? null,
          entityName: input.entityName,
          entityNameEn: input.entityNameEn ?? null,
          entityIdentifier: input.entityIdentifier ?? null,
          entityScheme: input.entityScheme ?? null,
          fiscalYear: input.fiscalYear,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          instantDate: input.instantDate ?? null,
          comparativePeriodStart: input.comparativePeriodStart ?? null,
          comparativePeriodEnd: input.comparativePeriodEnd ?? null,
          currency: input.currency ?? XBRL_DEFAULT_CURRENCY,
          decimals: input.decimals ?? XBRL_DEFAULT_DECIMALS,
          reportingLanguage: input.reportingLanguage ?? XBRL_DEFAULT_LANGUAGE,
          isDefault: input.isDefault ?? false,
          notes: input.notes ?? null,
        },
        select: SELECT,
      });
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `context:${created.id}`, newValue: created });
    return created;
  }

  async update(req: Request, id: number, input: Partial<ReportingContextInput>) {
    const before = await this.getById(id);
    this.assertPeriodSane({
      periodStart: input.periodStart ?? before.periodStart,
      periodEnd: input.periodEnd ?? before.periodEnd,
      comparativePeriodStart: input.comparativePeriodStart !== undefined ? input.comparativePeriodStart : before.comparativePeriodStart,
      comparativePeriodEnd: input.comparativePeriodEnd !== undefined ? input.comparativePeriodEnd : before.comparativePeriodEnd,
    });

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.xbrlReportingContext.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      }
      return tx.xbrlReportingContext.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.taxonomyId !== undefined && { taxonomyId: input.taxonomyId }),
          ...(input.entityName !== undefined && { entityName: input.entityName }),
          ...(input.entityNameEn !== undefined && { entityNameEn: input.entityNameEn }),
          ...(input.entityIdentifier !== undefined && { entityIdentifier: input.entityIdentifier }),
          ...(input.entityScheme !== undefined && { entityScheme: input.entityScheme }),
          ...(input.fiscalYear !== undefined && { fiscalYear: input.fiscalYear }),
          ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
          ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
          ...(input.instantDate !== undefined && { instantDate: input.instantDate }),
          ...(input.comparativePeriodStart !== undefined && { comparativePeriodStart: input.comparativePeriodStart }),
          ...(input.comparativePeriodEnd !== undefined && { comparativePeriodEnd: input.comparativePeriodEnd }),
          ...(input.currency !== undefined && { currency: input.currency }),
          ...(input.decimals !== undefined && { decimals: input.decimals }),
          ...(input.reportingLanguage !== undefined && { reportingLanguage: input.reportingLanguage }),
          ...(input.isDefault !== undefined && { isDefault: input.isDefault }),
          ...(input.notes !== undefined && { notes: input.notes }),
        },
        select: SELECT,
      });
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `context:${id}`, oldValue: before, newValue: updated });
    return updated;
  }

  async remove(req: Request, id: number) {
    const before = await this.getById(id);
    await prisma.xbrlReportingContext.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `context:${id}`, oldValue: before });
  }
}

export const reportingContextService = new ReportingContextService();
