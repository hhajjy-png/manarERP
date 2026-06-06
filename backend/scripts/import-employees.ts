/**
 * استيراد الموظفين من ملف Excel إلى قاعدة بيانات المشروع.
 * التشغيل من مجلد backend:
 *   npm run import:employees -- "data\قالب-الموظفين.xlsx"
 *
 * يقرأ الأعمدة حسب رؤوسها العربية (الترتيب لا يهم)، ويتجاهل أي عمود غير معروف.
 * يُحدّث الموظف إن كان رقمه الوظيفي موجودًا، أو يضيفه (Upsert).
 */
import 'dotenv/config';
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// رؤوس الأعمدة المقبولة (مع مرادفات) → اسم الحقل في قاعدة البيانات
const HEADER_MAP: Record<string, string> = {
  'الرقم الوظيفي': 'code',
  'اسم الموظف (بالعربي)': 'fullName',
  'الاسم بالعربي': 'fullName',
  'الاسم (عربي)': 'fullName',
  'الاسم': 'fullName',
  'اسم الموظف (بالإنجليزي)': 'fullNameEn',
  'الاسم بالإنجليزي': 'fullNameEn',
  'الاسم (إنجليزي)': 'fullNameEn',
  'الرقم المدني': 'civilId',
  'المهنة': 'jobTitle',
  'الوظيفة': 'jobTitle',
  'تاريخ انتهاء الإقامة': 'residencyExpiry',
  'انتهاء الإقامة': 'residencyExpiry',
  'الجنسية': 'nationality',
  'رقم جواز السفر': 'passportNumber',
  'رقم الجواز': 'passportNumber',
  'تاريخ انتهاء جواز السفر': 'passportExpiry',
  'انتهاء الجواز': 'passportExpiry',
  'تاريخ انتهاء رخصة القيادة': 'licenseExpiry',
  'انتهاء رخصة القيادة': 'licenseExpiry',
  'رقم لوحة المركبة': 'vehiclePlate',
  'لوحة المركبة': 'vehiclePlate',
  'تاريخ انتهاء رخصة المركبة': 'vehicleLicenseExpiry',
  'انتهاء رخصة المركبة': 'vehicleLicenseExpiry',
  'تاريخ الميلاد': 'birthDate',
  'الشركة': 'company',
  'العنوان': 'address',
  'الراتب الشهري': 'salary',
  'الراتب': 'salary',
  'حالة الموظف': 'status',
  'الحالة': 'status',
};

const DATE_FIELDS = new Set(['residencyExpiry', 'passportExpiry', 'licenseExpiry', 'vehicleLicenseExpiry', 'birthDate']);
const STATUS_MAP: Record<string, string> = {
  'نشط': 'ACTIVE', 'فعال': 'ACTIVE',
  'إجازة': 'ON_LEAVE', 'في إجازة': 'ON_LEAVE', 'اجازة': 'ON_LEAVE',
  'منتهي الخدمة': 'TERMINATED', 'منتهي': 'TERMINATED', 'مفصول': 'TERMINATED',
};

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/); // DD/MM/YYYY
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/); // YYYY-MM-DD
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('الاستخدام: npm run import:employees -- "مسار الملف.xlsx"');
    process.exit(1);
  }
  const filePath = path.resolve(process.cwd(), fileArg);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  if (!ws) {
    console.error('الملف لا يحتوي على أوراق عمل.');
    process.exit(1);
  }

  // ربط أرقام الأعمدة بالحقول عبر صف العناوين (الصف الأول)
  const colToField: Record<number, string> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const field = HEADER_MAP[norm(cell.text)];
    if (field) colToField[col] = field;
  });

  if (!Object.values(colToField).includes('fullName')) {
    console.error('✖ لم يُعثر على عمود «اسم الموظف (بالعربي)». تأكّد من رؤوس الأعمدة في الصف الأول.');
    console.error('  الأعمدة المتوقّعة مثل: الرقم الوظيفي، اسم الموظف (بالعربي)، الرقم المدني، المهنة ...');
    process.exit(1);
  }

  let ok = 0, fail = 0;
  let codeSeq = await prisma.employee.count();
  const errors: string[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.actualCellCount === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const [colStr, field] of Object.entries(colToField)) {
      const cell = row.getCell(Number(colStr));
      let val: unknown = cell.value;
      if (val && typeof val === 'object' && 'text' in (val as object)) val = (val as { text: string }).text;

      if (DATE_FIELDS.has(field)) data[field] = parseDate(val);
      else if (field === 'salary') data[field] = Number(String(val ?? '0').replace(/[^\d.]/g, '')) || 0;
      else if (field === 'status') data[field] = STATUS_MAP[norm(val)] ?? 'ACTIVE';
      else data[field] = val == null ? null : String(val).trim();
    }

    if (!data.fullName) continue; // صف فارغ
    if (!data.code) {
      if (data.civilId) data.code = `EMP-${data.civilId}`; // ثابت عند إعادة الاستيراد
      else { codeSeq++; data.code = `EMP-${String(codeSeq).padStart(4, '0')}`; }
    }
    if (!data.status) data.status = 'ACTIVE';

    try {
      await prisma.employee.upsert({ where: { code: data.code }, update: data, create: data });
      ok++;
    } catch (e) {
      fail++;
      errors.push(`صف ${r} (${data.fullName}): ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ تم استيراد/تحديث ${ok} موظفًا.${fail ? `  ✖ فشل ${fail}.` : ''}`);
  if (errors.length) {
    console.log('\nتفاصيل الأخطاء (أول 20):');
    console.log(errors.slice(0, 20).join('\n'));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('✖ فشل الاستيراد:', e);
  process.exit(1);
});
