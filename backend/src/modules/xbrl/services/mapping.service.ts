/**
 * ربط دليل الحسابات بمفاهيم XBRL.
 *
 * ═══ ما لا تفعله هذه الخدمة ═══
 * لا تكتب حرفًا واحدًا في `accounts`: لا رمز الحساب ولا اسمه ولا نوعه ولا حالته
 * ولا أبوه. تقرأ الحساب للتحقق من وجوده فقط، وتكتب في `xbrl_account_mappings` حصرًا.
 * حذف كل صفوف هذا الجدول يعيد دليل الحسابات إلى ما هو عليه الآن بالضبط.
 *
 * ═══ قواعد التعدّد ═══
 * • عدة حسابات ← مفهوم واحد: **مسموح** (لا قيد تفرّد على `conceptId`).
 * • حساب واحد ← عدة مفاهيم: مسموح فقط بنوافذ سريان **غير متقاطعة**؛ التقاطع مرفوض
 *   هنا، ويُكتشف مستقلًا في محرّك التحقق (MAP-001) تحسّبًا لبيانات مستورد مستقبلي.
 */
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';

export interface AccountMappingInput {
  taxonomyId: number;
  accountId: number;
  conceptId: number;
  status?: string;
  isEnabled?: boolean;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  source?: string;
  notes?: string | null;
}

const AUDIT_MODULE = 'xbrl';

const MAPPING_SELECT = {
  id: true,
  taxonomyId: true,
  accountId: true,
  conceptId: true,
  status: true,
  isEnabled: true,
  effectiveFrom: true,
  effectiveTo: true,
  source: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, code: true, name: true, type: true, isActive: true } },
  concept: { select: { id: true, conceptCode: true, labelAr: true, statementType: true, taxonomyId: true } },
} as const;

/** تقاطع نافذتين مفتوحتَي الطرف — الطرف الغائب يمتد إلى ما لا نهاية. */
function overlaps(
  aFrom: Date | null, aTo: Date | null,
  bFrom: Date | null, bTo: Date | null,
): boolean {
  const aStart = aFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const aEnd = aTo?.getTime() ?? Number.POSITIVE_INFINITY;
  const bStart = bFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  const bEnd = bTo?.getTime() ?? Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
}

export class AccountMappingService {
  async list(filters: { taxonomyId?: number; accountId?: number; conceptId?: number; status?: string } = {}) {
    return prisma.xbrlAccountMapping.findMany({
      where: {
        ...(filters.taxonomyId && { taxonomyId: filters.taxonomyId }),
        ...(filters.accountId && { accountId: filters.accountId }),
        ...(filters.conceptId && { conceptId: filters.conceptId }),
        ...(filters.status && { status: filters.status }),
      },
      select: MAPPING_SELECT,
      orderBy: [{ accountId: 'asc' }, { id: 'asc' }],
    });
  }

  async getById(id: number) {
    const mapping = await prisma.xbrlAccountMapping.findUnique({ where: { id }, select: MAPPING_SELECT });
    if (!mapping) throw AppError.notFound('سطر الربط غير موجود');
    return mapping;
  }

