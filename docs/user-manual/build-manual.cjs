#!/usr/bin/env node
/**
 * بناء دليل مستخدم المنار ERP.
 *
 *   node docs/user-manual/build-manual.cjs
 *
 * ماذا يفعل:
 *   1. يجمع أجزاء المصدر من parts/ في ملف واحد build/manual.html
 *   2. يُصيّره PDF بمقاس A4 عمودي عبر Chromium (ترويسة وتذييل وأرقام صفحات)
 *   3. يستخرج نصّ كل صفحة من PDF ليعرف رقم صفحة كل فصل
 *   4. يكتب أرقام الصفحات في الفهرس ويعيد التصيير
 *   5. ينسخ الناتج إلى build/ و release/docs/
 *
 * لا يمسّ هذا السكربت أي شيء خارج docs/user-manual و release/docs.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PW = 'C:/Users/hhajj/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright-core';
const CHROME = 'C:/Users/hhajj/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const PDFJS = 'C:/Users/hhajj/AppData/Local/npm-cache/_npx/6583fba12287d067/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const PDFLIB = 'C:/Users/hhajj/AppData/Local/npm-cache/_npx/6583fba12287d067/node_modules/@cantoo/pdf-lib';

const ROOT = __dirname;
const PARTS_DIR = path.join(ROOT, 'parts');
const BUILD_DIR = path.join(ROOT, 'build');
const VERSION = '2026.5.9';
const PDF_NAME = `AlManarERP-User-Manual-${VERSION}-AR.pdf`;
const PDF_LATEST = 'AlManarERP-User-Manual-Latest-AR.pdf';
const RELEASE_DIR = path.resolve(ROOT, '..', '..', 'release', 'docs');

const CHAPTERS = [
  ['ch-01', 'عن هذا الدليل'],
  ['ch-02', 'مقدمة عن نظام المنار'],
  ['ch-03', 'البدء: التشغيل والدخول والواجهة'],
  ['ch-04', 'المستخدمون والصلاحيات'],
  ['ch-05', 'الموظفون والكوادر'],
  ['ch-06', 'الرواتب'],
  ['ch-07', 'مستحقات الموظف الشهرية'],
  ['ch-08', 'النماذج الإدارية والإجازات والسندات'],
  ['ch-09', 'محرر النماذج والخطابات الرسمية'],
  ['ch-10', 'الفواتير والمصروفات'],
  ['ch-11', 'الشيكات'],
  ['ch-12', 'معايرة طباعة الشيك'],
  ['ch-13', 'البنوك والحسابات البنكية'],
  ['ch-14', 'استيراد البيانات'],
  ['ch-15', 'المعدات والصيانة وتأمين المركبات'],
  ['ch-16', 'مركز انتهاء الوثائق'],
  ['ch-17', 'المحاسبة والمركز المالي'],
  ['ch-18', 'العملاء والعقود والأسعار وتحليل الشغل'],
  ['ch-19', 'المخزون والمشتريات'],
  ['ch-20', 'التقارير والتحليلات'],
  ['ch-21', 'الطباعة'],
  ['ch-22', 'النسخ الاحتياطي والمزامنة السحابية'],
  ['ch-23', 'الإعدادات وأدوات النظام'],
  ['ch-24', 'يوم عمل نموذجي — المدير'],
  ['ch-25', 'يوم عمل نموذجي — المحاسب'],
  ['ch-26', 'العمليات الشهرية — قائمة تحقّق'],
  ['ch-27', 'الأخطاء الشائعة وحلولها'],
  ['ch-28', 'أفضل الممارسات'],
  ['ch-29', 'مرجع سريع: أريد أن أفعل… اذهب إلى…'],
  ['ch-30', 'مسرد المصطلحات'],
  ['ch-31', 'فهرس الأشكال'],
];

/** يجمع الأجزاء بترتيب اسم الملف. */
function assemble() {
  const files = fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) throw new Error('لا توجد أجزاء في parts/');
  const html = files.map((f) => fs.readFileSync(path.join(PARTS_DIR, f), 'utf8')).join('\n');
  console.log(`  جُمعت ${files.length} أجزاء: ${files.join(', ')}`);
  return html;
}

/** يكتب أرقام الصفحات في عناصر الفهرس. */
function fillToc(html, pageMap) {
  return html.replace(/<span class="p" data-toc="(ch-\d\d)">[^<]*<\/span>/g,
    (m, id) => `<span class="p" data-toc="${id}">${pageMap[id] ?? '—'}</span>`);
}

