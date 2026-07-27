// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PROTECTED_NAV_KEYS,
  isProtectedNavKey,
  permittedNav,
  sanitizeHiddenNavKeys,
  visibleNav,
} from '../config/navVisibility';
import { NAV } from '../config/modules';
import { useUI } from '../stores/uiStore';

/**
 * إدارة ظهور صفحات الشريط الجانبي — الطبقة الصافية والتخزين.
 *
 * ما تُثبته هذه الاختبارات: الإخفاء تفضيل عرض فقط، الصلاحيات تبقى فوقه، الحفظ
 * بمفاتيح ثابتة لا بالنصوص المترجَمة، والافتراضي هو السلوك الحالي بلا تغيير.
 */

const HIDDEN_KEY = 'manarERP.sidebar.hiddenItems';

/** قائمة اختبار صغيرة بنفس شكل `NAV` — الترتيب والمجموعات مقصودة. */
const SAMPLE = [
  { group: '', items: [{ key: 'dashboard', label: 'nav.dashboard', icon: 'dashboard' }] },
  {
    group: 'nav.group.financial',
    items: [
      { key: 'invoices', label: 'nav.invoices', icon: 'receipt_long', permission: 'invoices.read' },
      { key: 'expenses', label: 'nav.expenses', icon: 'payments', permission: 'expenses.read' },
    ],
  },
  {
    group: 'nav.group.warehouse',
    items: [{ key: 'inventory', label: 'nav.inventory', icon: 'warehouse', permission: 'inventory.read' }],
  },
];

const allowAll = () => true;
const keys = (sections: { items: { key: string }[] }[]) => sections.flatMap((s) => s.items.map((i) => i.key));

function resetStore() {
  localStorage.clear();
  useUI.setState({ hiddenNavKeys: [] });
}

beforeEach(resetStore);

describe('navVisibility — default state', () => {
  it('يعرض كل ما تسمح به الصلاحيات عندما لا يوجد تفضيل محفوظ (السلوك الحالي)', () => {
    expect(keys(visibleNav(SAMPLE, allowAll, []))).toEqual(keys(SAMPLE));
    // ونفس الشيء على القائمة الحقيقية للتطبيق.
    expect(keys(visibleNav(NAV, allowAll, []))).toEqual(keys(NAV));
  });

  it('المخزن يبدأ بلا عناصر مخفية حين لا يوجد شيء محفوظ', () => {
    expect(useUI.getState().hiddenNavKeys).toEqual([]);
  });
});

describe('navVisibility — hide / show', () => {
  it('إخفاء عنصر يزيله من القائمة، وإعادة إظهاره تعيده إلى موضعه وترتيبه الأصليين', () => {
    const hidden = visibleNav(SAMPLE, allowAll, ['invoices']);
    expect(keys(hidden)).toEqual(['dashboard', 'expenses', 'inventory']);

    const restored = visibleNav(SAMPLE, allowAll, []);
    expect(keys(restored)).toEqual(['dashboard', 'invoices', 'expenses', 'inventory']);
    // نفس المجموعة ونفس الأيقونة والمسار — العنصر لم يُعَد بناؤه، بل رُشِّح فقط.
    const invoices = restored[1]!.items[0]!;
    expect(restored[1]!.group).toBe('nav.group.financial');
    expect(invoices).toEqual(SAMPLE[1]!.items[0]);
  });

  it('لا يغيّر ترتيب المجموعات ولا ترتيب العناصر داخلها', () => {
    const out = visibleNav(SAMPLE, allowAll, ['dashboard']);
    expect(out.map((s) => s.group)).toEqual(['nav.group.financial', 'nav.group.warehouse']);
    expect(keys(out)).toEqual(['invoices', 'expenses', 'inventory']);
  });

  it('لا يُعدّل تعريف القائمة المصدر (لا حذف صفحة ولا تغيير مسار)', () => {
    const before = JSON.stringify(SAMPLE);
    visibleNav(SAMPLE, allowAll, ['invoices', 'inventory']);
    expect(JSON.stringify(SAMPLE)).toBe(before);
    // المسار نفسه ما زال معرَّفًا في المصدر رغم إخفائه من الشريط.
    expect(SAMPLE[1]!.items.some((i) => i.key === 'invoices')).toBe(true);
  });

  it('مجموعة أُخفيت كل عناصرها لا تترك عنوانًا فارغًا', () => {
    const out = visibleNav(SAMPLE, allowAll, ['inventory']);
    expect(out.map((s) => s.group)).not.toContain('nav.group.warehouse');
    expect(out).toHaveLength(2);
  });
});

