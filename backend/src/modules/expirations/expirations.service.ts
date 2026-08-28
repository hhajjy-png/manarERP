import { prisma } from '@config/database';
import type { ExpirationFilters } from './expirations.schema';
import { buildExcel } from '@shared/services/reportEngine/excel.service';
import type { ReportColumn } from '@shared/services/reportEngine/excel.service';
import { formatDisplayDate } from '@shared/utils/dateDisplay';
import { daysUntil } from '@core/utils/daysRemaining';
import { EXPIRATION_CENTER_BANDS } from '@config/thresholds';
import { vehicleInsuranceService } from '@modules/vehicleInsurance/vehicleInsurance.service';

/**
 * مركز انتهاء الوثائق — طبقة **تجميع للقراءة فقط** (Aggregation / Read Model).
 *
 * لا جدول لهذا المركز ولا نسخة مخزَّنة من أي تاريخ: كل صف يُقرأ عند الطلب من السجل
 * الأصلي المالك للمعلومة، فتعديل التاريخ في وحدته ينعكس هنا فورًا بلا مزامنة ولا
 * إدخال ثانٍ. لا يكتب هذا الملف في أي جدول إطلاقًا.
 *
 * ── تصحيح 2026-08-28 (Single Source of Truth Audit v1) ──────────────────────
 * `EQUIPMENT_INSURANCE` كان يُقرأ من `equipment.insuranceExpiry` — نسخة قديمة لا تكتب
 * فيها أي شاشة (ليست في `createEquipmentSchema` ولا في نموذج المعدات ولا في المستورِد)
 * ولا تلمسها وحدة تأمين المركبات. أي تجديد تأمين كان يترك المركز على قيمة مجمَّدة.
 * صار المصدر هو الوثيقة الحالية في `VehicleInsurancePolicy` عبر
 * `vehicleInsuranceService.listCurrentExpiries()` — نفس تعريف «الوثيقة الحالية» الذي
 * تعرضه شاشة التأمين، معرَّفًا هناك مرة واحدة.
 */

export type DocCategory =
  | 'EMPLOYEE_RESIDENCY'
  | 'EMPLOYEE_PASSPORT'
  | 'EMPLOYEE_DRIVING_LICENSE'
  | 'EMPLOYEE_VEHICLE_LICENSE'
  | 'EQUIPMENT_REGISTRATION'
  | 'EQUIPMENT_INSURANCE'
  | 'CONTRACT_EXPIRY';

/** الوحدة **المالكة** للتاريخ. تُعرض في لوحة التفاصيل كي يمكن التحقق يدويًا من المصدر. */
export type SourceModule = 'employees' | 'equipment' | 'vehicleInsurance' | 'contracts';

/**
 * خريطة «نوع الوثيقة ← مصدرها الرسمي». مصدر واحد لكل نوع، بلا سجلّ ضخم ولا استثناءات:
 * كل قيمة هنا هي الوحدة التي يُحرَّر فيها التاريخ فعليًا في النظام.
 */
export const CANONICAL_SOURCE: Record<DocCategory, SourceModule> = {
  EMPLOYEE_RESIDENCY:       'employees',        // employee.residencyExpiry
  EMPLOYEE_PASSPORT:        'employees',        // employee.passportExpiry
  EMPLOYEE_DRIVING_LICENSE: 'employees',        // employee.licenseExpiry
  EMPLOYEE_VEHICLE_LICENSE: 'employees',        // employee.vehicleLicenseExpiry
  EQUIPMENT_REGISTRATION:   'equipment',        // equipment.registrationExpiry
  EQUIPMENT_INSURANCE:      'vehicleInsurance', // vehicle_insurance_policies.endDate (الوثيقة الحالية)
  CONTRACT_EXPIRY:          'contracts',        // contract.endDate
};

export type UrgencyBand = 'expired' | '7' | '30' | '60' | '90' | 'ok';

export interface ExpirationRecord {
  id: string;
  category: DocCategory;
  /** الوحدة المالكة للتاريخ — مشتقّة من `CANONICAL_SOURCE`, لا تُمرَّر يدويًا. */
  sourceModule: SourceModule;
  entityId: number;
  entityName: string;
  entityCode: string;
  expiryDate: string;
  daysRemaining: number;
  urgency: UrgencyBand;
}

/**
 * عدّادات البطاقات. كلها مشتقّة من **نفس** مجموعة `fetchAll` التي يعرضها الجدول، وبنفس
 * تعريف النطاقات، فلا يمكن أن تفترق بطاقة عن صفوفها:
 *
 *   `total`      = كل الصفوف (= عدد صفوف الجدول بلا فلاتر)  = مجموع النطاقات الستة
 *   `actionable` = `total − ok` (ما يحتاج متابعة) — تستعمله ودجة لوحة المعلومات للإخفاء
 */
export interface ExpirationSummary {
  expired: number;
  days7: number;
  days30: number;
  days60: number;
  days90: number;
  ok: number;
  actionable: number;
  total: number;
}

