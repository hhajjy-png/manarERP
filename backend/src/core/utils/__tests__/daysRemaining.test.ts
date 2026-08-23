import { describe, it, expect } from 'vitest';
import { daysUntil, todayAsStoredDate, isExpired, expiresToday, expiresWithin } from '../daysRemaining';
import { daysUntilExpiry, insuranceUrgency } from '../../../modules/vehicleInsurance/vehicleInsurance.status';

/**
 * PERMANENT GUARD — عقد «الأيام المتبقية» موحَّد بين الوحدات.
 *
 * تدقيق 2026-08-22 وجد ثلاث طرق للحساب: مركز الوثائق (`Math.floor` بطابع زمني حيّ)،
 * وتأمين المركبات (منتصف ليل UTC + `Math.round`)، والمعدات (منتصف الليل المحلي).
 * النتيجة أن وثيقة تنتهي **اليوم** كانت «منتهية» في وحدة و«سارية» في أخرى.
 */

/** تاريخ مخزَّن كما يكتبه `dateOnlySchema`: منتصف ليل UTC. */
const stored = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** «الآن» في منتصف نهار محلي — يمثّل استخدامًا واقعيًا لا لحظة منتصف ليل. */
const NOW = new Date(2026, 7, 23, 14, 30, 0); // 23 أغسطس 2026، 14:30 محليًا

describe('daysUntil — دلالة أمس / اليوم / غدًا', () => {
  it('أمس ⇒ -1 (منتهية)', () => {
    const d = daysUntil(stored(2026, 8, 22), NOW);
    expect(d).toBe(-1);
    expect(isExpired(d)).toBe(true);
    expect(expiresToday(d)).toBe(false);
  });

  it('اليوم ⇒ 0 (تنتهي اليوم، ولا تزال سارية)', () => {
    const d = daysUntil(stored(2026, 8, 23), NOW);
    expect(d).toBe(0);
    expect(isExpired(d)).toBe(false);
    expect(expiresToday(d)).toBe(true);
  });

  it('غدًا ⇒ +1', () => {
    expect(daysUntil(stored(2026, 8, 24), NOW)).toBe(1);
  });

  it('لا يتأثّر بساعة اليوم — نفس النتيجة فجرًا ومساءً', () => {
    const expiry = stored(2026, 8, 23);
    const early = new Date(2026, 7, 23, 0, 1, 0);
    const late  = new Date(2026, 7, 23, 23, 59, 0);
    expect(daysUntil(expiry, early)).toBe(0);
    expect(daysUntil(expiry, late)).toBe(0);
  });

  it('الانحدار المُصلَح: الطريقة القديمة كانت تعدّ «اليوم» منتهيًا', () => {
    const expiry = stored(2026, 8, 23);
    const oldWay = Math.floor((expiry.getTime() - NOW.getTime()) / 86_400_000);
    expect(oldWay).toBe(-1);          // «منتهية منذ يوم» — خطأ
    expect(daysUntil(expiry, NOW)).toBe(0); // «تنتهي اليوم» — صحيح
  });

  it('يعطي فروقًا صحيحة عبر حدود الشهر والسنة', () => {
    expect(daysUntil(stored(2026, 9, 1), NOW)).toBe(9);
    expect(daysUntil(stored(2027, 1, 1), new Date(2026, 11, 31, 12, 0, 0))).toBe(1);
  });
});

describe('todayAsStoredDate — يتبع التقويم المحلي', () => {
  it('يطابق تمثيل التخزين (منتصف ليل UTC لليوم المحلي)', () => {
    const t = todayAsStoredDate(NOW);
    expect(t.getUTCFullYear()).toBe(2026);
    expect(t.getUTCMonth()).toBe(7);
    expect(t.getUTCDate()).toBe(23);
    expect(t.getUTCHours()).toBe(0);
  });
});

describe('expiresWithin — نافذة التنبيه', () => {
  it('يشمل اليوم الأخير من النافذة ويستثني المنتهية', () => {
    expect(expiresWithin(0, 30)).toBe(true);
    expect(expiresWithin(30, 30)).toBe(true);
    expect(expiresWithin(31, 30)).toBe(false);
    expect(expiresWithin(-1, 30)).toBe(false);
  });
});

describe('تكافؤ الوحدات — تأمين المركبات يستهلك العقد المشترك', () => {
  it('`daysUntilExpiry` صار الدالة المشتركة نفسها', () => {
    for (const day of [20, 22, 23, 24, 30]) {
      expect(daysUntilExpiry(stored(2026, 8, day), NOW)).toBe(daysUntil(stored(2026, 8, day), NOW));
    }
  });

  it('وثيقة تنتهي اليوم تُصنَّف «تنتهي خلال 7 أيام» لا «منتهية»', () => {
    expect(insuranceUrgency(daysUntil(stored(2026, 8, 23), NOW))).toBe('DUE_7');
    expect(insuranceUrgency(daysUntil(stored(2026, 8, 22), NOW))).toBe('EXPIRED');
  });

  it('العتبات المختلفة لم تُوحَّد — فقط طريقة العدّ', () => {
    // 7/15/30 تخصّ التأمين وحده وتبقى كما هي.
    expect(insuranceUrgency(7)).toBe('DUE_7');
    expect(insuranceUrgency(15)).toBe('DUE_15');
    expect(insuranceUrgency(30)).toBe('DUE_30');
    expect(insuranceUrgency(31)).toBe('VALID');
  });
});
