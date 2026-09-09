/**
 * Employee Debt Acknowledgment Administrative Form v1 — print-geometry harness, step 2/2.
 *
 * Loads each document produced by `buildDocuments.tsx` in a hidden Electron window and
 * renders it with EXACTLY the call the production preview and PDF export use:
 *
 *     webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
 *
 * (`electron/ipc/wysiwygPoc.ipc.ts` and `electron/ipc/pdf.ipc.ts` — same options, same
 * "the document's own @page rule is authoritative" policy.) It then measures every page
 * of the produced PDF and writes a JSON report plus a full-page PNG per language.
 *
 * NO DATABASE, NO BACKEND, NO APPLICATION STATE. This script never opens
 * `backend/data/manar.db` — it does not open any database at all — and the sample data
 * it prints is synthetic (see `buildDocuments.tsx`).
 *
 * Run (from the repo root):
 *   npx electron scripts/verify-debt-acknowledgment/measure.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { measurePdf } = require('./pdfInk.cjs');
const { scanPdfScripts } = require('./pdfText.cjs');

const OUT = path.join(__dirname, '..', '..', 'artifacts', 'employee-debt-acknowledgment-v1');
const MANIFEST = path.join(OUT, 'manifest.json');

/** الحزام المطلوب من مالك المنتج: 40mm أعلى الورقة و20mm أسفلها، على كل صفحة. */
const REQUIRED_TOP_MM = 40;
const REQUIRED_BOTTOM_MM = 20;
/** سماحية القياس: نصف مليمتر — أقل من دقة أي طابعة مكتبية. */
const TOLERANCE_MM = 0.5;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** مضاعف مساحة التوقيع المطلوب، ونسبة التسامح في القياس (بكسل جزئي وتقريب). */
const SIGNATURE_MULTIPLIER = 2;
const SIGNATURE_TOLERANCE = 0.03;
/** بكسل CSS في المليمتر — البكسل 1/96 بوصة بحكم المواصفة. */
const PX_PER_MM = 96 / 25.4;
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * قياس خانات التوقيع من الـDOM الحيّ.
 *
 * لكل خانة معلَّمة `data-eda-sig` تُقاس أربعة أرقام حقيقية (لا مقدَّرة):
 *   · `cellHeight`  ارتفاع خلية الجدول كاملةً بعد التوسيع — وهو الارتفاع النهائي.
 *   · `labelHeight` ارتفاع صندوق النصّ الأصلي وحده (`.eda-sig-label`) — أي المحتوى
 *                    كما كان قبل التوسيع، بنفس التفافه في هذه اللغة بالذات.
 *   · `padTop` / `padBottom` الحشو الرأسي الفعلي المحسوب.
 *
 * ومنها يُشتقّ الارتفاع الأصلي دون الحاجة إلى تشغيل ثانٍ بالإعدادات القديمة:
 *
 *   baseline = labelHeight + 2 × padTop      (الحشو كان متساويًا أعلى وأسفل)
 *   final    = cellHeight
 *   ratio    = final / baseline              (المتوقَّع 2.00)
 *
 * فالنسبة **مقيسة** على الصفحة المُصيَّرة فعلًا، لا مُعلَنة في الكود.
 */
const SIGNATURE_SCRIPT = `
  (() => {
    const px = (v) => Math.round(parseFloat(v) * 1000) / 1000;
    return Array.from(document.querySelectorAll('[data-eda-sig]')).map((el) => {
      const cell = el.closest('td') || el.parentElement;
      const label = el.querySelector('.eda-sig-label');
      const cs = getComputedStyle(cell);
      const padTop = px(cs.paddingTop);
      const padBottom = px(cs.paddingBottom);
      const borders = px(cs.borderTopWidth) + px(cs.borderBottomWidth);
      const labelHeight = px(label ? label.getBoundingClientRect().height : 0);
      const cellHeight = px(cell.getBoundingClientRect().height);
      // **مساحة الكتابة** = صندوق المحتوى + الحشو الرأسي، في الحالتين.
      // حدّ الخلية مستثنى من الطرفين: خيط شعري تتقاسمه الخلية مع جارتها
      // (border-collapse)، فـ getBoundingClientRect يحسب نصفه فقط — إدخاله في طرف
      // دون الآخر يقارن صندوقين مختلفَي التعريف ويعطي نسبة كاذبة.
      // cellHeightPx يبقى مسجَّلًا كارتفاع مرئي فعلي للمراجعة البصرية.
      const wrapperHeight = px(el.getBoundingClientRect().height);
      return {
        area: el.getAttribute('data-eda-sig'),
        labelHeightPx: labelHeight,
        padTopPx: padTop,
        padBottomPx: padBottom,
        bordersPx: borders,
        cellHeightPx: cellHeight,
        baselineHeightPx: labelHeight + 2 * padTop,
        finalHeightPx: wrapperHeight + padTop + padBottom,
        spacerCount: el.querySelectorAll('.eda-sig-space').length,
        spacerHeightPx: px(Array.from(el.querySelectorAll('.eda-sig-space'))
          .reduce((sum, sp) => sum + sp.getBoundingClientRect().height, 0)),
        wrapperHeightPx: wrapperHeight,
        rowHeightPx: px(cell.parentElement ? cell.parentElement.getBoundingClientRect().height : 0),
      };
    });
  })()
`;

