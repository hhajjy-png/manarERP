/**
 * قارئ نصّ الـPDF — للتحقق لا للعرض، ولا يُشحن مع التطبيق.
 *
 * لماذا يوجد: القالبان الإنجليزي والهندي يجب ألا يحملا حرفًا عربيًا واحدًا. فحصُ حالة
 * الواجهة يثبت أن **المدخلات** سليمة؛ وهذا الملف يثبت ما هو أقوى: أن **المخرَج
 * المطبوع نفسه** خالٍ منها. يقرأ ما يقرؤه القارئ من ملف الـPDF، ثم يُفحص النصّ.
 *
 * كيف: Chromium يكتب مع كل عبارة `/Span<</ActualText <FEFF…>>>` تحمل نصّها بالـUnicode
 * الحقيقي (لأن الخطوط مُجزّأة، فلا تكفي رموز المحارف). هذه الوسوم هي مصدر النصّ هنا —
 * وهي حرفيًا ما تستخرجه أدوات النسخ من الملف.
 */
const zlib = require('node:zlib');

/** محرفا نهاية السطر — يُعرَّفان بالرمز لا بالهروب، فلا يعبث بهما مولِّد نصّ. */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** نفس كتل يونيكود العربية التي يفحصها حارس الواجهة (`arabicScript.ts`). */
const ARABIC_BLOCKS =
  /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿﭐ-﷿ﹰ-﻿]|[\u{10E60}-\u{10E7F}\u{1EC70}-\u{1ECBF}\u{1ED00}-\u{1ED4F}\u{1EE00}-\u{1EEFF}]/u;

/** كتلة الديفاناغارية — وجودها في القالب الهندي مطلوب، لا مرفوض. */
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ]/u;

function decodeActualText(hex) {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
}

/** كل نصّ مرئي في الملف، صفحةً صفحة. */
function extractPdfText(buf) {
  const latin = buf.toString('latin1');
  const objects = new Map();
  const objRe = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = objRe.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endobj', start);
    if (end === -1) continue;
    objects.set(Number(m[1]), { start, end, text: latin.slice(start, end) });
  }

  const pages = [];
  for (const [, obj] of objects) {
    if (!/\/Type\s*\/Page(?![s\w])/.test(obj.text)) continue;
    const contents = obj.text.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (!contents) {
      pages.push('');
      continue;
    }
    const stream = objects.get(Number(contents[1]));
    if (!stream) {
      pages.push('');
      continue;
    }
    const sIdx = latin.indexOf('stream', stream.start);
    let dataStart = sIdx + 'stream'.length;
    if (latin[dataStart] === CR) dataStart += 1;
    if (latin[dataStart] === LF) dataStart += 1;
    const endIdx = latin.indexOf('endstream', dataStart);
    const dict = latin.slice(stream.start, sIdx);
    let bytes = buf.subarray(dataStart, endIdx);
    if (/\/FlateDecode/.test(dict)) {
      try {
        bytes = zlib.inflateSync(bytes);
      } catch {
        pages.push('');
        continue;
      }
    }
    const content = bytes.toString('latin1');
    const parts = [];
    for (const span of content.matchAll(/\/ActualText\s*(?:<FEFF([0-9A-Fa-f]*)>|\(((?:\\.|[^)])*)\))/g)) {
      parts.push(span[1] ? decodeActualText(span[1]) : span[2].replace(/\\(.)/g, '$1'));
    }
    pages.push(parts.join(''));
  }
  return pages;
}


/**
 * كل نقطة ترميز يستعملها المستند فعلًا — من خرائط `/ToUnicode` للخطوط المُجزّأة.
 *
 * ═══ لماذا لا يكفي `/ActualText` وحده ═══
 * Chromium يكتب `/ActualText` للنصوص **معقّدة التشكيل** (العربية والديفاناغارية) لأن
 * ترتيب رموزها لا يطابق ترتيب حروفها. أما اللاتينية والأرقام فتُكتب بلا هذا الوسم —
 * فقارئٌ يعتمد عليه وحده لا يرى شيئًا في مستند إنجليزي، فيقول «صفر حرف عربي» لأنه لم
 * يقرأ شيئًا أصلًا لا لأن المستند نظيف. وهذا فحص أجوف.
 *
 * خريطة `/ToUnicode` تحسم الأمر: هي ما يربط كل رمز مرسوم بنقطة ترميزه الحقيقية، ومنها
 * تُبنى مجموعةُ كل ما رُسم في المستند مهما كانت لغته أو طريقة كتابته.
 */