  /**
   * يتحقق من سلامة الربط قبل الكتابة:
   *   • الحساب موجود (قراءة فقط — لا تعديل عليه).
   *   • المفهوم موجود وينتمي إلى التصنيف نفسه.
   *   • لا تعارض زمني مع ربط فعّال آخر لنفس الحساب.
   */
  private async assertMappable(
    input: { taxonomyId: number; accountId: number; conceptId: number; isEnabled: boolean; effectiveFrom: Date | null; effectiveTo: Date | null },
    excludeMappingId?: number,
  ) {
    const [account, concept] = await Promise.all([
      prisma.account.findUnique({ where: { id: input.accountId }, select: { id: true } }),
      prisma.xbrlConcept.findUnique({ where: { id: input.conceptId }, select: { id: true, taxonomyId: true } }),
    ]);
    if (!account) throw AppError.notFound('الحساب غير موجود');
    if (!concept) throw AppError.notFound('المفهوم غير موجود');
    if (concept.taxonomyId !== input.taxonomyId) {
      throw AppError.badRequest('المفهوم لا ينتمي إلى التصنيف المحدَّد');
    }
    if (input.effectiveFrom && input.effectiveTo && input.effectiveFrom >= input.effectiveTo) {
      throw AppError.badRequest('تاريخ بداية السريان يجب أن يسبق تاريخ نهايته');
    }
    if (!input.isEnabled) return; // سطر معطَّل لا يزاحم أحدًا.

    const siblings = await prisma.xbrlAccountMapping.findMany({
      where: {
        taxonomyId: input.taxonomyId,
        accountId: input.accountId,
        isEnabled: true,
        ...(excludeMappingId ? { id: { not: excludeMappingId } } : {}),
      },
      select: { id: true, conceptId: true, effectiveFrom: true, effectiveTo: true },
    });

    const clash = siblings.find((s) => overlaps(s.effectiveFrom, s.effectiveTo, input.effectiveFrom, input.effectiveTo));
    if (clash) {
      throw AppError.conflict(
        'الحساب مرتبط بالفعل بمفهوم آخر في نفس فترة السريان. عطّل الربط القائم أو حدّد فترة سريان لا تتقاطع معه.',
        { conflictingMappingId: clash.id, conflictingConceptId: clash.conceptId },
      );
    }
  }

  async create(req: Request, input: AccountMappingInput) {
    const normalized = {
      taxonomyId: input.taxonomyId,
      accountId: input.accountId,
      conceptId: input.conceptId,
      isEnabled: input.isEnabled ?? true,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
    };
    await this.assertMappable(normalized);

    const duplicate = await prisma.xbrlAccountMapping.findUnique({
      where: {
        taxonomyId_accountId_conceptId: {
          taxonomyId: input.taxonomyId,
          accountId: input.accountId,
          conceptId: input.conceptId,
        },
      },
      select: { id: true },
    });
    if (duplicate) throw AppError.conflict('هذا الربط موجود بالفعل');

    const created = await prisma.xbrlAccountMapping.create({
      data: {
        ...normalized,
        status: input.status ?? 'MAPPED',
        source: input.source ?? 'MANUAL',
        notes: input.notes ?? null,
      },
      select: MAPPING_SELECT,
    });

    await recordAudit({ req, action: 'CREATE', module: AUDIT_MODULE, entityId: `mapping:${created.id}`, newValue: created });
    return created;
  }

  async update(req: Request, id: number, input: Partial<Omit<AccountMappingInput, 'taxonomyId' | 'accountId'>>) {
    const before = await this.getById(id);

    const next = {
      taxonomyId: before.taxonomyId,
      accountId: before.accountId,
      conceptId: input.conceptId ?? before.conceptId,
      isEnabled: input.isEnabled ?? before.isEnabled,
      effectiveFrom: input.effectiveFrom !== undefined ? input.effectiveFrom : before.effectiveFrom,
      effectiveTo: input.effectiveTo !== undefined ? input.effectiveTo : before.effectiveTo,
    };
    await this.assertMappable(next, id);

    const updated = await prisma.xbrlAccountMapping.update({
      where: { id },
      data: {
        conceptId: next.conceptId,
        isEnabled: next.isEnabled,
        effectiveFrom: next.effectiveFrom,
        effectiveTo: next.effectiveTo,
        ...(input.status !== undefined && { status: input.status }),
        ...(input.source !== undefined && { source: input.source }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      select: MAPPING_SELECT,
    });

    await recordAudit({ req, action: 'UPDATE', module: AUDIT_MODULE, entityId: `mapping:${id}`, oldValue: before, newValue: updated });
    return updated;
  }

  async remove(req: Request, id: number) {
    const before = await this.getById(id);
    await prisma.xbrlAccountMapping.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: AUDIT_MODULE, entityId: `mapping:${id}`, oldValue: before });
  }
}

export const accountMappingService = new AccountMappingService();
