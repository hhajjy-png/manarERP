import { ENUMS } from '../../../config/constants';
import { parseImportDate } from '../../../shared/utils/dateParse';

// ── Arabic header → English key mapping (employee import only) ────────────────

const ARABIC_HEADER_MAP: Record<string, string> = {
  'الرقم الوظيفي':             'code',
  'كود الموظف':                'code',
  'اسم الموظف':                'fullName',
  'الاسم العربي':              'fullName',
  'الاسم بالعربي':             'fullName',
  'اسم الموظف بالإنجليزي':    'fullNameEn',
  'الاسم بالإنجليزي':         'fullNameEn',
  'الرقم المدني':              'civilId',
  'المهنة':                    'jobTitle',
  'الجنسية':                   'nationality',
  'رقم جواز السفر':            'passportNumber',
  'تاريخ انتهاء جواز السفر':  'passportExpiry',
  'تاريخ انتهاء الإقامة':     'residencyExpiry',
  'تاريخ انتهاء رخصة القيادة': 'licenseExpiry',
  'رقم لوحة المركبة':         'vehiclePlate',
  'تاريخ انتهاء رخصة المركبة': 'vehicleLicenseExpiry',
  'تاريخ الميلاد':             'birthDate',
  'الشركة':                    'company',
  'القسم':                     'department',
  'الراتب الشهري':             'salary',
  'تاريخ التعيين':             'hireDate',
  'الهاتف':                    'phone',
  'البريد الإلكتروني':         'email',
  'العنوان':                   'address',
  'حالة الموظف':               'status',
  'ملاحظات':                   'notes',
};

// Arabic keys are translated to English keys. If the English key is already
// present in the row it takes precedence (English header files keep working).
// Keys are trimmed first to tolerate Excel headers with leading/trailing spaces.
function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  // First pass: rebuild with trimmed keys
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    trimmed[k.trim()] = v;
  }
  // Second pass: translate Arabic keys to English
  const result: Record<string, unknown> = { ...trimmed };
  for (const [arabicKey, englishKey] of Object.entries(ARABIC_HEADER_MAP)) {
    if (arabicKey in trimmed && !(englishKey in trimmed)) {
      result[englishKey] = trimmed[arabicKey];
    }
  }
  return result;
}

export interface NormalizedEmployee {
  code: string;
  fullName: string;
  fullNameEn?: string;
  civilId?: string;
  jobTitle?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  residencyExpiry?: Date;
  licenseExpiry?: Date;
  vehiclePlate?: string;
  vehicleLicenseExpiry?: Date;
  birthDate?: Date;
  company?: string;
  department?: string;
  salary: number;
  hireDate?: Date;
  phone?: string;
  email?: string;
  address?: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateEmployeeRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedEmployee | null;
} {
  const row_ = normalizeHeaders(row);
  const errors: string[] = [];

  const code = str(row_, 'code');
  if (!code) errors.push('الرقم الوظيفي (code) مطلوب');

  const fullName = str(row_, 'fullName');
  if (!fullName) errors.push('الاسم الكامل (fullName) مطلوب');

  const rawEmail = str(row_, 'email');
  if (rawEmail && !isValidEmail(rawEmail)) errors.push('البريد الإلكتروني غير صحيح');

  const rawStatus = str(row_, 'status');
  const status = (ENUMS.employeeStatus as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED')
    : 'ACTIVE';

  // التواريخ تُحلَّل **قبل** بوّابة الأخطاء أدناه — دفعُها داخل `normalized` كان
  // سيقع بعد البوّابة، فيعود الصفّ `valid: true, errors: []` رغم الخطأ.
  const passportExpiry       = optionalDate(row_, 'passportExpiry',       'تاريخ انتهاء الجواز',       errors);
  const residencyExpiry      = optionalDate(row_, 'residencyExpiry',      'تاريخ انتهاء الإقامة',      errors);
  const licenseExpiry        = optionalDate(row_, 'licenseExpiry',        'تاريخ انتهاء رخصة القيادة', errors);
  const vehicleLicenseExpiry = optionalDate(row_, 'vehicleLicenseExpiry', 'تاريخ انتهاء رخصة المركبة', errors);
  const birthDate            = optionalDate(row_, 'birthDate',            'تاريخ الميلاد',             errors);
  const hireDate             = optionalDate(row_, 'hireDate',             'تاريخ التعيين',             errors);

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      fullName: fullName!,
      fullNameEn: str(row_, 'fullNameEn'),
      civilId: str(row_, 'civilId'),
      jobTitle: str(row_, 'jobTitle'),
      nationality: str(row_, 'nationality'),
      passportNumber: str(row_, 'passportNumber'),
      passportExpiry,
      residencyExpiry,
      licenseExpiry,
      vehiclePlate: str(row_, 'vehiclePlate'),
      vehicleLicenseExpiry,
      birthDate,
      company: str(row_, 'company'),
      department: str(row_, 'department'),
      salary: parseNumber(row_['salary']),
      hireDate,
      phone: str(row_, 'phone'),
      email: rawEmail || undefined,
      address: str(row_, 'address'),
      status,
      notes: str(row_, 'notes'),
    },
  };
}
