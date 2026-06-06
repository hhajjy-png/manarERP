/**
 * استيراد عام من Excel لأي وحدة (موظفون/معدات/عقود/عملاء).
 * التشغيل من مجلد backend:
 *   npm run import -- <الوحدة> "مسار الملف.xlsx"
 * أمثلة:
 *   npm run import -- employees "data\قالب-الموظفين.xlsx"
 *   npm run import -- equipment "data\قالب-المعدات.xlsx"
 *   npm run import -- contracts "data\قالب-العقود.xlsx"
 *   npm run import -- customers "data\قالب-العملاء.xlsx"
 */
import 'dotenv/config';
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { ENTITIES, FieldDef } from './import-config';

const prisma = new PrismaClient();

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** استخراج القيمة الأساسية من خلية ExcelJS (تتعامل مع الصيغ والنص المنسّق والروابط). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cellPrimitive(cell: any): unknown {
  const v = cell?.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return v.result; // خلية صيغة → نتيجتها
    if ('text' in v) return v.text; // رابط/نص
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t: { text: string }) => t.text).join('');
    return cell.text ?? null; // احتياطي: النص المعروض
  }
  return v;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function convert(def: FieldDef, raw: unknown): unknown {
  if (def.type === 'date') return parseDate(raw);
  if (def.type === 'number') return Number(String(raw ?? '0').replace(/[^\d.\-]/g, '')) || 0;
  if (def.type === 'enum') {
    const key = norm(raw);
    return def.enumMap?.[key] ?? Object.values(def.enumMap ?? {})[0] ?? null;
  }
  const v = norm(raw);
  return v === '' ? null : v;
}

async function main() {
  const entityKey = process.argv[2];
  const fileArg = process.argv[3];
  const entity = entityKey ? ENTITIES[entityKey] : undefined;

  if (!entity || !fileArg) {
    console.error('الاستخدام: npm run import -- <الوحدة> "مسار الملف.xlsx"');
    console.error('الوحدات المتاحة: ' + Object.keys(ENTITIES).join(' | '));
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(process.cwd(), fileArg));
  if (wb.worksheets.length === 0) { console.error('الملف لا يحتوي على أوراق عمل.'); process.exit(1); }

  const headerToDef = new Map<string, FieldDef>();
  for (const def of entity.fields) {
    headerToDef.set(def.header, def);
    (def.aliases ?? []).forEach((a) => headerToDef.set(a, def));
  }

  // اختيار الورقة الصحيحة + صف العناوين تلقائيًا عبر فحص كل الأوراق (الأكثر تطابقًا)
  let ws = wb.worksheets[0];
  let headerRowIndex = 1;
  let bestMatches = -1;
  for (const sheet of wb.worksheets) {
    const scan = Math.min(20, sheet.rowCount || 0);
    for (let r = 1; r <= scan; r++) {
      let matches = 0;
      sheet.getRow(r).eachCell((cell) => { if (headerToDef.has(norm(cell.text))) matches++; });
      if (matches > bestMatches) { bestMatches = matches; ws = sheet; headerRowIndex = r; }
    }
  }

  const colToDef: Record<number, FieldDef> = {};
  ws.getRow(headerRowIndex).eachCell((cell, col) => {
    const def = headerToDef.get(norm(cell.text));
    if (def) colToDef[col] = def;
  });

  const requiredMissing = entity.fields.filter((f) => f.required && !Object.values(colToDef).includes(f));
  if (requiredMissing.length) {
    console.error(`✖ أعمدة مطلوبة غير موجودة في الملف: ${requiredMissing.map((f) => `«${f.header}»`).join('، ')}`);
    console.error('  تأكّد من وجود رؤوس الأعمدة (يمكن أن تسبقها صفوف عنوان).');
    process.exit(1);
  }
  console.log(`الورقة: «${ws.name}» — صف العناوين: ${headerRowIndex} — أعمدة مطابقة: ${Object.keys(colToDef).length}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[entity.model];
  let ok = 0, fail = 0, codeSeq = await delegate.count();
  const errors: string[] = [];

  for (let r = headerRowIndex + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (row.actualCellCount === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const [colStr, def] of Object.entries(colToDef)) {
      const cell = row.getCell(Number(colStr));
      data[def.field] = convert(def, cellPrimitive(cell));
    }

    // توليد رمز تلقائي إن غاب — فقط للوحدات التي مفتاحها هو code
    if (entity.upsertKey === 'code' && !data.code) {
      if (data.civilId) data.code = `${entity.codePrefix}-${data.civilId}`;
      else { codeSeq++; data.code = `${entity.codePrefix}-${String(codeSeq).padStart(4, '0')}`; }
    }

    // تخطّي صفوف المجاميع/الفارغة: أي حقل مطلوب ناقص يعني أن الصف ليس بيانات
    const missingRequired = entity.fields.some((f) => f.required && (data[f.field] == null || data[f.field] === ''));
    if (missingRequired) continue;

    try {
      await delegate.upsert({ where: { [entity.upsertKey]: data[entity.upsertKey] }, update: data, create: data });
      ok++;
    } catch (e) {
      fail++;
      errors.push(`صف ${r}: ${(e as Error).message}`);
    }
  }

  console.log(`\n✅ [${entity.label}] تم استيراد/تحديث ${ok} سجلًا.${fail ? `  ✖ فشل ${fail}.` : ''}`);
  if (errors.length) {
    console.log('\nتفاصيل الأخطاء (أول 20):');
    console.log(errors.slice(0, 20).join('\n'));
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error('✖ فشل الاستيراد:', e); process.exit(1); });