const HEADER = `
<div style="width:100%;font-family:'Segoe UI',Tahoma,sans-serif;font-size:7pt;color:#7b8699;
            padding:0 18mm;direction:rtl;display:flex;justify-content:space-between;
            border-bottom:.4pt solid #e6eaf2;padding-bottom:2mm;">
  <span>المنار ERP — دليل المستخدم الشامل</span>
  <span style="direction:ltr">Desktop Production ${VERSION}</span>
</div>`;

const FOOTER = `
<div style="width:100%;font-family:'Segoe UI',Tahoma,sans-serif;font-size:7.5pt;color:#7b8699;
            padding:0 18mm;direction:rtl;display:flex;justify-content:space-between;
            border-top:.4pt solid #e6eaf2;padding-top:2mm;">
  <span>شركة المنار الدولية</span>
  <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>`;

/**
 * الغلاف يُصيَّر مستقلًا بلا ترويسة ولا تذييل وبهوامش صفرية (تصميم ممتدّ حتى حافة الورقة)،
 * والمتن يُصيَّر بترويسة وتذييل وأرقام صفحات. ثم يُدمج الملفان.
 * الغلاف صفحة غير مرقَّمة — وهو العرف في المستندات الرسمية — فتبدأ أرقام الفهرس من
 * أول صفحة محتوى، ويطابقها ما يظهر في تذييل الصفحة.
 */
async function render(page, htmlPath, outPath, { cover = false } = {}) {
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: !cover,
    headerTemplate: cover ? '<span></span>' : HEADER,
    footerTemplate: cover ? '<span></span>' : FOOTER,
    margin: cover
      ? { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
      : { top: '20mm', right: '18mm', bottom: '17mm', left: '18mm' },
    preferCSSPageSize: false,
  });
}

/** يفصل قسم الغلاف عن بقيّة المستند، ويعيد وثيقتَي HTML كاملتين. */
function splitCover(html) {
  const open = html.indexOf('<section class="cover">');
  const close = html.indexOf('</section>', open) + '</section>'.length;
  if (open < 0 || close < open) throw new Error('تعذّر العثور على قسم الغلاف');
  const headEnd = html.indexOf('<body>') + '<body>'.length;
  const head = html.slice(0, headEnd);
  // في تمريرة الغلاف وحدها: لا فاصل صفحة بعده، ولا فائض يولّد صفحة ثانية فارغة.
  // في تمريرة الغلاف: الهوامش صفر، فـ100% تساوي ارتفاع الورقة بالضبط بلا تقريب
  // (القيمة الصريحة 297mm تتجاوز صندوق الصفحة بكسر بكسل فتولّد صفحة ثانية فارغة).
  const coverOnly = `
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; }
  .cover { page-break-after: auto !important; break-after: auto !important;
           height: 100%; width: 100%; margin: 0; }
</style>`;
  const coverHtml = head + coverOnly + html.slice(open, close) + '\n</body></html>';
  const bodyHtml = head + html.slice(close);
  return { coverHtml, bodyHtml };
}

/** يدمج ملفَّي PDF في ملف واحد. */
async function mergePdfs(coverPath, bodyPath, outPath) {
  const { PDFDocument } = require(PDFLIB);
  const out = await PDFDocument.create();
  for (const p of [coverPath, bodyPath]) {
    const src = await PDFDocument.load(fs.readFileSync(p));
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((pg) => out.addPage(pg));
  }
  fs.writeFileSync(outPath, await out.save());
}

/** يستخرج نصّ كل صفحة من PDF. */
async function extractPages(pdfPath) {
  const pdfjs = await import('file:///' + PDFJS.replace(/\\/g, '/'));
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    pages.push(tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' '));
  }
  return pages;
}

/**
 * يبني خريطة (معرّف الفصل ← رقم الصفحة) من نصوص الصفحات.
 *
 * النصّ العربي يُستخرج من PDF بأشكاله المتّصلة ومعكوس الترتيب، فمطابقة العناوين
 * مباشرةً غير موثوقة. لذلك يحمل كل عنوان فصل علامة لاتينية غير مرئية
 * (`<span class="chmark">MNRCHnn</span>`) تُستخرج بموثوقية تامة.
 */
