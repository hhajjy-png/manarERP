import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import { CreateEquipmentInput, UpdateEquipmentInput } from './equipment.schema';

class EquipmentRepository extends BaseRepository<{ id: number }> {
  protected readonly model = 'equipment';
  findFull(id: number) {
    return prisma.equipment.findUnique({
      where: { id },
      include: {
        maintenanceRecords: { orderBy: { date: 'desc' }, take: 10 },
        fuelLogs: { orderBy: { date: 'desc' }, take: 10 },
        breakdowns: { orderBy: { reportedAt: 'desc' }, take: 10 },
        spareParts: { orderBy: { date: 'desc' }, take: 10 },
        _count: { select: { maintenanceRecords: true, breakdowns: true, fuelLogs: true } },
      },
    });
  }
}
const repo = new EquipmentRepository();

// القائمة البيضاء للفرز — المفاتيح مطابقة لمفاتيح أعمدة الواجهة (modules.tsx).
// `regExpiry` و`regRemaining` عمودان عرضيان مشتقّان من `registration`، وكلاهما
// يُترجَم إلى الحقل الفعلي `registrationExpiry`: المدة الباقية = تاريخ الانتهاء −
// اليوم، فترتيبها **مطابق تمامًا** لترتيب التاريخ (دالة رتيبة تصاعديًا) — لا حساب
// موازٍ ولا حقل مشتق مخزَّن. `nulls: 'last'` يُبقي «غير محدد» في الذيل.
const SORTABLE: SortWhitelist = {
  code: 'code',
  type: 'type',
  status: 'status',
  ownerName: { field: 'ownerName', nullable: true },
  driverName: { field: 'driverName', nullable: true },
  plateNumber: { field: 'plateNumber', nullable: true },
  regExpiry: { field: 'registrationExpiry', nullable: true },
  regRemaining: { field: 'registrationExpiry', nullable: true },
};
const DEFAULT_ORDER = [{ id: 'desc' as const }];

const MS_DAY = 86_400_000;

/** عدد الأيام حتى تاريخ معيّن (سالب = منتهٍ). */
function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / MS_DAY);
}

