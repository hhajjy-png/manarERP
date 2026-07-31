import { ENUMS } from '../../../config/constants';
import { parseImportDate } from '../../../shared/utils/dateParse';

export interface NormalizedEquipment {
  code: string;
  type: string;
  ownerName?: string;
  driverName?: string;
  plateNumber?: string;
  chassisNumber?: string;
  color?: string;
  registrationExpiry?: Date;
  status: 'WORKING' | 'NOT_WORKING';
  name?: string;
  manufacturer?: string;
  model?: string;
  manufactureYear?: number;
  serialNumber?: string;
  currentLocation?: string;
  operatingHours: number;
  purchaseDate?: Date;
  purchaseCost?: number;
  notes?: string;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

/**
 * تاريخ اختياري بآلية التحقق القائمة نفسها (عقود/مصروفات/فواتير): الفراغ يعني
 * «غير مذكور» فيمرّ، أما قيمة **موجودة تفشل في التحليل** فتُنتج **خطأ صفّ**.
 *
 * كانت `parseImportDate(v) ?? undefined` تبتلع الفشل بصمت، فيُستورَد الصفّ
 * «صالحًا» وقد سقط منه تاريخٌ كتبه المستخدم فعلًا — بلا أي إشعار. الصيغ المقبولة
 * لم تتغيّر إطلاقًا (انظر `shared/utils/dateParse`)؛ المتغيّر الوحيد هو أن الفشل
 * صار مرئيًا بدل أن يُهمَل.
 */
function optionalDate(
  row: Record<string, unknown>,
  key: string,
  labelAr: string,
  errors: string[],
): Date | undefined {
  const raw = row[key];
  if (raw == null || raw === '') return undefined;
  const d = parseImportDate(raw);
  if (!d) {
    errors.push(`${labelAr} (${key}) يجب أن يكون بصيغة YYYY-MM-DD`);
    return undefined;
  }
  return d;
}

function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function parseOptionalPositiveInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseInt(String(v), 10);
  return isNaN(n) || n < 1900 || n > 2100 ? undefined : n;
}

export function validateEquipmentRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedEquipment | null;
} {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('رقم المعدة (code) مطلوب');

  const type = str(row, 'type');
  if (!type) errors.push('نوع المعدة (type) مطلوب');

  const rawStatus = str(row, 'status');
  const status = (ENUMS.equipmentStatus as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as 'WORKING' | 'NOT_WORKING')
    : 'WORKING';

  // التواريخ تُحلَّل **قبل** بوّابة الأخطاء أدناه — دفعُها داخل `normalized` كان
  // سيقع بعد البوّابة، فيعود الصفّ `valid: true, errors: []` رغم الخطأ.
  const registrationExpiry = optionalDate(row, 'registrationExpiry', 'تاريخ انتهاء دفتر المركبة', errors);
  const purchaseDate       = optionalDate(row, 'purchaseDate',       'تاريخ الشراء',              errors);

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      type: type!,
      ownerName: str(row, 'ownerName'),
      driverName: str(row, 'driverName'),
      plateNumber: str(row, 'plateNumber'),
      // أعمدة اختيارية: ملفّ استيراد قديم لا يحملها ⇒ undefined كما لو لم تُذكر.
      chassisNumber: str(row, 'chassisNumber'),
      color: str(row, 'color'),
      registrationExpiry,
      status,
      name: str(row, 'name'),
      manufacturer: str(row, 'manufacturer'),
      model: str(row, 'model'),
      manufactureYear: parseOptionalPositiveInt(row['manufactureYear']),
      serialNumber: str(row, 'serialNumber'),
      currentLocation: str(row, 'currentLocation'),
      operatingHours: parseNumber(row['operatingHours']),
      purchaseDate,
      purchaseCost: row['purchaseCost'] != null && row['purchaseCost'] !== '' ? parseNumber(row['purchaseCost']) : undefined,
      notes: str(row, 'notes'),
    },
  };
}
