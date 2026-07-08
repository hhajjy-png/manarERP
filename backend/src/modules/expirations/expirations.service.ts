import { prisma } from '@config/database';
import type { ExpirationFilters } from './expirations.schema';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import type { ReportColumn } from '@shared/services/reportEngine/excel.service';

export type DocCategory =
  | 'EMPLOYEE_RESIDENCY'
  | 'EMPLOYEE_PASSPORT'
  | 'EMPLOYEE_DRIVING_LICENSE'
  | 'EMPLOYEE_VEHICLE_LICENSE'
  | 'EQUIPMENT_REGISTRATION'
  | 'EQUIPMENT_INSURANCE'
  | 'CONTRACT_EXPIRY';

export type UrgencyBand = 'expired' | '7' | '30' | '60' | '90' | 'ok';

export interface ExpirationRecord {
  id: string;
  category: DocCategory;
  entityId: number;
  entityName: string;
  entityCode: string;
  expiryDate: string;
  daysRemaining: number;
  urgency: UrgencyBand;
}

export interface ExpirationSummary {
  expired: number;
  days7: number;
  days30: number;
  days60: number;
  days90: number;
  total: number;
}

function urgencyBand(days: number): UrgencyBand {
  if (days < 0)   return 'expired';
  if (days <= 7)  return '7';
  if (days <= 30) return '30';
  if (days <= 60) return '60';
  if (days <= 90) return '90';
  return 'ok';
}

function msToDays(ms: number): number {
  return Math.floor(ms / 86_400_000);
}

function buildRecord(
  category: DocCategory,
  entityId: number,
  entityName: string,
  entityCode: string,
  expiryDate: Date,
  now: Date,
): ExpirationRecord {
  const daysRemaining = msToDays(expiryDate.getTime() - now.getTime());
  return {
    id: `${category}-${entityId}`,
    category,
    entityId,
    entityName,
    entityCode,
    expiryDate: expiryDate.toISOString().slice(0, 10),
    daysRemaining,
    urgency: urgencyBand(daysRemaining),
  };
}

export class ExpirationsService {
  private async fetchAll(now: Date): Promise<ExpirationRecord[]> {
    const [employees, equipment, contracts] = await Promise.all([
      prisma.employee.findMany({
        where: { status: { not: 'TERMINATED' } },
        select: {
          id: true, code: true, fullName: true,
          residencyExpiry: true, passportExpiry: true,
          licenseExpiry: true, vehicleLicenseExpiry: true,
        },
      }),
      prisma.equipment.findMany({
        select: {
          id: true, code: true, name: true,
          registrationExpiry: true, insuranceExpiry: true,
        },
      }),
      prisma.contract.findMany({
        where: { status: { in: ['ACTIVE', 'RENEWING'] }, endDate: { not: null } },
        select: { id: true, code: true, asphaltPlant: true, endDate: true },
      }),
    ]);

    const records: ExpirationRecord[] = [];

    for (const e of employees) {
      if (e.residencyExpiry)      records.push(buildRecord('EMPLOYEE_RESIDENCY',       e.id, e.fullName, e.code, e.residencyExpiry,      now));
      if (e.passportExpiry)       records.push(buildRecord('EMPLOYEE_PASSPORT',        e.id, e.fullName, e.code, e.passportExpiry,        now));
      if (e.licenseExpiry)        records.push(buildRecord('EMPLOYEE_DRIVING_LICENSE', e.id, e.fullName, e.code, e.licenseExpiry,         now));
      if (e.vehicleLicenseExpiry) records.push(buildRecord('EMPLOYEE_VEHICLE_LICENSE', e.id, e.fullName, e.code, e.vehicleLicenseExpiry,  now));
    }
    for (const eq of equipment) {
      if (eq.registrationExpiry) records.push(buildRecord('EQUIPMENT_REGISTRATION', eq.id, eq.name ?? eq.code, eq.code, eq.registrationExpiry, now));
      if (eq.insuranceExpiry)    records.push(buildRecord('EQUIPMENT_INSURANCE',    eq.id, eq.name ?? eq.code, eq.code, eq.insuranceExpiry,    now));
    }
    for (const c of contracts) {
      if (c.endDate) records.push(buildRecord('CONTRACT_EXPIRY', c.id, c.asphaltPlant, c.code, c.endDate, now));
    }

    return records.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  async list(filters: ExpirationFilters): Promise<ExpirationRecord[]> {
    const now = new Date();
    let records = await this.fetchAll(now);

    if (filters.urgency && filters.urgency !== 'all') {
      records = records.filter(r => r.urgency === filters.urgency);
    }
    if (filters.category) {
      records = records.filter(r => r.category === filters.category);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      records = records.filter(r =>
        r.entityName.toLowerCase().includes(q) ||
        r.entityCode.toLowerCase().includes(q),
      );
    }
    return records;
  }

  async summary(): Promise<ExpirationSummary> {
    const now = new Date();
    const records = await this.fetchAll(now);
    const s: ExpirationSummary = { expired: 0, days7: 0, days30: 0, days60: 0, days90: 0, total: 0 };
    for (const r of records) {
      if (r.urgency === 'ok') continue;
      s.total++;
      if (r.urgency === 'expired') s.expired++;
      else if (r.urgency === '7')  s.days7++;
      else if (r.urgency === '30') s.days30++;
      else if (r.urgency === '60') s.days60++;
      else if (r.urgency === '90') s.days90++;
    }
    return s;
  }

  async exportExcel(filters: ExpirationFilters): Promise<Buffer> {
    const records = await this.list(filters);

    const columns: ReportColumn[] = [
      { header: 'التصنيف',        key: 'category',      width: 28 },
      { header: 'الاسم',          key: 'entityName',    width: 28 },
      { header: 'الرمز',          key: 'entityCode',    width: 14 },
      { header: 'تاريخ الانتهاء', key: 'expiryDate',    width: 14 },
      { header: 'الأيام المتبقية', key: 'daysRemaining', width: 14, type: 'number' },
      { header: 'الأولوية',       key: 'urgency',       width: 10 },
    ];

    return buildExcel({
      title:     'تقرير الوثائق منتهية الصلاحية',
      sheetName: 'الوثائق المنتهية',
      columns,
      rows: records.map((r) => ({
        category:      r.category,
        entityName:    r.entityName,
        entityCode:    r.entityCode,
        expiryDate:    r.expiryDate,
        daysRemaining: r.daysRemaining,
        urgency:       r.urgency,
      })),
    });
  }
}

export const expirationsService = new ExpirationsService();
