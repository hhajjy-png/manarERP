// @vitest-environment node
/**
 * PERMANENT GUARD — عقد تسمية المؤشرات المالية.
 *
 * تدقيق 2026-08-22 وجد اسمًا واحدًا يحمل معادلات مختلفة في صفحات مختلفة: «نسبة التحصيل»
 * لثلاث صيغ، و«إجمالي المصروفات» لمجموعتين (معتمدة فقط / كل الحالات)، ومركز دونات
 * يعرض مجموع أعلى 5 عملاء تحت عنوان «إجمالي الإيرادات». أرقام صحيحة، عناوين مضلِّلة.
 *
 * هذا الملف يختبر **العقد** لا العرض: أن المفاتيح المتمايزة بقيت متمايزة، وأن الصفحات
 * التي لها نطاق مختلف لا تستعير مفتاح المؤشر التشغيلي. المرجع النصّي:
 * `docs/financial-kpi-definitions.md`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractDictionaries } from './helpers/i18nPlaceholderIntegrity';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '..');
const DICTS = extractDictionaries(path.join(SRC_ROOT, 'lib/i18n.ts'));
const LOCALES = Object.keys(DICTS);

const read = (rel: string): string => fs.readFileSync(path.join(SRC_ROOT, rel), 'utf8');
const valueOf = (locale: string, key: string): string | undefined => DICTS[locale]?.get(key);

/** كل مفتاح مستخدَم في الواجهة يجب أن يوجد في كل اللغات، وإلا ظهر المفتاح خامًا. */
function expectKeyInEveryLocale(key: string): void {
  for (const locale of LOCALES) {
    expect(valueOf(locale, key), `${key} مفقود في ${locale}`).toBeTruthy();
  }
}

describe('نسب التحصيل — أربع معادلات، أربعة أسماء متمايزة', () => {
  const RATE_KEYS = [
    'fac.kpi.collection_rate',   // كفاءة التحصيل CEI  — المحصَّل ÷ (أول المدة + فواتير الفترة)
    'fac.col.collection_rate',   // تراكمية            — المحصَّل التراكمي ÷ المفوتَر التراكمي
    'ca.kpi.collection_rate',    // ضمن النطاق         — المحصَّل ÷ قيمة الفواتير المفلترة
    'exec.kpi.collection_rate',  // نسبة الفترة        — المحصَّل ÷ إيراد الفترة
  ];

  it('كل مفتاح موجود في كل اللغات', () => {
    RATE_KEYS.forEach(expectKeyInEveryLocale);
  });

  it.each(LOCALES)('لا اسمين متطابقين لمعادلتين مختلفتين — %s', (locale) => {
    const labels = RATE_KEYS.map((k) => valueOf(locale, k)!);
    expect(new Set(labels).size).toBe(RATE_KEYS.length);
  });

  it('عمود §4 (CEI) وعمود §5 (التراكمية) مفتاحان مختلفان', () => {
    const fac = read('pages/FinancialAnalysisCenter.tsx');
    expect(fac).toContain("t('fac.col.cei_rate')");
    expect(fac).toContain("t('fac.col.collection_rate')");
    for (const locale of LOCALES) {
      expect(valueOf(locale, 'fac.col.cei_rate')).not.toBe(valueOf(locale, 'fac.col.collection_rate'));
    }
  });

  it('«رصيد آخر الفترة» (§4) و«الرصيد المستحق» (§5) اسمان مختلفان', () => {
    for (const locale of LOCALES) {
      expect(valueOf(locale, 'fac.col.closing_balance')).not.toBe(valueOf(locale, 'fac.col.outstanding'));
    }
  });

  it('§4 يعرض رصيد أول المدة فتصير معادلة الرصيد الختامي مقروءة', () => {
    const fac = read('pages/FinancialAnalysisCenter.tsx');
    expect(fac).toContain("t('fac.col.opening_ar')");
    expect(fac).toContain("t('fac.kpi.opening_ar')");
    ['fac.col.opening_ar', 'fac.kpi.opening_ar', 'fac.kpi.cei_sub', 'fac.kpi.closing_sub'].forEach(expectKeyInEveryLocale);
  });
});

describe('وصف §4 يشرح المعادلة المطبَّقة لا صيغة تاريخية', () => {
  it('لم يعد يصف «فواتير الفترة ناقص تحصيلات الفترة»', () => {
    expect(valueOf('ar', 'fac.note.collections')).not.toContain('فواتير الفترة ناقص تحصيلات الفترة');
    expect(valueOf('en', 'fac.note.collections')).not.toMatch(/period invoices minus period collections/i);
  });

  it('يذكر CEI ورصيد أول المدة صراحةً', () => {
    expect(valueOf('ar', 'fac.note.collections')).toContain('CEI');
    expect(valueOf('ar', 'fac.note.collections')).toContain('رصيد أول المدة');
    expect(valueOf('en', 'fac.note.collections')).toMatch(/CEI/);
    expect(valueOf('en', 'fac.note.collections')).toMatch(/opening receivables/i);
  });
});

