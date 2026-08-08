import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Zero Data Loss Certification Pack v1 — حراس تفضيلات المستخدم.
 *
 * التفضيلات انتقلت من `localStorage` (خارج النسخ الاحتياطي والمزامنة، وتُمحى عند
 * تغيير `productName`) إلى جدول `Setting` داخل `manar.db`. هذا المسار هو الوحيد في
 * وحدة الإعدادات الذي لا يشترط صلاحية `settings.update`، فالاختبارات هنا تثبّت
 * حدّه: لا يصل إلى مفتاح مستخدم آخر، ولا إلى أي إعداد نظام، ولا يُسرّب تفضيلات
 * أحد إلى أحد.
 */

const h = vi.hoisted(() => ({
  db: {
    setting: { findMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../config/database', () => ({ prisma: h.db }));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/services/periodLock.service', () => ({
  invalidatePeriodLockCache: vi.fn(),
  describeLock: vi.fn(),
}));

import { settingsService, preferenceKey, PREFERENCES_GROUP } from '../settings.service';

const USER = 11;
const OTHER_USER = 22;

beforeEach(() => {
  vi.resetAllMocks();
  h.db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe('مساحة مفاتيح التفضيلات', () => {
  it('تُقسَّم بالمستخدم، فلا يتقاسم مستخدمان القيمة نفسها', () => {
    expect(preferenceKey(USER, 'manarERP.sidebar.mode')).toBe('pref.11.manarERP.sidebar.mode');
    expect(preferenceKey(OTHER_USER, 'manarERP.sidebar.mode')).toBe('pref.22.manarERP.sidebar.mode');
    expect(preferenceKey(USER, 'x')).not.toBe(preferenceKey(OTHER_USER, 'x'));
  });

  it('لا يمكن لجسم الطلب الوصول إلى إعداد نظام — البادئة تُركَّب في الخادم دائمًا', async () => {
    await settingsService.setPreferences(USER, [
      { key: 'company.name', value: 'شركة مزوَّرة' },
      { key: 'accounting.periodLock', value: '2030-01-01' },
      { key: '../../backup.auto.enabled', value: 'false' },
    ]);

    const writtenKeys = h.db.setting.upsert.mock.calls.map((c) => c[0].where.key);
    expect(writtenKeys).toEqual([
      'pref.11.company.name',
      'pref.11.accounting.periodLock',
      'pref.11.../../backup.auto.enabled',
    ]);
    // ولا مفتاح واحد منها يساوي مفتاح إعداد نظام حقيقي.
    for (const k of writtenKeys) expect(k.startsWith('pref.11.')).toBe(true);
  });
});

describe('getPreferences', () => {
  it('يقرأ مفاتيح هذا المستخدم وحده ويُعيدها مجرّدة من البادئة', async () => {
    h.db.setting.findMany.mockResolvedValue([
      { key: 'pref.11.manarERP.sidebar.mode', value: 'collapsed', group: PREFERENCES_GROUP },
      { key: 'pref.11.manar.import.mapping_profiles', value: '[]', group: PREFERENCES_GROUP },
    ]);

    const result = await settingsService.getPreferences(USER);

    expect(h.db.setting.findMany).toHaveBeenCalledWith({
      where: { group: PREFERENCES_GROUP, key: { startsWith: 'pref.11.' } },
    });
    expect(result).toEqual({
      'manarERP.sidebar.mode': 'collapsed',
      'manar.import.mapping_profiles': '[]',
    });
  });
});

describe('setPreferences', () => {
  it('يحفظ في مجموعة التفضيلات داخل manar.db (⇒ يدخل النسخ والمزامنة)', async () => {
    await settingsService.setPreferences(USER, [{ key: 'rc_favorites_v1', value: '["a"]' }]);

    const call = h.db.setting.upsert.mock.calls[0][0];
    expect(call.create.group).toBe(PREFERENCES_GROUP);
    expect(call.create.value).toBe('["a"]');
    expect(call.update.value).toBe('["a"]');
  });

  it('يكتب كل التفضيلات في معاملة واحدة — لا حفظ نصفي', async () => {
    await settingsService.setPreferences(USER, [
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('يتجاهل قيمة تتجاوز حدّ الحجم بدل رفض الدفعة كلها', async () => {
    const huge = 'x'.repeat(200_001);
    const result = await settingsService.setPreferences(USER, [
      { key: 'ok', value: 'صغير' },
      { key: 'huge', value: huge },
    ]);

    expect(result.saved).toBe(1);
    expect(h.db.setting.upsert.mock.calls.map((c) => c[0].where.key)).toEqual(['pref.11.ok']);
  });

  it('لا يلمس قاعدة البيانات حين لا تبقى أي قيمة صالحة', async () => {
    const result = await settingsService.setPreferences(USER, [{ key: 'huge', value: 'x'.repeat(200_001) }]);
    expect(result).toEqual({ saved: 0 });
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });
});

describe('getAll — عزل التفضيلات عن إعدادات النظام', () => {
  it('يستبعد مجموعة التفضيلات، فلا تتسرّب تفضيلات مستخدم إلى آخر عبر صفحة الإعدادات', async () => {
    h.db.setting.findMany.mockResolvedValue([]);

    await settingsService.getAll();

    expect(h.db.setting.findMany).toHaveBeenCalledWith({
      where: { group: { not: PREFERENCES_GROUP } },
      orderBy: { group: 'asc' },
    });
  });
});
