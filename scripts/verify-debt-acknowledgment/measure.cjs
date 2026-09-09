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

/**
 * الصفحة 2 وحدها **معفاة** من حزام 20mm السفلي بقرار مالك المنتج — لأنها دمجُ ما كان
 * صفحتين. الإعفاء رخصة لا أمر: الحدّ أدناه هو الأرضية التي لا يجوز النزول تحتها حتى
 * مع الإعفاء (نصّ يلامس حافة الورقة يُقصّ في أي طابعة مكتبية). والحزام **العلوي**
 * 40mm يبقى مفروضًا على الصفحات الأربع بلا استثناء.
 *
 * القياس الفعلي يسجَّل دائمًا، ويُعلَن صراحةً هل استُهلك الإعفاء أم لا.
 */
const PAGE_2_EXEMPT_BOTTOM_FLOOR_MM = 8;

/**
 * صفحات **المستند** قبل الملحق — ثابتة: الأولى والثانية.
 *
 * ما بعدهما مشتقّ من عدد الأقساط لا مكتوب: صفحات الملحق لكل نسخة =
 * `ceil(count / 12)`، والمجموع = `2 + 2 × ذلك`. فقاعدة «أربع صفحات» لم تُلغَ بل صارت
 * **حالةَ** هذه الصيغة حين لا يتجاوز العدد اثني عشر. ويبقى المقيس هو الحَكَم: يحمل
 * البيان `expectedPages` المحسوب، ويقارنه هذا المقياس بما أخرجه Chromium فعلًا.
 */
const MAIN_PAGES = 2;
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

/**
 * بنية المستند وطباعة الصفحة 2، مقروءتان من الشجرة الحيّة.
 *
 * لماذا من الـDOM لا من الكود: القيم المطلوبة (حجم الخط، ارتفاع السطر، أصغر خط على
 * الصفحة) هي ما **حسبه المتصفح** بعد كل قواعد الضغط والتتالي — لا ما كُتب في ملف
 * الأنماط. قاعدة مكسورة (وقد حدث: علامة اقتباس هرّبها React داخل style) تمرّ في
 * الكود وتسقط هنا.
 */
