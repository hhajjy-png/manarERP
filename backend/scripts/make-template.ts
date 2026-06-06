/**
 * إنشاء قالب Excel لأي وحدة.
 * التشغيل من مجلد backend:
 *   npm run template -- <الوحدة>
 * أمثلة:
 *   npm run template -- employees
 *   npm run template -- equipment
 *   npm run template -- contracts
 *   npm run template -- customers
 * أو بدون وحدة لإنشاء كل القوالب دفعة واحدة:
 *   npm run template
 */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { ENTITIES, ImportEntity } from './import-config';

const TEMPLATE_NAMES: Record<string, string> = {
  employees: 'قالب-الموظفين.xlsx',
  equipment: 'قالب-المعدات.xlsx',
  contracts: 'قالب-العقود.xlsx',
  customers: 'قالب-العملاء.xlsx',
};

async function buildTemplate(key: string, entity: ImportEntity, outDir: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(entity.sheet, { views: [{ rightToLeft: true }] });

  ws.addRow(entity.fields.map((f) => f.header));
  ws.getRow(1).height = 24;
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E6F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // صف مثال
  ws.addRow(entity.fields.map((f) => f.example ?? ''));
  ws.columns.forEach((c) => (c.width = 20));

  const file = path.join(outDir, TEMPLATE_NAMES[key] ?? `قالب-${key}.xlsx`);
  await wb.xlsx.writeFile(file);
  console.log('✅ ' + file);
}

async function main() {
  const key = process.argv[2];
  const outDir = path.resolve(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });

  if (key) {
    const entity = ENTITIES[key];
    if (!entity) {
      console.error('وحدة غير معروفة. المتاح: ' + Object.keys(ENTITIES).join(' | '));
      process.exit(1);
    }
    await buildTemplate(key, entity, outDir);
  } else {
    for (const [k, entity] of Object.entries(ENTITIES)) await buildTemplate(k, entity, outDir);
  }
  console.log('\nافتح القالب، الصق بياناتك تحت العناوين، احفظه، ثم نفّذ الاستيراد:');
  console.log('  npm run import -- <الوحدة> "data\\اسم-الملف.xlsx"');
}

main();
