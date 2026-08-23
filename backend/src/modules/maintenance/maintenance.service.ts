import { Request } from 'express';
import { prisma } from '../../config/database';
import { MAINTENANCE_DUE_ALERT_DAYS } from '../../config/thresholds';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import {
  CreateBreakdownInput,
  CreateFuelInput,
  CreateMaintenanceInput,
  CreateSparePartInput,
  UpdateMaintenanceInput,
} from './maintenance.schema';

async function assertEquipment(equipmentId: number) {
  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
  if (!eq) throw AppError.badRequest('المعدة المحددة غير موجودة');
}

export class MaintenanceService {
  // ===== سجلات الصيانة =====
  async listRecords(filters: { equipmentId?: number; status?: string; type?: string; dateFrom?: Date; dateTo?: Date } = {}) {
    const where: Record<string, unknown> = {};
    if (filters.equipmentId) where.equipmentId = filters.equipmentId;
    if (filters.status)      where.status = filters.status;
    if (filters.type)        where.type = filters.type;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {
        ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
        ...(filters.dateTo   ? { lte: filters.dateTo   } : {}),
      };
    }
    return prisma.maintenanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { equipment: { select: { id: true, code: true, name: true } } },
    });
  }

  async createRecord(input: CreateMaintenanceInput, req: Request) {
    await assertEquipment(input.equipmentId);
    const record = await prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceRecord.create({ data: input });
      // إذا كانت الصيانة جارية، نحدّث حالة المعدة
      if (input.status === 'IN_PROGRESS') {
        await tx.equipment.update({ where: { id: input.equipmentId }, data: { status: 'NOT_WORKING' } });
      } else if (input.status === 'COMPLETED') {
        await tx.equipment.update({ where: { id: input.equipmentId }, data: { status: 'WORKING' } });
      }
      return r;
    });
    await recordAudit({ req, action: 'CREATE', module: 'maintenance', entityId: record.id, newValue: { equipmentId: input.equipmentId, cost: input.cost } });
    return record;
  }

  async updateRecord(id: number, input: UpdateMaintenanceInput, req: Request) {
    const old = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('سجل الصيانة غير موجود');
    const record = await prisma.$transaction(async (tx) => {
      const r = await tx.maintenanceRecord.update({ where: { id }, data: input });
      // مزامنة حالة المعدة عند تغيير حالة الصيانة
      if (input.status && input.status !== old.status) {
        if (input.status === 'IN_PROGRESS') {
          await tx.equipment.update({ where: { id: old.equipmentId }, data: { status: 'NOT_WORKING' } });
        } else if (input.status === 'COMPLETED' || input.status === 'CANCELLED') {
          await tx.equipment.update({ where: { id: old.equipmentId }, data: { status: 'WORKING' } });
        }
      }
      return r;
    });
    await recordAudit({ req, action: 'UPDATE', module: 'maintenance', entityId: id, oldValue: old, newValue: input });
    return record;
  }

  async deleteRecord(id: number, req: Request) {
    const old = await prisma.maintenanceRecord.findUnique({ where: { id } });
    if (!old) throw AppError.notFound('سجل الصيانة غير موجود');
    await prisma.maintenanceRecord.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'maintenance', entityId: id, oldValue: old });
    return { deleted: true };
  }

  /**
   * تنبيهات الصيانة الدورية المستحقة خلال عدد أيام.
   *
   * تُستبعد السجلات الملغاة: إلغاء عمل الصيانة يُبطل جدولته، فلا يبقى موعده التالي
   * «مستحقًا». أما المكتملة فتبقى محتسَبة عمدًا — `nextDueDate` يُكتب عند إتمام
   * الصيانة ليدلّ على موعد الخدمة القادمة، فهي **مصدر** التنبيه لا استثناء منه
   * (الحالة الافتراضية عند الإنشاء هي COMPLETED أصلًا؛ استبعادها يُفرغ المؤشر).
   *
   * الحدّ الأعلى نهاية اليوم المحلي لا لحظة التنفيذ، فلا يعتمد الناتج على ساعة الطلب.
   */
  async dueMaintenance(days = MAINTENANCE_DUE_ALERT_DAYS) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    until.setHours(23, 59, 59, 999);
    return prisma.maintenanceRecord.findMany({
      where: {
        nextDueDate: { not: null, lte: until },
        status: { not: 'CANCELLED' },
      },
      orderBy: { nextDueDate: 'asc' },
      include: { equipment: { select: { id: true, code: true, name: true } } },
    });
  }

  // ===== الوقود =====
  async listFuel(equipmentId?: number) {
    return prisma.fuelLog.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      orderBy: { date: 'desc' },
      include: { equipment: { select: { code: true, name: true } } },
    });
  }

  async addFuel(input: CreateFuelInput, req: Request) {
    await assertEquipment(input.equipmentId);
    const log = await prisma.fuelLog.create({ data: input });
    await recordAudit({ req, action: 'CREATE', module: 'maintenance', entityId: log.id, newValue: { fuel: input.liters } });
    return log;
  }

  // ===== الأعطال =====
  async listBreakdowns(equipmentId?: number, status?: string) {
    return prisma.breakdown.findMany({
      where: { equipmentId: equipmentId ?? undefined, status: status ?? undefined },
      orderBy: { reportedAt: 'desc' },
      include: { equipment: { select: { code: true, name: true } } },
    });
  }

  async reportBreakdown(input: CreateBreakdownInput, req: Request) {
    await assertEquipment(input.equipmentId);
    const breakdown = await prisma.$transaction(async (tx) => {
      const b = await tx.breakdown.create({ data: input });
      // عطل حرج → نضع المعدة كمتعطّلة
      if (input.severity === 'CRITICAL' || input.severity === 'HIGH') {
        await tx.equipment.update({ where: { id: input.equipmentId }, data: { status: 'NOT_WORKING' } });
      }
      return b;
    });
    await recordAudit({ req, action: 'CREATE', module: 'maintenance', entityId: breakdown.id, newValue: { breakdown: input.severity } });
    return breakdown;
  }

  async resolveBreakdown(id: number, req: Request) {
    const breakdown = await prisma.breakdown.findUnique({ where: { id } });
    if (!breakdown) throw AppError.notFound('العطل غير موجود');
    const updated = await prisma.$transaction(async (tx) => {
      const b = await tx.breakdown.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      // إن لم تعد هناك أعطال مفتوحة نعيد المعدة للتشغيل
      const openCount = await tx.breakdown.count({ where: { equipmentId: breakdown.equipmentId, status: 'OPEN' } });
      if (openCount === 0) {
        await tx.equipment.update({ where: { id: breakdown.equipmentId }, data: { status: 'WORKING' } });
      }
      return b;
    });
    await recordAudit({ req, action: 'UPDATE', module: 'maintenance', entityId: id, newValue: { resolved: true } });
    return updated;
  }

  // ===== قطع الغيار =====
  async listSpareParts(equipmentId?: number) {
    return prisma.sparePartUsage.findMany({
      where: equipmentId ? { equipmentId } : undefined,
      orderBy: { date: 'desc' },
      include: { equipment: { select: { code: true, name: true } } },
    });
  }

  async addSparePart(input: CreateSparePartInput, req: Request) {
    await assertEquipment(input.equipmentId);
    const totalCost = Math.round(input.quantity * input.unitCost * 1000) / 1000;
    const part = await prisma.sparePartUsage.create({ data: { ...input, totalCost } });
    await recordAudit({ req, action: 'CREATE', module: 'maintenance', entityId: part.id, newValue: { part: input.partName } });
    return part;
  }
}

export const maintenanceService = new MaintenanceService();