/** ينتظر جاهزية الخطوط والصور وإطارَي رسم — نفس شروط `electron/services/renderReadiness`. */
const READY_SCRIPT = `
  (async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).map((img) =>
      img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return true;
  })()
`;

async function renderOne(win, doc) {
  await win.loadURL(pathToFileURL(doc.html).toString());
  await win.webContents.executeJavaScript(READY_SCRIPT, true);

  // تُقاس خانات التوقيع من الشجرة الحيّة **قبل** الإخراج — نفس الشجرة التي يُخرجها
  // `printToPDF` بعد سطرين، فلا فجوة بين ما قيس وما طُبع.
  const signatureCells = await win.webContents.executeJavaScript(SIGNATURE_SCRIPT, true);

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });
  const pdfPath = path.join(OUT, `debt-acknowledgment-${doc.lang}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const measurement = measurePdf(pdfBuffer);
  const scripts = scanPdfScripts(pdfBuffer);

  // لقطة بصرية للمراجعة اليدوية: نموذج الشاشة (كل صفحة منطقية بمقاس A4 كامل بنفس
  // هوامش ملف الطباعة). ملف الـPDF أعلاه هو مرجع الطباعة الفعلي؛ هذه للعرض السريع.
  const pngPath = path.join(OUT, `debt-acknowledgment-${doc.lang}.png`);
  const size = await win.webContents.executeJavaScript(
    `({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) })`,
    true,
  );
  win.setContentSize(Math.min(size.w || 900, 1400), Math.min(size.h || 1200, 16000));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(pngPath, image.toPNG());
  win.setContentSize(900, 1200);

  return { pdfPath, pngPath, measurement, signatureCells, scripts };
}

function verdictFor(measurement) {
  const problems = [];
  for (const page of measurement.pages) {
    const label = `page ${page.index}`;
    if (!page.readable) {
      problems.push(`${label}: content stream could not be measured`);
      continue;
    }
    if (page.widthMm === null || Math.abs(page.widthMm - A4_WIDTH_MM) > TOLERANCE_MM)
      problems.push(`${label}: width ${page.widthMm?.toFixed(2)}mm != A4 ${A4_WIDTH_MM}mm`);
    if (page.heightMm === null || Math.abs(page.heightMm - A4_HEIGHT_MM) > TOLERANCE_MM)
      problems.push(`${label}: height ${page.heightMm?.toFixed(2)}mm != A4 ${A4_HEIGHT_MM}mm`);
    if (page.topClearMm < REQUIRED_TOP_MM - TOLERANCE_MM)
      problems.push(`${label}: top clear band ${page.topClearMm.toFixed(2)}mm < ${REQUIRED_TOP_MM}mm`);
    if (page.bottomClearMm < REQUIRED_BOTTOM_MM - TOLERANCE_MM)
      problems.push(`${label}: bottom clear band ${page.bottomClearMm.toFixed(2)}mm < ${REQUIRED_BOTTOM_MM}mm`);
    if (page.leftClearMm < 0 || page.rightClearMm < 0)
      problems.push(`${label}: ink outside the page box (left ${page.leftClearMm}, right ${page.rightClearMm})`);
  }
  return problems;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    profileId: manifest.profileId,
    margins: manifest.margins,
    requirement: {
      topMm: REQUIRED_TOP_MM,
      bottomMm: REQUIRED_BOTTOM_MM,
      toleranceMm: TOLERANCE_MM,
      signatureMultiplier: SIGNATURE_MULTIPLIER,
    },
    printToPdfOptions: { printBackground: true, preferCSSPageSize: true },
    goldenDbTouched: false,
    documents: [],
  };

  let failed = false;
  for (const doc of manifest.documents) {
    const { pdfPath, pngPath, measurement, signatureCells, scripts } = await renderOne(win, doc);
    const problems = verdictFor(measurement);

    // مساحة التوقيع: النسبة المقيسة يجب أن تساوي المضاعف المطلوب.
    const signatures = signatureCells.map((cellMetrics) => ({
      ...cellMetrics,
      baselineMm: round2(cellMetrics.baselineHeightPx / PX_PER_MM),
      finalMm: round2(cellMetrics.finalHeightPx / PX_PER_MM),
      ratio: cellMetrics.baselineHeightPx > 0
        ? round2(cellMetrics.finalHeightPx / cellMetrics.baselineHeightPx)
        : null,
    }));
    for (const sig of signatures) {
      if (sig.ratio === null || Math.abs(sig.ratio - SIGNATURE_MULTIPLIER) > SIGNATURE_TOLERANCE) {
        problems.push(
          `signature "${sig.area}": measured ratio ${sig.ratio} != ${SIGNATURE_MULTIPLIER}`,
        );
      }
    }
    if (signatures.length === 0) problems.push('no signature areas found');

    // القالبان الأجنبيان: صفر حرف عربي في المخرَج المطبوع نفسه.
    if (doc.lang !== 'ar' && scripts.hasArabicScript) {
      problems.push(
        `${doc.lang}: ${scripts.arabicCharCount} Arabic characters in the produced PDF — ${JSON.stringify(scripts.arabicSamples)}`,
      );
    }
    if (doc.lang === 'hi' && !scripts.hasDevanagari) problems.push('hi: no Devanagari in the produced PDF');
    // حارس ضد فحص أجوف: مستند لم يُقرأ منه رمز واحد يجتاز «صفر حرف عربي» لأنه لم
    // يُقرأ أصلًا. نطلب دليلًا إيجابيًا على أن الرموز قُرئت فعلًا.
    if (scripts.toUnicodeMapsRead === 0 || scripts.drawnCodePoints < 30) {
      problems.push(
        `${doc.lang}: glyph coverage unreadable (${scripts.toUnicodeMapsRead} ToUnicode maps, ${scripts.drawnCodePoints} code points) — the Arabic check would be vacuous`,
      );
    }

    if (problems.length) failed = true;
    report.documents.push({
      lang: doc.lang,
      pdf: pdfPath,
      png: pngPath,
      pageCount: measurement.pageCount,
      pages: measurement.pages.map((p) => ({
        index: p.index,
        widthMm: p.widthMm === null ? null : Number(p.widthMm.toFixed(2)),
        heightMm: p.heightMm === null ? null : Number(p.heightMm.toFixed(2)),
        topClearMm: p.topClearMm === null ? null : Number(p.topClearMm.toFixed(2)),
        bottomClearMm: p.bottomClearMm === null ? null : Number(p.bottomClearMm.toFixed(2)),
        leftClearMm: p.leftClearMm === null ? null : Number(p.leftClearMm.toFixed(2)),
        rightClearMm: p.rightClearMm === null ? null : Number(p.rightClearMm.toFixed(2)),
        inkOps: p.inkOps,
        readable: p.readable,
      })),
      signatures,
      scripts: {
        toUnicodeMapsRead: scripts.toUnicodeMapsRead,
        drawnCodePoints: scripts.drawnCodePoints,
        drawnArabicCharCount: scripts.drawnArabicChars.length,
        drawnArabicChars: scripts.drawnArabicChars,
        arabicCharCount: scripts.arabicCharCount,
        hasArabicScript: scripts.hasArabicScript,
        hasDevanagari: scripts.hasDevanagari,
        arabicSamples: scripts.arabicSamples,
      },
      problems,
    });
  }

  report.pass = !failed;
  const reportPath = path.join(OUT, 'geometry-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  win.destroy();
  app.exit(failed ? 1 : 0);
});