/** معلومات المدة الباقية على انتهاء دفتر المركبة (أيام/أشهر + حالة التنبيه). */
function registrationInfo(date: Date | null) {
  const days = daysUntil(date);
  if (days === null) return { expiry: null, remainingDays: null, remainingText: 'غير محدد', expiringSoon: false, expired: false };
  if (days < 0) {
    return { expiry: date, remainingDays: days, remainingText: `منتهٍ منذ ${Math.abs(days)} يوم`, expiringSoon: false, expired: true };
  }
  const months = Math.floor(days / 30);
  const rem = days % 30;
  let text = `${days} يوم`;
  if (months > 0) text += ` (≈ ${months} شهر${rem ? ` و${rem} يوم` : ''})`;
  return { expiry: date, remainingDays: days, remainingText: text, expiringSoon: days <= 30, expired: false };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withRegistration(e: any) {
  return { ...e, registration: registrationInfo(e.registrationExpiry ?? null) };
}

interface ChildCounts {
  maintenanceRecords: number;
  fuelLogs: number;
  breakdowns: number;
  spareParts: number;
}

export class EquipmentService {
  private async getChildCounts(id: number): Promise<ChildCounts> {
    const [maintenanceRecords, fuelLogs, breakdowns, spareParts] = await Promise.all([
      prisma.maintenanceRecord.count({ where: { equipmentId: id } }),
      prisma.fuelLog.count({ where: { equipmentId: id } }),
      prisma.breakdown.count({ where: { equipmentId: id } }),
      prisma.sparePartUsage.count({ where: { equipmentId: id } }),
    ]);
    return { maintenanceRecords, fuelLogs, breakdowns, spareParts };
  }

  async list(query: PaginationQuery & { type?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.EquipmentWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search } },
        { driverName: { contains: query.search } },
        { plateNumber: { contains: query.search } },
        { name: { contains: query.search } },
      ];
    }
    const orderBy = buildOrderBy(query, SORTABLE, DEFAULT_ORDER);
    const { data, total } = await repo.findMany({ where, pagination, orderBy });
    return buildPaginatedResult(data.map(withRegistration), total, pagination);
  }

  /** المركبات التي يقترب انتهاء دفترها (افتراضيًا خلال 30 يومًا) أو انتهى. */
  async expiringRegistrations(days = 30) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const rows = await prisma.equipment.findMany({
      where: { registrationExpiry: { not: null, lte: until } },
      orderBy: { registrationExpiry: 'asc' },
    });
    return rows.map(withRegistration);
  }

  /** ملخص حالة الأسطول للوحة التحكم. */
  async statusSummary() {
    const grouped = await prisma.equipment.groupBy({ by: ['status'], _count: { _all: true } });
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    return { total, byStatus: grouped.map((g) => ({ status: g.status, count: g._count._all })) };
  }

  async getById(id: number) {
    const equipment = await repo.findFull(id);
    if (!equipment) throw AppError.notFound('المعدة غير موجودة');
    return withRegistration(equipment);
  }

  async create(input: CreateEquipmentInput, req: Request) {
    const conflictEquip = await prisma.equipment.findUnique({ where: { code: input.code }, select: { plateNumber: true } });
    if (conflictEquip) throw AppError.conflict(`رقم المعدة «${input.code}» مستخدم بالفعل${conflictEquip.plateNumber ? ` (لوحة: ${conflictEquip.plateNumber})` : ''}`);
    const equipment = await repo.create(input);
    await recordAudit({ req, action: 'CREATE', module: 'equipment', entityId: equipment.id, newValue: { code: input.code } });
    return equipment;
  }

  async update(id: number, input: UpdateEquipmentInput, req: Request) {
    const current = await repo.findById(id);
    if (!current) throw AppError.notFound('المعدة غير موجودة');
    const equipment = await repo.update(id, input);
    await recordAudit({ req, action: 'UPDATE', module: 'equipment', entityId: id, oldValue: current, newValue: input });
    return equipment;
  }

  async remove(id: number, req: Request) {
    if (!(await repo.findById(id))) throw AppError.notFound('المعدة غير موجودة');
    const counts = await this.getChildCounts(id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    if (total > 0) {
      const parts: string[] = [];
      if (counts.maintenanceRecords === 1) parts.push('سجل صيانة واحد');
      else if (counts.maintenanceRecords > 1) parts.push(`${counts.maintenanceRecords} سجل صيانة`);
      if (counts.breakdowns === 1) parts.push('بلاغ عطل واحد');
      else if (counts.breakdowns > 1) parts.push(`${counts.breakdowns} بلاغ عطل`);
      if (counts.fuelLogs === 1) parts.push('سجل وقود واحد');
      else if (counts.fuelLogs > 1) parts.push(`${counts.fuelLogs} سجل وقود`);
      if (counts.spareParts === 1) parts.push('سجل قطع غيار واحد');
      else if (counts.spareParts > 1) parts.push(`${counts.spareParts} سجل قطع غيار`);
      throw AppError.conflict(
        `لا يمكن حذف هذه المعدة لوجود ${parts.join('، و')} مرتبطة بها — استخدم الحذف الإجباري`,
      );
    }

    await repo.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'equipment', entityId: id });
    return { deleted: true };
  }

  async forceRemovePreview(id: number) {
    const equipment = await repo.findById(id);
    if (!equipment) throw AppError.notFound('المعدة غير موجودة');
    const childCounts = await this.getChildCounts(id);
    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);
    return { equipment, childCounts, totalChildRecords };
  }

  async forceRemove(id: number, req: Request) {
    const equipment = await repo.findFull(id);
    if (!equipment) throw AppError.notFound('المعدة غير موجودة');
    const childCounts = await this.getChildCounts(id);
    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);
    await prisma.$transaction([prisma.equipment.delete({ where: { id } })]);
    await recordAudit({
      req,
      action: 'DELETE',
      module: 'equipment',
      entityId: id,
      oldValue: {
        forceDelete: true,
        deletedEntity: { code: equipment.code, name: equipment.name },
        childCounts,
        totalChildRecords,
      },
    });
    return { deleted: true, impact: { childCounts, totalChildRecords } };
  }
}

export const equipmentService = new EquipmentService();