const STRUCTURE_SCRIPT = `
  (() => {
    const px = (v) => Math.round(parseFloat(v) * 1000) / 1000;
    const PT = 72 / 96;
    const sections = Array.from(document.querySelectorAll('.eda-page'));
    const compact = document.querySelector('.eda-page--compact');

    // أصغر خط مرسوم فعلًا على الصفحة 2: يُمسح كل عنصر يحمل نصًّا مرئيًا. النسخ
    // المخفيّة (visibility: hidden) مستثناة — لا تصل الورق فلا تُقاس.
    let minFontPt = null;
    let minFontSample = null;
    if (compact) {
      for (const el of compact.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const text = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join('');
        if (!text) continue;
        const pt = Math.round(px(cs.fontSize) * PT * 100) / 100;
        if (minFontPt === null || pt < minFontPt) { minFontPt = pt; minFontSample = text.slice(0, 40); }
      }
    }

    const typographyOf = (selector) => {
      const el = compact && compact.querySelector(selector);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const fontPx = px(cs.fontSize);
      const linePx = cs.lineHeight === 'normal' ? null : px(cs.lineHeight);
      return {
        selector: selector,
        fontPt: Math.round(fontPx * PT * 100) / 100,
        lineHeightPx: linePx,
        lineHeightRatio: linePx === null ? null : Math.round((linePx / fontPx) * 1000) / 1000,
      };
    };

    // ═══ الترتيب **البصري** لأعمدة كل جدول ═══
    // تُرتَّب الخلايا بإحداثي حافتها اليسرى لا بترتيبها في DOM، فما يُقاس هو ما
    // يراه القارئ على الورق. والأدوار مأخوذة من سمات بنيوية لا تُطبع، فيُعرف كل
    // عمود بما هو لا بمكانه.
    const visualOrder = (row, attr) =>
      Array.from(row.children)
        .map((td) => ({ role: td.getAttribute(attr), left: td.getBoundingClientRect().left }))
        .sort((a, b) => a.left - b.left)
        .map((c) => c.role);

    const tables = Array.from(document.querySelectorAll('.eda-tbl')).map((t, i) => {
      const rows = Array.from(t.querySelectorAll('tr'));
      const head = rows[0];
      const body = rows[1];
      const kind = t.classList.contains('eda-tbl--annex')
        ? 'annex'
        : head && head.querySelector('[data-eda-sigcol]')
          ? 'signature'
          : head && head.querySelector('[data-eda-cell]')
            ? 'data'
            : 'plain';
      const attr = kind === 'annex' ? 'data-eda-col' : kind === 'signature' ? 'data-eda-sigcol' : 'data-eda-cell';
      return {
        index: i + 1,
        kind: kind,
        columns: head ? head.children.length : 0,
        headVisualOrder: head ? visualOrder(head, attr) : [],
        bodyVisualOrder: body ? visualOrder(body, attr) : [],
      };
    });

    return {
      tables: tables,
      sectionCount: sections.length,
      sections: sections.map((el, i) => ({
        index: i + 1,
        classes: el.className,
        annexCopy: el.getAttribute('data-eda-annex-copy'),
        heightPx: px(el.getBoundingClientRect().height),
      })),
      annexCopies: Array.from(document.querySelectorAll('[data-eda-annex-copy]'))
        .map((el) => el.getAttribute('data-eda-annex-copy')),
      annexPageNumbers: Array.from(document.querySelectorAll('[data-eda-annex-page]'))
        .map((el) => el.getAttribute('data-eda-annex-page')),
      lastSectionAnnexCopy: sections.length
        ? sections[sections.length - 1].getAttribute('data-eda-annex-copy')
        : null,
      lastSectionAnnexPage: sections.length
        ? sections[sections.length - 1].getAttribute('data-eda-annex-page')
        : null,
      instructionsNodes: document.querySelectorAll('[data-eda-instructions]').length,
      documentText: document.body.textContent || '',
      page2: compact
        ? {
            heightPx: px(compact.getBoundingClientRect().height),
            minFontPt: minFontPt,
            minFontSample: minFontSample,
            clause: typographyOf('.eda-clause'),
            heading: typographyOf('.eda-h1'),
            tableCell: typographyOf('.eda-tbl td'),
          }
        : null,
    };
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
  const structure = await win.webContents.executeJavaScript(STRUCTURE_SCRIPT, true);

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
  });
  const pdfPath = path.join(OUT, `debt-acknowledgment-${doc.scenario}-${doc.lang}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const measurement = measurePdf(pdfBuffer);
  const scripts = scanPdfScripts(pdfBuffer);

  // لقطة بصرية للمراجعة اليدوية: نموذج الشاشة (كل صفحة منطقية بمقاس A4 كامل بنفس
  // هوامش ملف الطباعة). ملف الـPDF أعلاه هو مرجع الطباعة الفعلي؛ هذه للعرض السريع.
  const pngPath = path.join(OUT, `debt-acknowledgment-${doc.scenario}-${doc.lang}.png`);
  const size = await win.webContents.executeJavaScript(
    `({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) })`,
    true,
  );
  win.setContentSize(Math.min(size.w || 900, 1400), Math.min(size.h || 1200, 16000));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(pngPath, image.toPNG());
  win.setContentSize(900, 1200);

  return { pdfPath, pngPath, measurement, signatureCells, structure, scripts };
}

