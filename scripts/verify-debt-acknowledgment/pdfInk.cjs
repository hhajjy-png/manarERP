/**
 * Minimal PDF ink-extent reader — measurement only, never shipped in the app.
 *
 * WHY IT EXISTS: the Employee Debt Acknowledgment must leave a 40mm band clear at the
 * top and a 20mm band clear at the bottom of EVERY printed page. The only honest way to
 * check that is to look at the bytes Chromium actually produced, so this walks each
 * page's content stream and records where ink is placed.
 *
 * WHAT IT UNDERSTANDS: the operator subset Skia (Chromium's PDF backend) emits —
 * `q`/`Q`/`cm` (graphics state + transform), `re`/`m`/`l`/`c`/`v`/`y` (paths), and
 * `BT`/`ET`/`Tf`/`Tm`/`Td`/`TD`/`T*`/`TL` plus the text-showing operators. It is NOT a
 * general PDF parser and makes no attempt to be one; anything it cannot read is
 * reported rather than guessed at.
 *
 * TEXT IS MEASURED CONSERVATIVELY: a text-showing operator gives a BASELINE, not a
 * glyph box, so the glyph top is estimated at baseline + 0.9 × effective font size and
 * the bottom at baseline − 0.25 × that size. Both are generous relative to real
 * ascent/descent ratios, so the reported clear bands are a LOWER bound on the truth.
 */
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const PT_PER_MM = 72 / 25.4;

