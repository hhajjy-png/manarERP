// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Zero Data Loss Certification Pack v1 — حراس تفضيلات المستخدم في الواجهة.
 *
 * ما تحميه هذه الاختبارات ليس ميزة بل **ضمانة**: كل ما يبنيه المستخدم بيده
 * (ملفات تعيين أعمدة الاستيراد، ملفات الطباعة لكل نموذج، المفضّلات، عناصر القائمة
 * المخفية) لم يعد يعيش في `localStorage` وحده. `localStorage` صار مخبأ قراءة
 * متزامنًا، وقاعدة البيانات — أي `manar.db` الذي تحمله النسخة الاحتياطية ومزامنة
 * Google Drive — هي مصدر الحقيقة الدائم.
 *
 * الحالة الحرجة التي تُختبَر هنا هي **الجهاز الجديد**: مخبأ محلي فارغ + قاعدة
 * وصلت بالمزامنة ⇒ يجب أن تعود التفضيلات كاملة.
 */

const h = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

vi.mock('../api/client', () => ({ api: h.api }));

import {
  isSyncedPreference,
  persistPreference,
  removePreference,
  hydrateSyncedPreferences,
  clearSyncedPreferenceCache,
  flushPreferenceWrites,
} from '../lib/syncedPreferences';

const MAPPING = 'manar.import.mapping_profiles';
const SIDEBAR = 'manarERP.sidebar.hiddenItems';

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  // طابور الدفع حالة على مستوى الوحدة — يُفرَّغ بين الاختبارات وإلا تسرّبت كتابة
  // من اختبار سابق إلى دفعة اختبار لاحق.
  clearSyncedPreferenceCache();
  h.api.put.mockResolvedValue({ data: { data: { saved: 1 } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('سجلّ المفاتيح المُزامَنة', () => {
  it('يشمل ما يبنيه المستخدم بيده', () => {
    for (const key of [
      MAPPING,
      SIDEBAR,
      'manarERP.sidebar.mode',
      'manarERP.letters.favourites',
      'manarERP.letters.recents',
      'manarERP.locationUsageCounts',
      'manarERP.recentInvoiceLocations',
      'manarERP.prices.agreementsBoard',
      'rc_favorites_v1',
      'rc_recent_v1',
    ]) {
      expect(isSyncedPreference(key)).toBe(true);
    }
  });

  it('يشمل عائلات المفاتيح المفتوحة (ملف الطباعة وعدد النسخ لكل نموذج/فئة)', () => {
    expect(isSyncedPreference('manar.printProfile.salary-certificate')).toBe(true);
    expect(isSyncedPreference('manar.copies.payment-voucher')).toBe(true);
    expect(isSyncedPreference('manar:print-profile:invoice')).toBe(true);
  });

  it('يستثني حالة الجلسة على هذا الجهاز — صفحات، بحث، فلاتر، رمز الدخول، الأعلام', () => {
    for (const key of [
      'rp:customers:page',
      'inv:search',
      'exp:category',
      'manar.token',
      'manar.theme',
      'manar.lang',
      'manar:flag:TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC',
      'dashboard.tab',
    ]) {
      expect(isSyncedPreference(key)).toBe(false);
    }
  });
});

describe('persistPreference', () => {
  it('يكتب محليًا فورًا — القراءة تبقى متزامنة كما كانت', () => {
    persistPreference(MAPPING, '[{"entity":"customers"}]');
    expect(localStorage.getItem(MAPPING)).toBe('[{"entity":"customers"}]');
  });

  it('يرفع القيمة إلى قاعدة البيانات، فتدخل النسخ الاحتياطي', async () => {
    persistPreference(MAPPING, '["a"]');
    await vi.runAllTimersAsync();

    expect(h.api.put).toHaveBeenCalledWith('/settings/preferences', {
      preferences: [{ key: MAPPING, value: '["a"]' }],
    });
  });

  it('يجمّع الكتابات المتتابعة في طلب واحد ويحتفظ بآخر قيمة', async () => {
    persistPreference(MAPPING, '1');
    persistPreference(MAPPING, '2');
    persistPreference(SIDEBAR, '["reports"]');
    await vi.runAllTimersAsync();

    expect(h.api.put).toHaveBeenCalledTimes(1);
    expect(h.api.put.mock.calls[0][1].preferences).toEqual([
      { key: MAPPING, value: '2' },
      { key: SIDEBAR, value: '["reports"]' },
    ]);
  });

  it('لا يرفع مفتاح حالة جلسة غير مسجَّل — يسلك سلوك localStorage القديم حرفيًا', async () => {
    persistPreference('rp:customers:page', '3');
    await vi.runAllTimersAsync();

    expect(localStorage.getItem('rp:customers:page')).toBe('3');
    expect(h.api.put).not.toHaveBeenCalled();
  });

  it('لا يفقد المستخدم شيئًا محليًا حين يفشل الرفع', async () => {
    h.api.put.mockRejectedValue(new Error('الخادم متوقف'));
    persistPreference(MAPPING, '["محفوظ محليًا"]');
    await vi.runAllTimersAsync();

    expect(localStorage.getItem(MAPPING)).toBe('["محفوظ محليًا"]');
  });
});

describe('removePreference', () => {
  it('يحذف محليًا ويُعلم القاعدة بقيمة فارغة', async () => {
    localStorage.setItem('manar:print-profile:invoice', '{}');
    removePreference('manar:print-profile:invoice');
    await vi.runAllTimersAsync();

    expect(localStorage.getItem('manar:print-profile:invoice')).toBeNull();
    expect(h.api.put.mock.calls[0][1].preferences).toEqual([
      { key: 'manar:print-profile:invoice', value: '' },
    ]);
  });
});

describe('hydrateSyncedPreferences — الجهاز الجديد', () => {
  it('يستعيد التفضيلات من قاعدة البيانات إلى مخبأ محلي فارغ', async () => {
    h.api.get.mockResolvedValue({
      data: { data: { [MAPPING]: '["مُستعاد"]', [SIDEBAR]: '["audit"]' } },
    });

    await hydrateSyncedPreferences();

    expect(localStorage.getItem(MAPPING)).toBe('["مُستعاد"]');
    expect(localStorage.getItem(SIDEBAR)).toBe('["audit"]');
  });

  it('القاعدة تفوز على المخبأ المحلي — وإلا لما عمل الجهاز الجديد أبدًا', async () => {
    localStorage.setItem(MAPPING, '["قيمة محلية قديمة"]');
    h.api.get.mockResolvedValue({ data: { data: { [MAPPING]: '["القيمة الحقيقية"]' } } });

    await hydrateSyncedPreferences();

    expect(localStorage.getItem(MAPPING)).toBe('["القيمة الحقيقية"]');
  });

  it('يرفع ما هو محلي فقط — هجرة أول تشغيل بعد الترقية، بلا إجراء من المستخدم', async () => {
    localStorage.setItem(MAPPING, '["عمل متراكم قبل الحزمة"]');
    h.api.get.mockResolvedValue({ data: { data: {} } });

    await hydrateSyncedPreferences();

    expect(h.api.put).toHaveBeenCalledWith('/settings/preferences', {
      preferences: [{ key: MAPPING, value: '["عمل متراكم قبل الحزمة"]' }],
    });
  });

  it('لا يرفع حالة الجلسة المحلية إلى القاعدة', async () => {
    localStorage.setItem('rp:customers:page', '5');
    localStorage.setItem('manar.token', 'secret-token');
    h.api.get.mockResolvedValue({ data: { data: {} } });

    await hydrateSyncedPreferences();

    expect(h.api.put).not.toHaveBeenCalled();
  });

  it('لا يفقد المخبأ المحلي حين يتعذّر الوصول إلى الخادم', async () => {
    localStorage.setItem(MAPPING, '["محلي"]');
    h.api.get.mockRejectedValue(new Error('لا اتصال'));

    await expect(hydrateSyncedPreferences()).resolves.toBeUndefined();
    expect(localStorage.getItem(MAPPING)).toBe('["محلي"]');
  });

  it('يتجاهل مفتاحًا أُلغي تسجيله في نسخة أحدث', async () => {
    h.api.get.mockResolvedValue({ data: { data: { 'مفتاح.ملغى': 'قيمة' } } });
    await hydrateSyncedPreferences();
    expect(localStorage.getItem('مفتاح.ملغى')).toBeNull();
  });
});

describe('تسجيل الخروج', () => {
  it('يدفع آخر كتابة قبل إبطال الجلسة — فلا يضيع تفضيل غُيِّر لتوّه', async () => {
    persistPreference(MAPPING, '["آخر تغيير"]');
    await flushPreferenceWrites();

    expect(h.api.put).toHaveBeenCalledWith('/settings/preferences', {
      preferences: [{ key: MAPPING, value: '["آخر تغيير"]' }],
    });
  });

  it('يمسح مخبأ التفضيلات وحده، ويترك حالة الجلسة لمن يملك مسحها', () => {
    localStorage.setItem(MAPPING, '["مستخدم أ"]');
    localStorage.setItem('rp:customers:page', '3');

    clearSyncedPreferenceCache();

    expect(localStorage.getItem(MAPPING)).toBeNull();
    expect(localStorage.getItem('rp:customers:page')).toBe('3');
  });

  it('لا يرسل كتابات المستخدم السابق بعد مسح المخبأ', async () => {
    persistPreference(MAPPING, '["مستخدم أ"]');
    clearSyncedPreferenceCache();
    await vi.runAllTimersAsync();

    expect(h.api.put).not.toHaveBeenCalled();
  });
});