function verdictFor(measurement, expectedPages) {
  const problems = [];
  if (measurement.pageCount !== expectedPages)
    problems.push(`page count ${measurement.pageCount} != ${expectedPages}`);
  for (const page of measurement.pages) {
    const label = `page ${page.index}`;
    // الصفحة 2 وحدها معفاة من حزام 20mm السفلي — وما عداها لا.
    const bottomFloor = page.index === 2 ? PAGE_2_EXEMPT_BOTTOM_FLOOR_MM : REQUIRED_BOTTOM_MM;
    // صفحة بلا حبر صفحةٌ بيضاء: المستند أربع صفحات كلها محتوى، لا حشو.
    if (page.readable && page.inkOps === 0) problems.push(`${label}: blank page (no ink)`);
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
    if (page.bottomClearMm < bottomFloor - TOLERANCE_MM)
      problems.push(`${label}: bottom clear band ${page.bottomClearMm.toFixed(2)}mm < ${bottomFloor}mm`);
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
      page2ExemptBottomFloorMm: PAGE_2_EXEMPT_BOTTOM_FLOOR_MM,
      mainPages: MAIN_PAGES,
      rowsPerAnnexPage: manifest.rowsPerAnnexPage,
      pageCountFormula: 'MAIN_PAGES + 2 * ceil(installments / rowsPerAnnexPage)',
      toleranceMm: TOLERANCE_MM,
      signatureMultiplier: SIGNATURE_MULTIPLIER,
    },
    printToPdfOptions: { printBackground: true, preferCSSPageSize: true },
    goldenDbTouched: false,
    documents: [],
  };

  let failed = false;
  for (const doc of manifest.documents) {
    const { pdfPath, pngPath, measurement, signatureCells, structure, scripts } = await renderOne(win, doc);
    // عدد صفحات الملحق لكل نسخة والمجموع المتوقَّع — من البيان، مبنيَّين على الجدول
    // المولَّد فعلًا لا على العدد المطلوب.
    const annexPagesPerCopy = doc.annexPagesPerCopy;
    const expectedPages = doc.expectedPages;
    // مواضع صفحات الملحق: مجموعة أولى تلي صفحتَي المستند، ثم مجموعة ثانية تليها.
    const setOne = Array.from({ length: annexPagesPerCopy }, (_unused, k) => MAIN_PAGES + 1 + k);
    const setTwo = setOne.map((n) => n + annexPagesPerCopy);

    const problems = verdictFor(measurement, expectedPages);

    // ── البنية: صفحتا المستند، ثم مجموعتا ملحق كاملتان، وآخر الورق آخر الثانية ──
    if (structure.sectionCount !== expectedPages)
      problems.push(`document sections ${structure.sectionCount} != ${expectedPages}`);

    // النمط المُلزِم: **كل** صفحات النسخة الأولى ثم **كل** صفحات الثانية — لا تبادلًا
    // بينهما. نسخةٌ تُسلَّم صفحاتها مشفوعةً بصفحات النسخة الأخرى ليست نسخة.
    const wantCopies = [
      ...Array.from({ length: annexPagesPerCopy }, () => '1'),
      ...Array.from({ length: annexPagesPerCopy }, () => '2'),
    ];
    if (structure.annexCopies.join(',') !== wantCopies.join(','))
      problems.push(`annex copy order [${structure.annexCopies.join(',')}] != [${wantCopies.join(',')}]`);

    // وترقيم صفحات كل نسخة يبدأ من واحد ويتّصل إلى آخرها.
    const wantAnnexPages = wantCopies.map((_unused, i) => String((i % annexPagesPerCopy) + 1));
    if (structure.annexPageNumbers.join(',') !== wantAnnexPages.join(','))
      problems.push(
        `annex page order [${structure.annexPageNumbers.join(',')}] != [${wantAnnexPages.join(',')}]`,
      );
    if (structure.lastSectionAnnexCopy !== '2')
      problems.push(`last section is not annex copy 2 (got ${structure.lastSectionAnnexCopy})`);
    if (structure.lastSectionAnnexPage !== String(annexPagesPerCopy))
      problems.push(
        `last section is not the last annex page (got ${structure.lastSectionAnnexPage} of ${annexPagesPerCopy})`,
      );

    // المجموعتان متطابقتان **صفحةً بصفحة**: بصمة الحبر المرئي واحدة لكل زوج — تُبنى
    // بعد القصّ، فلا يخدعها ما يفيض بين صفحتين.
    for (let k = 0; k < annexPagesPerCopy; k += 1) {
      const first = measurement.pages[setOne[k] - 1];
      const second = measurement.pages[setTwo[k] - 1];
      if (!first || !second) {
        problems.push(`annex pages ${setOne[k]}/${setTwo[k]} missing`);
        continue;
      }
      if (first.visibleInkSha && second.visibleInkSha && first.visibleInkSha !== second.visibleInkSha)
        problems.push(
          `annex page ${k + 1} differs between copies: p${first.index} ${first.visibleInkSha} vs p${second.index} ${second.visibleInkSha}`,
        );
      // البصمة تُقارن **ترتيب** الحبر؛ وهذه تُقارن موضعه المطلق على الورقة. معًا:
      // نفس الحبر، بنفس الترتيب، في نفس المكان من الصفحة.
      const band = (page) =>
        [page.topClearMm, page.bottomClearMm, page.leftClearMm, page.rightClearMm]
          .map((v) => (v === null ? 'null' : v.toFixed(2)))
          .join('/');
      if (band(first) !== band(second))
        problems.push(
          `annex page ${k + 1} sits differently between copies: p${first.index} ${band(first)} vs p${second.index} ${band(second)}`,
        );
      if (first.inkOps !== second.inkOps)
        problems.push(
          `annex page ${k + 1} ink ops differ between copies: p${first.index} ${first.inkOps} vs p${second.index} ${second.inkOps}`,
        );
    }

    // ── الترتيب البصري لكل جدول، يسارًا إلى يمينًا ───────────────────────────
    //
    // القاعدة واحدة ومصدرها ملفات DOCX نفسها: لا جدول فيها يحمل `w:bidiVisual`،
    // فكلّها تُصفّ من اليسار، ومؤلّف الملف العربي كتب شبكته معكوسة ليخرج الشكل
    // العربي صحيحًا. فالصورة المطلوبة على الورق:
    //
    //   جدول بيانات   rtl: القيمة يسارًا والتسمية يمينًا   ltr: العكس
    //   جدول توقيعات  rtl: الدائن يسارًا والمدين يمينًا    ltr: العكس
    //   ملحق السداد   rtl: ملاحظات ⇐ ... ⇐ رقم القسط      ltr: العكس
    //
    // ويُقاس ذلك من الحافة اليسرى الفعلية لكل خلية بعد التصيير، لا من ترتيب DOM.
    const rtl = doc.lang === 'ar';
    const expected = {
      data: rtl ? ['value', 'label'] : ['label', 'value'],
      // نفسه في اللغات الثلاث بلا شرط: الدائن أوّلُ شبكة الجدول في الملفات الثلاثة
      // (`4680,4680`)، فيقع يسارًا في كلٍّ منها. وهو سبب عكس ترتيب DOM في العربية.
      signature: ['creditor', 'debtor'],
      annex: rtl
        ? ['notes', 'balance', 'amount', 'dueDate', 'no']
        : ['no', 'dueDate', 'amount', 'balance', 'notes'],
    };
    for (const table of structure.tables) {
      if (table.kind === 'plain') continue;
      const want = expected[table.kind];
      if (table.headVisualOrder.join(',') !== want.join(','))
        problems.push(
          `table ${table.index} (${table.kind}): visual column order [${table.headVisualOrder.join(',')}] != [${want.join(',')}]`,
        );
      // وجسم الجدول يتبع ترويسته حرفًا بحرف — فلا تنزلق قيمة إلى عمود جاره.
      if (table.bodyVisualOrder.length && table.bodyVisualOrder.join(',') !== table.headVisualOrder.join(','))
        problems.push(
          `table ${table.index} (${table.kind}): body order [${table.bodyVisualOrder.join(',')}] != head order [${table.headVisualOrder.join(',')}]`,
        );
    }
    // كل الجداول المتوقَّعة حاضرة، وعددها يتبع عدد صفحات الملحق:
    //   جدول ملحق لكل صفحة ملحق (× نسختين)، وجدولا توقيع الملحق معه،
    //   زائد جدولَي بيانات الدائن والمدين، وجدول التوقيعات الواحد.
    const annexSections = annexPagesPerCopy * 2;
    const kinds = structure.tables.map((t) => t.kind);
    if (kinds.filter((k) => k === 'annex').length !== annexSections)
      problems.push(`annex tables ${kinds.filter((k) => k === 'annex').length} != ${annexSections}`);
    if (kinds.filter((k) => k === 'signature').length !== 1)
      problems.push(`signature tables ${kinds.filter((k) => k === 'signature').length} != 1`);
    if (kinds.filter((k) => k === 'data').length !== 2 + annexSections)
      problems.push(`data tables ${kinds.filter((k) => k === 'data').length} != ${2 + annexSections}`);

    // ── التعليمات: نصّها كاملٌ في حزمة المحتوى، وصفرُ أثرٍ له في المستند المطبوع ──
    if (structure.instructionsNodes !== 0)
      problems.push(`instructions rendered inside the printed document (${structure.instructionsNodes} nodes)`);
    if (doc.guidanceTitle && structure.documentText.includes(doc.guidanceTitle))
      problems.push(`instructions heading found in the printed document: ${doc.guidanceTitle}`);
    // وعنوان الملحق يظهر مرتين — مرة لكل نسخة.
    if (doc.annexTitle) {
      const occurrences = structure.documentText.split(doc.annexTitle).length - 1;
      const wantTitles = annexPagesPerCopy * 2;
      if (occurrences !== wantTitles)
        problems.push(`annex title appears ${occurrences} times, expected ${wantTitles}`);
    }

    // ── الصفحة 2: أرقام صريحة لا كلمة «تسع» ────────────────────────────────
    const page2Ink = measurement.pages[1];
    const page2 = structure.page2
      ? {
          ...structure.page2,
          topInkBoundaryMm: page2Ink ? round2(page2Ink.topClearMm) : null,
          bottomInkBoundaryMm: page2Ink ? round2(297 - page2Ink.bottomClearMm) : null,
          remainingWhitespaceMm:
            page2Ink ? round2(page2Ink.bottomClearMm - REQUIRED_BOTTOM_MM) : null,
          bottomExemptionUsed: page2Ink ? page2Ink.bottomClearMm < REQUIRED_BOTTOM_MM : null,
        }
      : null;
    if (!page2) problems.push('no compact page (page 2) found');

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
      scenario: doc.scenario,
      installments: doc.installments,
      generatedRows: doc.generatedRows,
      annexPagesPerCopy,
      expectedPages,
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
        visibleInkSha: p.visibleInkSha,
        readable: p.readable,
      })),
      signatures,
      structure: {
        tables: structure.tables,
        sectionCount: structure.sectionCount,
        sections: structure.sections,
        annexCopies: structure.annexCopies,
        annexPageNumbers: structure.annexPageNumbers,
        lastSectionAnnexCopy: structure.lastSectionAnnexCopy,
        lastSectionAnnexPage: structure.lastSectionAnnexPage,
        instructionsNodes: structure.instructionsNodes,
      },
      page2,
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

  // نسخة **محفوظة في المستودع** من التقرير نفسه.
  //
  // مجلد artifacts/ مستثنى من Git (ملفات PDF وPNG ثقيلة تتغيّر مع كل تشغيل)، لكن
  // التقرير رقمٌ لا صورة: هو سجلّ آخر قياس فعلي، ويقرؤه اختبارٌ آليّ يثبت الأربع
  // صفحات والأحزمة وتطابق نسختَي الملحق. اختبارٌ يقرأ ملفًا غير محفوظ يمرّ عند من
  // شغّل المقياس ويسقط عند غيره — فيُحفظ هنا ليكون ما يُراجَع هو ما قِيس.
  const docsPath = path.join(__dirname, '..', '..', 'docs', 'employee-debt-acknowledgment-v1.geometry.json');
  fs.writeFileSync(docsPath, JSON.stringify(report, null, 2), 'utf-8');

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  win.destroy();
  app.exit(failed ? 1 : 0);
});