describe('navVisibility — permissions outrank the preference', () => {
  it('عنصر بلا صلاحية لا يظهر حتى لو لم يكن مخفيًا', () => {
    const hasPermission = (p: string) => p !== 'invoices.read';
    expect(keys(visibleNav(SAMPLE, hasPermission, []))).toEqual(['dashboard', 'expenses', 'inventory']);
  });

  it('لا يمكن كشف عنصر ممنوع بالصلاحيات عبر إعداد الإظهار (ولا يُعرض له مفتاح أصلًا)', () => {
    const hasPermission = (p: string) => p !== 'inventory.read';
    // إعداد الإظهار: العنصر غير معروض في قائمة الإعداد.
    expect(keys(permittedNav(SAMPLE, hasPermission))).not.toContain('inventory');
    // وحتى لو أُزيل من المخفيات صراحةً، يبقى غائبًا عن الشريط.
    expect(keys(visibleNav(SAMPLE, hasPermission, []))).not.toContain('inventory');
  });
});

describe('navVisibility — protected items', () => {
  it('«الإعدادات» محمية: لا تُقبل ضمن المخفيات ولا يبدّلها المخزن', () => {
    expect(PROTECTED_NAV_KEYS).toContain('settings');
    expect(isProtectedNavKey('settings')).toBe(true);
    expect(sanitizeHiddenNavKeys(['settings', 'invoices'])).toEqual(['invoices']);

    useUI.getState().toggleNavItemVisibility('settings');
    expect(useUI.getState().hiddenNavKeys).toEqual([]);
    expect(keys(visibleNav(NAV, allowAll, useUI.getState().hiddenNavKeys))).toContain('settings');
  });
});

describe('navVisibility — sanitize untrusted storage', () => {
  it('أي شكل غير صالح ⇒ لا شيء مخفي', () => {
    expect(sanitizeHiddenNavKeys(null)).toEqual([]);
    expect(sanitizeHiddenNavKeys('invoices')).toEqual([]);
    expect(sanitizeHiddenNavKeys({ invoices: true })).toEqual([]);
    expect(sanitizeHiddenNavKeys([1, null, '', undefined])).toEqual([]);
  });

  it('يزيل التكرار ويحتفظ بالمفاتيح الصالحة فقط', () => {
    expect(sanitizeHiddenNavKeys(['invoices', 'invoices', 2, 'expenses'])).toEqual(['invoices', 'expenses']);
  });
});

describe('uiStore — persistence by stable identifier', () => {
  it('يحفظ المفاتيح الثابتة (لا النصوص المترجَمة) ويستعيدها بعد إعادة التشغيل', async () => {
    useUI.getState().toggleNavItemVisibility('invoices');
    useUI.getState().toggleNavItemVisibility('inventory');

    const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY)!);
    expect(stored).toEqual(['invoices', 'inventory']);
    // لا اسم عربي ولا إنجليزي ولا رقم ترتيب في المخزَّن.
    expect(JSON.stringify(stored)).not.toContain('الفواتير');
    expect(JSON.stringify(stored)).not.toContain('Invoices');

    // إعادة تحميل التطبيق: المخزن يُبنى من جديد من التخزين المحلي.
    vi.resetModules();
    const { useUI: reloaded } = await import('../stores/uiStore');
    expect(reloaded.getState().hiddenNavKeys).toEqual(['invoices', 'inventory']);
  });

  it('تخزين محلي معطوب لا يخفي شيئًا', async () => {
    localStorage.setItem(HIDDEN_KEY, '{not json');
    vi.resetModules();
    const { useUI: reloaded } = await import('../stores/uiStore');
    expect(reloaded.getState().hiddenNavKeys).toEqual([]);
  });

  it('تبديل العنصر مرتين يعيد الحالة الافتراضية', () => {
    useUI.getState().toggleNavItemVisibility('expenses');
    expect(useUI.getState().hiddenNavKeys).toEqual(['expenses']);
    useUI.getState().toggleNavItemVisibility('expenses');
    expect(useUI.getState().hiddenNavKeys).toEqual([]);
  });

  it('«إظهار جميع الصفحات» يعيد القائمة إلى وضعها الافتراضي ويُثبته في التخزين', () => {
    useUI.getState().toggleNavItemVisibility('invoices');
    useUI.getState().toggleNavItemVisibility('expenses');
    expect(keys(visibleNav(SAMPLE, allowAll, useUI.getState().hiddenNavKeys))).toEqual(['dashboard', 'inventory']);

    useUI.getState().showAllNavItems();
    expect(useUI.getState().hiddenNavKeys).toEqual([]);
    expect(JSON.parse(localStorage.getItem(HIDDEN_KEY)!)).toEqual([]);
    expect(keys(visibleNav(SAMPLE, allowAll, useUI.getState().hiddenNavKeys))).toEqual(keys(SAMPLE));
  });
});
