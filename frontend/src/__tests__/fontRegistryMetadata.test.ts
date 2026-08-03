/**
 * سجل الخطوط v2 — اختبار **يقارن البيانات بالواقع**، لا يعيد كتابتها.
 *
 * لماذا هذا الاختبار موجود
 * ────────────────────────
 * `weights` و`supportsBold` و`supportsItalic` مُشتقّة من ملفات الخطوط وقواعد
 * `@font-face` الفعلية. بيانات وصفية من هذا النوع تتعفّن بصمت: يُضاف وزن إلى
 * `fonts.css` ولا يُضاف إلى السجل، أو يُحذف وجه ويبقى مُعلَنًا في السجل — ولا
 * شيء ينهار، فقط يعرض المنتقي وعودًا كاذبة ويصطنع المتصفح ما لا يملكه.
 *
 * فالاختبار **يقرأ ملفَّي CSS الحقيقيين** ويستخرج منهما قواعد `@font-face`،
 * ثم يطابقهما بالسجل. أي انحراف مستقبلي يسقط هنا لا في عين المستخدم.
 *
 * `Cairo` و`Tahoma` مستثنيان من مطابقة الملفات: الأول يأتي من `@fontsource`
 * والثاني من نظام التشغيل — وكلاهما موثَّق في `assets/fonts/fonts.css`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS_AR,
  FONT_IDS,
  FontRegistry,
  findFont,
  fontStackFor,
  fontStackOf,
  getAllFonts,
  getDefaultFontFor,
  getEnabledFonts,
  getFont,
  getFontsByCategory,
  getFontsFor,
  getOfficialFonts,
  getUIFonts,
  isFontId,
  searchFonts,
  type FontId,
  type FontUsage,
} from '../styles/fontRegistry';

const SRC = resolve(__dirname, '..');

/** كل نص CSS الذي يُعلن خطوط المشروع، مجموعًا كما يراه المتصفح. */
const CSS = [
  readFileSync(resolve(SRC, 'assets/fonts/fonts.css'), 'utf8'),
  readFileSync(resolve(SRC, 'styles/fonts.css'), 'utf8'),
].join('\n');

interface Face {
  family: string;
  weight: number;
  italic: boolean;
}

/** استخراج كل قواعد `@font-face` من نص CSS خام. */
function parseFaces(css: string): Face[] {
  const faces: Face[] = [];
  for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = block[1];
    const family = /font-family:\s*"([^"]+)"/.exec(body)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(body)?.[1];
    const style = /font-style:\s*(\w+)/.exec(body)?.[1];
    if (!family || !weight) continue;
    faces.push({ family, weight: Number(weight), italic: style === 'italic' });
  }
  return faces;
}

const FACES = parseFaces(CSS);

/** خطوط لا `@font-face` لها في المستودع — ولكل واحد سبب موثَّق. */
const NOT_DECLARED_IN_CSS: Record<string, string> = {
  cairo: '@fontsource/cairo',
  tahoma: 'خط نظام Windows',
};