/** 2D affine matrix [a b c d e f], PDF order. */
function mul(m, n) {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Vertical scale factor of a matrix — used to size the conservative glyph box. */
function scaleY(m) {
  return Math.hypot(m[1], m[3]) || 1;
}

function inflateStream(dict, raw) {
  if (/\/FlateDecode/.test(dict)) {
    try {
      return zlib.inflateSync(raw);
    } catch {
      try {
        return zlib.inflateRawSync(raw);
      } catch {
        return null;
      }
    }
  }
  return raw;
}

/** All `N 0 obj … endobj` bodies, keyed by object number. */
function indexObjects(buf) {
  const latin = buf.toString('latin1');
  const objects = new Map();
  const re = /(\d+)\s+0\s+obj\b/g;
  let m;
  while ((m = re.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endobj', start);
    if (end === -1) continue;
    objects.set(Number(m[1]), { start, end, text: latin.slice(start, end) });
  }
  return { latin, objects };
}

/** Raw stream bytes of an object, decoded if Flate. */
function streamBytes(buf, latin, obj) {
  const sIdx = latin.indexOf('stream', obj.start);
  if (sIdx === -1 || sIdx > obj.end) return null;
  const dict = latin.slice(obj.start, sIdx);
  let dataStart = sIdx + 'stream'.length;
  if (latin[dataStart] === '\r') dataStart += 1;
  if (latin[dataStart] === '\n') dataStart += 1;
  const endIdx = latin.indexOf('endstream', dataStart);
  if (endIdx === -1) return null;
  return inflateStream(dict, buf.subarray(dataStart, endIdx));
}

/** Tokenise a content stream into numbers, names, strings and operators. */
function tokenize(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '%') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\0' || ch === '\f') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      let depth = 1;
      i += 1;
      while (i < n && depth > 0) {
        if (text[i] === '\\') i += 2;
        else {
          if (text[i] === '(') depth += 1;
          else if (text[i] === ')') depth -= 1;
          i += 1;
        }
      }
      out.push({ t: 'str' });
      continue;
    }
    if (ch === '<' && text[i + 1] !== '<') {
      const close = text.indexOf('>', i);
      i = close === -1 ? n : close + 1;
      out.push({ t: 'str' });
      continue;
    }
    if (ch === '<' || ch === '>') {
      i += 2;
      out.push({ t: 'dict' });
      continue;
    }
    if (ch === '[' || ch === ']') {
      i += 1;
      out.push({ t: ch });
      continue;
    }
    if (ch === '/') {
      let j = i + 1;
      while (j < n && !/[\s/[\]<>()]/.test(text[j])) j += 1;
      out.push({ t: 'name', v: text.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (/[-+.\d]/.test(ch)) {
      let j = i;
      while (j < n && /[-+.\deE]/.test(text[j])) j += 1;
      const v = Number(text.slice(i, j));
      out.push({ t: 'num', v: Number.isFinite(v) ? v : 0 });
      i = j;
      continue;
    }
    let j = i;
    while (j < n && /[A-Za-z*'"]/.test(text[j])) j += 1;
    if (j === i) {
      i += 1;
      continue;
    }
    out.push({ t: 'op', v: text.slice(i, j) });
    i = j;
  }
  return out;
}

/**
 * Vertical (and horizontal) INK extents of one content stream, in PDF points.
 *
 * "Ink" means marks a reader would actually see on the sheet. Four classes of
 * operation are deliberately NOT counted, because counting them reports a band as
 * occupied when the paper is in fact blank:
 *
 *   · WHITE-ON-WHITE FILLS. Chromium paints the document background as rectangles that
 *     routinely extend past the printable area (a real one from this document:
 *     `0 896 669 896 re f` in white, reaching 615pt BELOW the sheet).
 *   · CLIPPED-AWAY CONTENT. This is the decisive one for a paginated document. Chromium
 *     emits, on each page, glyph runs belonging to the element that straddles the page
 *     break — then hides them behind the page's clipping path (`… re W* n`). They are
 *     invisible on paper. Without honouring the clip, the annex heading Chromium
 *     re-emits at the foot of the previous page reads as a 7mm intrusion into the 20mm
 *     letterhead band that does not exist in the printed output.
 *   · CLIPPING PATHS THEMSELVES (`W`/`W*` then `n`) — a clip marks nothing.
 *   · INVISIBLE TEXT (render mode 3, and clip-only mode 7).
 *
 * Everything else — filled or stroked paths in any non-white colour, and visible text —
 * is measured, intersected with the clip in force at the moment it is painted.
 */
function isWhite(color) {
  if (!color || color.length === 0) return false;
  if (color.length === 4) return color.every((c) => c <= 0.01); // CMYK
  return color.every((c) => c >= 0.99); // Gray / RGB
}

const NO_CLIP = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };

function bboxOf(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

function intersect(a, b) {
  return {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
}

function inkExtents(content) {
  const tokens = tokenize(content);
  let ctm = [1, 0, 0, 1, 0, 0];
  let fill = [0];
  let stroke = [0];
  let clip = NO_CLIP;
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let fontSize = 10;
  let renderMode = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let ops = 0;
  /** صناديق الحبر المرئي بالترتيب — تُختصر إلى بصمة واحدة عند الخروج. */
  const inkPrints = [];

  /** Points of the path being constructed, already in device space. */
  let pending = [];
  /** A `W`/`W*` was seen; the next painting or `n` operator installs the clip. */
  let clipPendingFlag = false;

  /** Record a box after clipping. Zero-height/width boxes still count (a hairline). */
  const markBox = (box) => {
    const v = intersect(box, clip);
    if (v.x1 < v.x0 || v.y1 < v.y0) return; // fully clipped away
    // صندوق كل عملية رسم نجت من القصّ. يُحتفظ به خامًا هنا، وتُبنى البصمة منه عند
    // الخروج بعد **تصفير المبدأ** (انظر أدناه).
    inkPrints.push(v);
    if (!Number.isFinite(v.x0) || !Number.isFinite(v.y0) || !Number.isFinite(v.x1) || !Number.isFinite(v.y1)) return;
    ops += 1;
    if (v.x0 < minX) minX = v.x0;
    if (v.x1 > maxX) maxX = v.x1;
    if (v.y0 < minY) minY = v.y0;
    if (v.y1 > maxY) maxY = v.y1;
  };

  const add = (x, y) => {
    const [dx, dy] = apply(ctm, x, y);
    pending.push([dx, dy]);
  };

  const installClipIfRequested = () => {
    if (!clipPendingFlag) return;
    clipPendingFlag = false;
    if (pending.length) clip = intersect(clip, bboxOf(pending));
  };

  const paint = (fills, strokes) => {
    const visible = (fills && !isWhite(fill)) || (strokes && !isWhite(stroke));
    if (visible && pending.length) markBox(bboxOf(pending));
    installClipIfRequested();
    pending = [];
  };

  const nums = [];
  for (const tok of tokens) {
    if (tok.t === 'num') {
      nums.push(tok.v);
      continue;
    }
    if (tok.t !== 'op') {
      if (tok.t === '[' || tok.t === ']' || tok.t === 'str' || tok.t === 'name' || tok.t === 'dict') continue;
      nums.length = 0;
      continue;
    }
    const a = nums.slice();
    nums.length = 0;
    switch (tok.v) {
      case 'q':
        stack.push({ ctm: ctm.slice(), fill: fill.slice(), stroke: stroke.slice(), clip });
        break;
      case 'Q': {
        const prev = stack.pop();
        if (prev) {
          ctm = prev.ctm;
          fill = prev.fill;
          stroke = prev.stroke;
          clip = prev.clip;
        }
        break;
      }
      case 'cm':
        if (a.length >= 6) ctm = mul(a.slice(-6), ctm);
        break;

      // colour
      case 'g':
      case 'rg':
      case 'k':
      case 'sc':
      case 'scn':
        if (a.length) fill = a.slice();
        break;
      case 'G':
      case 'RG':
      case 'K':
      case 'SC':
      case 'SCN':
        if (a.length) stroke = a.slice();
        break;

      // path construction
      case 're': {
        if (a.length < 4) break;
        const rect = a.slice(-4);
        add(rect[0], rect[1]);
        add(rect[0] + rect[2], rect[1]);
        add(rect[0], rect[1] + rect[3]);
        add(rect[0] + rect[2], rect[1] + rect[3]);
        break;
      }
      case 'm':
      case 'l':
        if (a.length >= 2) add(a[a.length - 2], a[a.length - 1]);
        break;
      case 'c':
      case 'v':
      case 'y':
        for (let k = 0; k + 1 < a.length; k += 2) add(a[k], a[k + 1]);
        break;
      case 'h':
        break;

      // clipping
      case 'W':
      case 'W*':
        clipPendingFlag = true;
        break;

      // path painting
      case 'f':
      case 'F':
      case 'f*':
        paint(true, false);
        break;
      case 'S':
      case 's':
        paint(false, true);
        break;
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
        paint(true, true);
        break;
      case 'n':
        installClipIfRequested();
        pending = [];
        break;

      // text
      case 'BT':
        tm = [1, 0, 0, 1, 0, 0];
        tlm = tm.slice();
        break;
      case 'Tf':
        if (a.length >= 1) fontSize = a[a.length - 1];
        break;
      case 'Tr':
        if (a.length >= 1) renderMode = a[a.length - 1];
        break;
      case 'TL':
        if (a.length >= 1) leading = a[a.length - 1];
        break;
      case 'Tm':
        if (a.length >= 6) {
          tm = a.slice(-6);
          tlm = tm.slice();
        }
        break;
      case 'Td':
        if (a.length >= 2) {
          tlm = mul([1, 0, 0, 1, a[a.length - 2], a[a.length - 1]], tlm);
          tm = tlm.slice();
        }
        break;
      case 'TD':
        if (a.length >= 2) {
          leading = -a[a.length - 1];
          tlm = mul([1, 0, 0, 1, a[a.length - 2], a[a.length - 1]], tlm);
          tm = tlm.slice();
        }
        break;
      case 'T*':
        tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
        tm = tlm.slice();
        break;
      case 'Tj':
      case 'TJ':
      case "'":
      case '"': {
        if (tok.v === "'" || tok.v === '"') {
          tlm = mul([1, 0, 0, 1, 0, -leading], tlm);
          tm = tlm.slice();
        }
        const invisible = renderMode === 3 || renderMode === 7;
        const whiteText =
          (renderMode === 0 || renderMode === 2 || renderMode === 4 || renderMode === 6) && isWhite(fill);
        if (invisible || whiteText) break;
        const full = mul(tm, ctm);
        const size = Math.abs(fontSize) * scaleY(full);
        const origin = apply(full, 0, 0);
        markBox({ x0: origin[0], x1: origin[0], y0: origin[1] - 0.25 * size, y1: origin[1] + 0.9 * size });
        break;
      }
      default:
        pending = [];
        break;
    }
  }

  if (ops === 0) return null;

  /**
   * بصمة **ترتيب** الحبر على الورقة: مواضع الصناديق منسوبةً إلى ركن مربّع الحبر نفسه،
   * بدقّة عُشر النقطة.
   *
   * ═══ لماذا تُنسب إلى المبدأ ولا تُؤخذ خامًا ═══
   * Chromium يضع محتوى المستند كلّه في فضاء تدفّق واحد، ويعطي كل صفحة `cm` ينقل ذلك
   * الفضاء إلى صندوقها. فصفحتان متطابقتان المحتوى تفترقان في التدفّق بمقدار ثابت،
   * ويُعوَّض بفارق ثابت في `cm` — لكن `cm` مكتوب في الملف بأربع خانات عشرية، فيبقى
   * خطأ تقريب واحد مشترك (~5×10⁻⁵ نقطة) على كل إحداثيات الصفحة. وهو أصغر من أن يُرى،
   * لكنه يكفي لقلب تقريبٍ عند حدّ عُشر النقطة في بضعة إحداثيات من آلاف — فتختلف بصمة
   * صفحتين متطابقتين حرفًا بحرف. قِيس ذلك: الإحداثيات نفسها بالضبط، بفارق صفحة كامل
   * في التدفّق، ولا فرق ثالث.
   *
   * الخطأ نفسه يقع على `minX`/`minY`، فطرحُهما يُلغيه **بالضبط** لا بالتقريب. وما
   * تفقده البصمة بذلك — الموضع المطلق على الورقة — مفحوصٌ مستقلًّا وبدقّة أعلى عبر
   * أحزمة الصفحة الأربعة (`topClearMm` وإخوته)، ويقارنها المقياس بين النسختين أيضًا.
   */
  const sig = inkPrints
    .map(
      (v) =>
        `${Math.round((v.x0 - minX) * 10)},${Math.round((v.y0 - minY) * 10)},` +
        `${Math.round((v.x1 - minX) * 10)},${Math.round((v.y1 - minY) * 10)}`,
    )
    .join(';');

  return {
    minX,
    maxX,
    minY,
    maxY,
    ops,
    visibleInkSha: createHash('sha256').update(sig).digest('hex').slice(0, 16),
  };
}

/**
 * Per-page geometry of a Chromium-generated PDF, in millimetres measured from the
 * PHYSICAL SHEET EDGES (PDF's own origin is bottom-left, which is not how a printer
 * operator thinks about a letterhead band).
 */
function measurePdf(buf) {
  const { latin, objects } = indexObjects(buf);
  const pages = [];

  for (const [, obj] of objects) {
    if (!/\/Type\s*\/Page(?![s\w])/.test(obj.text)) continue;
    const mediaBox = obj.text.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    const contents = obj.text.match(/\/Contents\s+(\d+)\s+0\s+R/);
    pages.push({
      widthPt: mediaBox ? Number(mediaBox[3]) - Number(mediaBox[1]) : null,
      heightPt: mediaBox ? Number(mediaBox[4]) - Number(mediaBox[2]) : null,
      contentsRef: contents ? Number(contents[1]) : null,
    });
  }

  const measured = pages.map((page, index) => {
    const result = {
      index: index + 1,
      widthMm: page.widthPt === null ? null : page.widthPt / PT_PER_MM,
      heightMm: page.heightPt === null ? null : page.heightPt / PT_PER_MM,
      topClearMm: null,
      bottomClearMm: null,
      leftClearMm: null,
      rightClearMm: null,
      inkOps: 0,
      readable: false,
      // بصمة الحبر المرئي بعد القصّ (انظر markBox). صفحتان متطابقتا البصمة وضعتا
      // الحبر نفسه في المواضع نفسها — دليل تطابق لا يعتمد على قراءة النصّ ولا على
      // ترتيب الموارد، ولا يخدعه ما يقصّه المتصفح عند حدّ الصفحة.
      visibleInkSha: null,
    };
    if (page.contentsRef === null || page.heightPt === null) return result;
    const obj = objects.get(page.contentsRef);
    if (!obj) return result;
    const bytes = streamBytes(buf, latin, obj);
    if (!bytes) return result;
    const ext = inkExtents(bytes.toString('latin1'));
    if (!ext) return result;
    result.readable = true;
    result.inkOps = ext.ops;
    result.visibleInkSha = ext.visibleInkSha;
    result.topClearMm = (page.heightPt - ext.maxY) / PT_PER_MM;
    result.bottomClearMm = ext.minY / PT_PER_MM;
    result.leftClearMm = ext.minX / PT_PER_MM;
    result.rightClearMm = (page.widthPt - ext.maxX) / PT_PER_MM;
    return result;
  });

  return { pageCount: pages.length, pages: measured };
}

module.exports = { measurePdf, inkExtents, PT_PER_MM };