function parseToUnicodeCodePoints(cmap) {
  const points = new Set();
  const hexToChars = (hex) => {
    const out = [];
    for (let i = 0; i + 3 < hex.length + 1; i += 4) out.push(parseInt(hex.slice(i, i + 4), 16));
    return out;
  };

  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      for (const cp of hexToChars(pair[2])) points.add(cp);
    }
  }

  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const body = block[1];
    // <lo> <hi> <dstStart>
    for (const r of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const span = parseInt(r[2], 16) - parseInt(r[1], 16);
      const dst = hexToChars(r[3]);
      if (dst.length === 0) continue;
      for (let k = 0; k <= span && k < 65536; k += 1) points.add(dst[dst.length - 1] + k);
    }
    // <lo> <hi> [ <d1> <d2> ... ]
    for (const r of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      for (const d of r[3].matchAll(/<([0-9A-Fa-f]+)>/g)) {
        for (const cp of hexToChars(d[1])) points.add(cp);
      }
    }
  }
  return points;
}

/**
 * مجموعة نقاط الترميز المرسومة في المستند كله.
 *
 * خريطة `/ToUnicode` كائنٌ مستقل، ودليلُه **مرجعه داخل كائن الخط**
 * (`/ToUnicode 12 0 R`) لا محتواه: ترويسة الكائن نفسه لا تحمل إلا `/Filter`
 * و`/Length`، فالبحث عن نصّ داخلها لا يجد شيئًا. تُجمع أرقام المراجع أولًا من كائنات
 * الخطوط، ثم تُقرأ تلك الكائنات بالذات وتُفكّ ضغوطها.
 */
function pdfDrawnCodePoints(buf) {
  const latin = buf.toString('latin1');
  const points = new Set();
  let count = 0;

  const cmapRefs = new Set(
    [...latin.matchAll(/\/ToUnicode\s+(\d+)\s+0\s+R/g)].map((ref) => Number(ref[1])),
  );

  const objRe = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = objRe.exec(latin)) !== null) {
    if (!cmapRefs.has(Number(m[1]))) continue;
    const start = m.index + m[0].length;
    const end = latin.indexOf('endobj', start);
    if (end === -1) continue;
    const sIdx = latin.indexOf('stream', start);
    if (sIdx === -1 || sIdx > end) continue;
    let dataStart = sIdx + 'stream'.length;
    if (latin[dataStart] === CR) dataStart += 1;
    if (latin[dataStart] === LF) dataStart += 1;
    const endIdx = latin.indexOf('endstream', dataStart);
    let bytes = buf.subarray(dataStart, endIdx);
    if (/\/FlateDecode/.test(latin.slice(start, sIdx))) {
      try {
        bytes = zlib.inflateSync(bytes);
      } catch {
        continue;
      }
    }
    count += 1;
    for (const cp of parseToUnicodeCodePoints(bytes.toString('latin1'))) points.add(cp);
  }
  return { points, cmapCount: count };
}

/**
 * تقرير النصّ لمستند واحد: هل يحمل حرفًا عربيًا؟ وهل يحمل ديفاناغارية؟
 * `arabicSamples` تعرض السياق حول أول المواضع، فيُعرف **أين** التسرّب لا أنه موجود فقط.
 */
function scanPdfScripts(buf) {
  const pages = extractPdfText(buf);
  const all = pages.join('\n');
  const arabicChars = [...all].filter((ch) => ARABIC_BLOCKS.test(ch));
  const samples = [];
  for (let i = 0; i < all.length && samples.length < 5; i += 1) {
    if (!ARABIC_BLOCKS.test(all[i])) continue;
    samples.push(all.slice(Math.max(0, i - 20), i + 20));
    i += 40;
  }
  // الفحص الحاسم: كل نقطة ترميز مرسومة في المستند، من خرائط `/ToUnicode`.
  const drawn = pdfDrawnCodePoints(buf);
  const drawnArabic = [];
  const drawnDevanagari = [];
  for (const cp of drawn.points) {
    const ch = String.fromCodePoint(cp);
    if (ARABIC_BLOCKS.test(ch)) drawnArabic.push(ch);
    if (DEVANAGARI.test(ch)) drawnDevanagari.push(ch);
  }

  return {
    pageCount: pages.length,
    totalChars: all.length,
    arabicCharCount: arabicChars.length,
    arabicSamples: samples,
    // مصدر الحكم: الرموز المرسومة فعلًا، لا الوسوم النصية وحدها.
    toUnicodeMapsRead: drawn.cmapCount,
    drawnCodePoints: drawn.points.size,
    drawnArabicChars: drawnArabic.sort(),
    hasArabicScript: arabicChars.length > 0 || drawnArabic.length > 0,
    hasDevanagari: DEVANAGARI.test(all) || drawnDevanagari.length > 0,
  };
}

module.exports = { extractPdfText, scanPdfScripts, pdfDrawnCodePoints };