describe('سجل الخطوط v2 — سلامة البنية', () => {
  it('المفتاح يساوي `id` في كل مدخلة', () => {
    for (const id of FONT_IDS) {
      expect(FontRegistry[id].id).toBe(id);
    }
  });

  it('اثنتا عشرة عائلة، ولا اسم عائلة مكرَّر', () => {
    const families = getAllFonts().map((f) => f.family);
    expect(families).toHaveLength(12);
    expect(new Set(families).size).toBe(12);
  });

  it('كل تصنيف معرَّف يحمل خطًّا واحدًا على الأقل وله تسمية عربية', () => {
    for (const c of FONT_CATEGORIES) {
      expect(getFontsByCategory(c).length).toBeGreaterThan(0);
      expect(FONT_CATEGORY_LABELS_AR[c]).toBeTruthy();
    }
  });

  it('لا خط خارج التصنيفات المعرَّفة', () => {
    for (const f of getAllFonts()) {
      expect(FONT_CATEGORIES).toContain(f.category);
    }
  });

  it('الأوزان مرتَّبة تصاعديًا وبلا تكرار وغير فارغة', () => {
    for (const f of getAllFonts()) {
      expect(f.weights.length).toBeGreaterThan(0);
      expect([...f.weights]).toEqual([...f.weights].slice().sort((a, b) => a - b));
      expect(new Set(f.weights).size).toBe(f.weights.length);
    }
  });

  it('`supportsBold` يساوي وجود وزن ≥ 600 حقيقي — لا وعدًا يصطنعه المتصفح', () => {
    for (const f of getAllFonts()) {
      expect(f.supportsBold).toBe(f.weights.some((w) => w >= 600));
    }
  });

  it('المقاس وارتفاع السطر ضمن نطاق معقول', () => {
    for (const f of getAllFonts()) {
      expect(f.defaultSize).toBeGreaterThanOrEqual(10);
      expect(f.defaultSize).toBeLessThanOrEqual(48);
      expect(f.defaultLineHeight).toBeGreaterThanOrEqual(1);
      expect(f.defaultLineHeight).toBeLessThanOrEqual(2.5);
    }
  });

  it('نص المعاينة غير فارغ لكل خط', () => {
    for (const f of getAllFonts()) {
      expect(f.previewText.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('سجل الخطوط v2 — مطابقة البيانات بقواعد @font-face الفعلية', () => {
  it('كل عائلة مسجَّلة معلَنة في CSS، أو مستثناة بسبب موثَّق', () => {
    for (const f of getAllFonts()) {
      const declared = FACES.some((face) => face.family === f.family);
      if (NOT_DECLARED_IN_CSS[f.id]) {
        expect(declared).toBe(false); // لو أُعلنت لاحقًا فالاستثناء صار قديمًا
      } else {
        expect(declared, `${f.family} بلا @font-face`).toBe(true);
      }
    }
  });

  it('أوزان السجل تطابق الأوزان المُعلَنة حرفيًا', () => {
    for (const f of getAllFonts()) {
      if (NOT_DECLARED_IN_CSS[f.id]) continue;
      const declared = [
        ...new Set(FACES.filter((x) => x.family === f.family && !x.italic).map((x) => x.weight)),
      ].sort((a, b) => a - b);
      expect(declared, `أوزان ${f.family}`).toEqual([...f.weights]);
    }
  });

  it('`supportsItalic` صحيح فقط حين يوجد وجه مائل مُعلَن', () => {
    for (const f of getAllFonts()) {
      if (NOT_DECLARED_IN_CSS[f.id]) continue;
      const hasItalic = FACES.some((x) => x.family === f.family && x.italic);
      expect(f.supportsItalic, `${f.family} italic`).toBe(hasItalic);
    }
  });

  it('Amiri هو الخط الوحيد الذي يملك وجهًا مائلًا حقيقيًا', () => {
    const italics = getAllFonts().filter((f) => f.supportsItalic).map((f) => f.id);
    expect(italics).toEqual(['amiri']);
  });
});

describe('سجل الخطوط v2 — واجهة الاستعلام', () => {
  it('`getFont` يُرجع المدخلة نفسها', () => {
    expect(getFont('amiri').family).toBe('Amiri');
  });

  it('`findFont` يتحمّل القيم المجهولة والفارغة بدل الانهيار', () => {
    expect(findFont('amiri')?.id).toBe('amiri');
    expect(findFont('font-was-removed')).toBeUndefined();
    expect(findFont(null)).toBeUndefined();
    expect(findFont(undefined)).toBeUndefined();
    expect(findFont('')).toBeUndefined();
  });

  it('`findFont` لا يخترق سلسلة النماذج الأولية', () => {
    expect(findFont('toString')).toBeUndefined();
    expect(findFont('constructor')).toBeUndefined();
  });

  it('`isFontId` حارس نوع يوافق `findFont`', () => {
    expect(isFontId('cairo')).toBe(true);
    expect(isFontId('nope')).toBe(false);
    expect(isFontId(null)).toBe(false);
  });

  it('`getUIFonts` و`getOfficialFonts` اختصاران لـ`getFontsByCategory`', () => {
    expect(getUIFonts()).toEqual(getFontsByCategory('UI'));
    expect(getOfficialFonts()).toEqual(getFontsByCategory('Official'));
    expect(getOfficialFonts().map((f) => f.id).sort()).toEqual([
      'amiri',
      'simplifiedArabic',
      'traditionalArabic',
    ]);
  });

  it('كل خط افتراضي مُفعَّل ويذكر استعماله في `recommendedFor`', () => {
    const usages: FontUsage[] = [
      'ui',
      'body',
      'headings',
      'tables',
      'numbers',
      'letters',
      'contracts',
      'books',
      'certificates',
      'display',
      'quran',
    ];
    for (const u of usages) {
      const def = getDefaultFontFor(u);
      expect(def.enabled, `${u} → ${def.id} معطَّل`).toBe(true);
      expect(def.recommendedFor, `${u} → ${def.id}`).toContain(u);
      expect(getFontsFor(u)).toContainEqual(def);
    }
  });

  it('`getEnabledFonts` يستبعد المعطَّل — وكلها مفعَّلة اليوم', () => {
    expect(getEnabledFonts()).toEqual(getAllFonts());
  });

  it('سلاسل الخطوط مقتبسة وتنتهي بالاحتياط نفسه', () => {
    expect(fontStackFor('traditionalArabic')).toBe('"Traditional Arabic", Arial, sans-serif');
    expect(fontStackOf(getFont('amiri'))).toBe('"Amiri", Arial, sans-serif');
    for (const id of FONT_IDS) {
      expect(fontStackFor(id as FontId)).toMatch(/, Arial, sans-serif$/);
    }
  });
});

describe('سجل الخطوط v2 — البحث', () => {
  const ids = (q: string) => searchFonts(q).map((f) => f.id);

  it('«trad» يصل مباشرة إلى Traditional Arabic', () => {
    expect(ids('trad')).toEqual(['traditionalArabic']);
  });

  it('البحث غير حسّاس لحالة الأحرف', () => {
    expect(ids('AMIRI')).toEqual(['amiri']);
  });

  it('يبحث في المرادفات العربية مع تطبيع الهمزات', () => {
    expect(ids('أميري')).toEqual(['amiri']);
    expect(ids('اميري')).toEqual(['amiri']);
    expect(ids('نسخ')).toEqual(['droidNaskh']);
  });

  it('يبحث في التصنيف', () => {
    expect(ids('official').sort()).toEqual(getOfficialFonts().map((f) => f.id).sort());
  });

  it('النص الفارغ يُرجع القائمة كاملة، والنص غير المطابق يُرجع فراغًا', () => {
    expect(searchFonts('')).toHaveLength(12);
    expect(searchFonts('   ')).toHaveLength(12);
    expect(searchFonts('zzzzz')).toHaveLength(0);
  });

  it('يحترم النطاق المُمرَّر بدل السجل كاملًا', () => {
    expect(searchFonts('a', getUIFonts()).every((f) => f.category === 'UI')).toBe(true);
  });
});