function urgencyBand(days: number): UrgencyBand {
  const B = EXPIRATION_CENTER_BANDS;
  if (days < 0)             return 'expired';
  if (days <= B.critical)   return '7';
  if (days <= B.warning)    return '30';
  if (days <= B.notice)     return '60';
  if (days <= B.watch)      return '90';
  return 'ok';
}

function buildRecord(
  category: DocCategory,
  entityId: number,
  entityName: string,
  entityCode: string,
  expiryDate: Date,
  now: Date,
): ExpirationRecord {
  // كان `Math.floor((expiry − now) / 86_400_000)` بطابع زمني حيّ: تواريخ الوثائق
  // تُخزَّن عند منتصف ليل UTC، فبعد منتصف ليل اليوم يصير الفرق سالبًا ويُقرَّب لأسفل —
  // فوثيقة تنتهي **اليوم** كانت تُعرض «منتهية» طوال يومها الأخير، بينما تعرضها وحدتا
  // التأمين والمعدات «سارية اليوم». العقد المشترك يوحّد الإجابة.
  const daysRemaining = daysUntil(expiryDate, now);
  return {
    id: `${category}-${entityId}`,
    category,
    sourceModule: CANONICAL_SOURCE[category],
    entityId,
    entityName,
    entityCode,
    expiryDate: expiryDate.toISOString().slice(0, 10),
    daysRemaining,
    urgency: urgencyBand(daysRemaining),
  };
}

export class ExpirationsService {
  /**
   * المجموعة الموحَّدة التي تُشتقّ منها **كل** مخرجات الشاشة: الجدول والبطاقات والفلاتر
   * والبحث والتصدير. لا استعلام ثانٍ بتعريف مختلف في أي مسار.
   *
   * حقل بلا تاريخ في مصدره لا يُنتج صفًا إطلاقًا — لا تاريخ مخترع ولا رجوع إلى
   * `createdAt`. «غير محدد» يعني غياب الصف، وهو السلوك القائم منذ البداية.
   */
  private async fetchAll(now: Date): Promise<ExpirationRecord[]> {
    const [employees, equipment, insuranceExpiries, contracts] = await Promise.all([
      prisma.employee.findMany({
        where: { status: { not: 'TERMINATED' } },
        select: {
          id: true, code: true, fullName: true,
          residencyExpiry: true, passportExpiry: true,
          licenseExpiry: true, vehicleLicenseExpiry: true,
        },
      }),
      // `insuranceExpiry` **غير** مقروء عمدًا — مصدر التأمين الرسمي هو وحدة تأمين المركبات.
      prisma.equipment.findMany({
        select: { id: true, code: true, name: true, registrationExpiry: true },
      }),
      vehicleInsuranceService.listCurrentExpiries(),
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
    }
    for (const ins of insuranceExpiries) {
      records.push(buildRecord('EQUIPMENT_INSURANCE', ins.equipmentId, ins.equipmentName ?? ins.equipmentCode, ins.equipmentCode, ins.endDate, now));
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

  /**
   * عدّادات البطاقات — من نفس `fetchAll` التي يقرأها الجدول.
   *
   * كان `total` يعدّ الصفوف **غير** السارية وحدها بينما يعرض الجدول تحت فلتر «الكل» كل
   * الصفوف: بطاقة تقول 18 وجدول تحته يقول 137 عن المجموعة نفسها. صار `total` مجموع
   * النطاقات الستة كاملة — أي عدد صفوف الجدول بلا فلاتر بالضبط — وأُفرد `actionable`
   * للمعنى القديم (ما يحتاج متابعة) الذي تعتمد عليه ودجة لوحة المعلومات في إخفاء نفسها.
   */
  async summary(): Promise<ExpirationSummary> {
    const now = new Date();
    const records = await this.fetchAll(now);
    const s: ExpirationSummary = {
      expired: 0, days7: 0, days30: 0, days60: 0, days90: 0, ok: 0, actionable: 0, total: 0,
    };
    for (const r of records) {
      s.total++;
      if (r.urgency === 'expired') s.expired++;
      else if (r.urgency === '7')  s.days7++;
      else if (r.urgency === '30') s.days30++;
      else if (r.urgency === '60') s.days60++;
      else if (r.urgency === '90') s.days90++;
      else s.ok++;
    }
    s.actionable = s.total - s.ok;
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
        // `ExpirationRecord.expiryDate` يبقى `YYYY-MM-DD` قانونيًا — الواجهة تفرز
        // عليه معجميًا (SortableHeader على `expiryDate`)، والفرز على `DD/MM/YYYY`
        // كان سيصبح خاطئًا. التحويل إلى صيغة العرض يحدث هنا، عند التصدير وحده.
        expiryDate:    formatDisplayDate(r.expiryDate),
        daysRemaining: r.daysRemaining,
        urgency:       r.urgency,
      })),
    });
  }
}

export const expirationsService = new ExpirationsService();