describe('المصروفات — المؤشر التشغيلي منفصل عن مجموعة الصفحة', () => {
  it('صفحة المصروفات لا تستعير مفتاح المؤشر التشغيلي', () => {
    const page = read('pages/Expenses.tsx');
    expect(page).toContain("t('exp.stats.total_all_statuses')");
    expect(page).not.toContain("t('kpi.total_expenses')");
  });

  it('المفتاح التشغيلي ما زال مستخدَمًا في السطوح التشغيلية وحدها', () => {
    expect(read('components/dashboard/command/KpiRowSection.tsx')).toContain("t('kpi.total_expenses')");
    expect(read('pages/ExecutiveDecisionCenter.tsx')).toContain("t('kpi.total_expenses')");
  });

  it('اسم مجموعة الصفحة يوضّح شمولها غير المعتمدة', () => {
    ['exp.stats.total_all_statuses', 'exp.stats.all_statuses_sub'].forEach(expectKeyInEveryLocale);
    expect(valueOf('ar', 'exp.stats.all_statuses_sub')).toContain('غير المعتمدة');
    for (const locale of LOCALES) {
      expect(valueOf(locale, 'exp.stats.total_all_statuses')).not.toBe(valueOf(locale, 'kpi.total_expenses'));
    }
  });
});

describe('توزيع الإيرادات — مجموع أعلى 5 لا يُسمّى إجمالي الإيرادات', () => {
  it('مركز الدونات يستخدم مفتاح أعلى 5 لا مفتاح الإيراد الكلي', () => {
    const donut = read('components/dashboard/command/RevenueDistributionSection.tsx');
    expect(donut).toContain("t('db.cc.top5_total')");
    expect(donut).not.toContain("t('kpi.total_revenue')");
  });

  it('اسم أعلى 5 يذكر نطاقه ويختلف عن إجمالي الإيرادات', () => {
    expectKeyInEveryLocale('db.cc.top5_total');
    expect(valueOf('ar', 'db.cc.top5_total')).toContain('5');
    for (const locale of LOCALES) {
      expect(valueOf(locale, 'db.cc.top5_total')).not.toBe(valueOf(locale, 'kpi.total_revenue'));
    }
  });
});

describe('الفواتير — أسماء تصف نطاقها الفعلي', () => {
  it('«المتبقي المستحق» يصرّح باستبعاد الملغاة', () => {
    expectKeyInEveryLocale('inv.stats.remaining_sub');
    expect(valueOf('ar', 'inv.stats.remaining_sub')).toContain('الملغاة');
    expect(read('pages/Invoices.tsx')).toContain("t('inv.stats.remaining_sub')");
  });

  it('إجمالي الصفحة والمسدَّد لا يوحيان بإيراد أو تحصيل من العملاء', () => {
    expect(valueOf('ar', 'inv.stats.total_sales')).toContain('المعروضة');
    expect(valueOf('ar', 'inv.stats.total_sales')).not.toBe(valueOf('ar', 'kpi.total_revenue'));
    // «المحصل» صار «المسدَّد»: المجموعة تشمل الشراء، والتحصيل مصطلح خاص بالعملاء.
    expect(valueOf('ar', 'inv.stats.collected')).not.toContain('المحصل');
  });
});

describe('ذمم العملاء ونوافذ الانتهاء', () => {
  it('بطاقة لوحة المعلومات صارت تسمّي الذمم بأصحابها', () => {
    expect(valueOf('ar', 'page.dashboard.due_payments')).toContain('العملاء');
    expect(valueOf('ar', 'stat.unpaid')).toContain('بيع');
  });

  it('رقاقات «ينتهي قريبًا» تذكر نافذة الثلاثين يومًا', () => {
    for (const key of ['today.expiring_contracts', 'today.no_expiring_contracts', 'today.expiry_warnings']) {
      expectKeyInEveryLocale(key);
      expect(valueOf('ar', key), key).toContain('30');
      expect(valueOf('en', key), key).toMatch(/30 days/);
    }
  });
});

describe('سجل التعريفات موجود ويغطي المؤشرات المتعارضة', () => {
  const REGISTRY = path.resolve(SRC_ROOT, '../../docs/financial-kpi-definitions.md');

  it('الملف موجود', () => {
    expect(fs.existsSync(REGISTRY)).toBe(true);
  });

  it('يعرّف كل مؤشر ظهر فيه تعارض', () => {
    const doc = fs.readFileSync(REGISTRY, 'utf8');
    for (const term of [
      'كفاءة التحصيل (CEI)', 'نسبة التحصيل التراكمية', 'نسبة التحصيل ضمن النطاق',
      'نسبة تحصيل الفترة', 'إجمالي المصروفات المسجّلة', 'إجمالي أعلى 5 عملاء',
      'المتبقي المستحق', 'رصيد أول المدة', 'رصيد آخر الفترة',
    ]) {
      expect(doc, term).toContain(term);
    }
  });
});