function mapChapters(pages) {
  const map = {};
  for (const [id] of CHAPTERS) {
    const marker = 'MNRCH' + id.slice(-2);
    map[id] = null;
    for (let i = 0; i < pages.length; i++) {
      // قد تتفرّق حروف العلامة على عناصر نصّية متجاورة ⇒ نزيل الفراغات قبل البحث
      if (pages[i].replace(/\s+/g, '').includes(marker)) { map[id] = i + 1; break; }
    }
  }
  return map;
}

(async () => {
  console.log('▸ بناء دليل المستخدم — المنار ERP ' + VERSION);
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  console.log('▸ الخطوة ١/٥ — تجميع المصدر وفصل الغلاف');
  const raw = assemble();
  const htmlPath = path.join(BUILD_DIR, 'manual.html');
  // الأصول نسبية إلى docs/user-manual، وبناء الملف داخل build/ ⇒ نصحّح المسارات
  const fixed = raw.replace(/(src|href)="assets\//g, '$1="../assets/');
  fs.writeFileSync(htmlPath, fixed, 'utf8');

  const coverPath = path.join(BUILD_DIR, '_cover.html');
  const bodyPath = path.join(BUILD_DIR, '_body.html');
  const split = splitCover(fixed);
  fs.writeFileSync(coverPath, split.coverHtml, 'utf8');
  fs.writeFileSync(bodyPath, split.bodyHtml, 'utf8');

  const { chromium } = require(PW);
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage();
  const coverPdf = path.join(BUILD_DIR, '_cover.pdf');
  const bodyPdf = path.join(BUILD_DIR, '_body.pdf');

  console.log('▸ الخطوة ٢/٥ — تصيير الغلاف والمتن (تمرير أول)');
  await render(page, coverPath, coverPdf, { cover: true });
  await render(page, bodyPath, bodyPdf);

  console.log('▸ الخطوة ٣/٥ — استخراج نصّ الصفحات وربط الفصول');
  const pages = await extractPages(bodyPdf);
  const map = mapChapters(pages);
  const found = Object.values(map).filter(Boolean).length;
  console.log(`  صفحات المتن: ${pages.length} · فصول تحدَّد موضعها: ${found}/${CHAPTERS.length}`);
  Object.entries(map).forEach(([id, p]) => { if (!p) console.log(`  ⚠ لم يُعثر على ${id}`); });
  if (found !== CHAPTERS.length) throw new Error('لم تُحدَّد مواضع كل الفصول — الفهرس سيكون ناقصًا');

  console.log('▸ الخطوة ٤/٥ — كتابة الفهرس وإعادة التصيير ثم الدمج');
  const bodyWithToc = fillToc(split.bodyHtml, map);
  fs.writeFileSync(bodyPath, bodyWithToc, 'utf8');
  fs.writeFileSync(htmlPath, fillToc(fixed, map), 'utf8');
  await render(page, bodyPath, bodyPdf);
  await browser.close();

  const finalPdf = path.join(BUILD_DIR, PDF_NAME);
  await mergePdfs(coverPdf, bodyPdf, finalPdf);
  for (const f of [coverPdf, bodyPdf, coverPath, bodyPath]) fs.unlinkSync(f);

  console.log('▸ الخطوة ٥/٥ — النشر');
  fs.copyFileSync(finalPdf, path.join(BUILD_DIR, PDF_LATEST));
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  fs.copyFileSync(finalPdf, path.join(RELEASE_DIR, PDF_NAME));
  fs.copyFileSync(finalPdf, path.join(RELEASE_DIR, PDF_LATEST));

  const buf = fs.readFileSync(finalPdf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const finalPages = (await extractPages(finalPdf)).length;

  console.log('');
  console.log('✔ اكتمل البناء');
  console.log('  الملف     : ' + finalPdf);
  console.log('  الحجم     : ' + (buf.length / 1048576).toFixed(2) + ' MB (' + buf.length + ' bytes)');
  console.log('  SHA-256   : ' + sha);
  console.log('  الصفحات   : ' + finalPages);
  console.log('  نسخة التسليم: ' + path.join(RELEASE_DIR, PDF_NAME));

  fs.writeFileSync(path.join(BUILD_DIR, 'build-info.json'),
    JSON.stringify({ version: VERSION, file: PDF_NAME, bytes: buf.length, sha256: sha,
                     pages: finalPages, chapters: CHAPTERS.length, builtAt: new Date().toISOString(),
                     toc: map }, null, 1), 'utf8');
})().catch((e) => { console.error('✖ فشل البناء:', e); process.exit(1); });
