/**
 * إنشاء قالب Excel لاستيراد الموظفين برؤوس أعمدة عربية صحيحة.
 * التشغيل من مجلد backend:  npm run template:employees
 */
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

const HEADERS = [
  'الرقم الوظيفي',
  'اسم الموظف (بالعربي)',
  'اسم الموظف (بالإنجليزي)',
  'الرقم المدني',
  'المهنة',
  'تاريخ انتهاء الإقامة',
  'الجنسية',
  'رقم جواز السفر',
  'تاريخ انتهاء جواز السفر',
  'تاريخ انتهاء رخصة القيادة',
  'رقم لوحة المركبة',
  'تاريخ انتهاء رخصة المركبة',
  'تاريخ الميلاد',
  'الشركة',
  'العنوان',
  'الراتب الشهري',
  'حالة الموظف',
];

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الموظفون', { views: [{ rightToLeft: true }] });

  ws.addRow(HEADERS);
  ws.getRow(1).height = 24;
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4E6F' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // صف مثال توضيحي (احذفه أو استبدله ببياناتك)
  ws.addRow([
    'EMP-0001', 'عبدالله الزهراني', 'Abdullah Alzahrani', '285010112345', 'مدير عقود',
    '2026-09-15', 'سعودي', 'K1234567', '2028-04-20', '2027-02-10', '12345', '2027-05-01', '1985-01-12',
    'المنار', 'حولي - الكويت', 1800, 'نشط',
  ]);

  ws.columns.forEach((c) => (c.width = 20));

  const outDir = path.resolve(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'قالب-الموظفين.xlsx');
  await wb.xlsx.writeFile(file);

  console.log('✅ تم إنشاء القالب في:');
  console.log('   ' + file);
  console.log('\nافتحه، الصق بيانات موظفيك تحت رؤوس الأعمدة (احتفظ بصف العناوين)، ثم احفظه.');
  console.log('قيم «حالة الموظف» المسموحة: نشط / إجازة / منتهي الخدمة');
  console.log('صيغة التواريخ: YYYY-MM-DD (مثل 2026-09-15) أو DD/MM/YYYY');
}

main();
