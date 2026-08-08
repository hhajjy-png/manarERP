import { Request } from 'express';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';
import { invalidatePeriodLockCache } from '../../shared/services/periodLock.service';

/**
 * مجموعة تفضيلات المستخدم داخل جدول `Setting` نفسه — لا جدول ولا نظام تخزين ثانٍ.
 * كل ما في هذه المجموعة يعيش داخل `manar.db`، أي أنه يدخل النسخ الاحتياطي
 * والاستعادة ومزامنة Google Drive تلقائيًا وينتقل إلى أي جهاز جديد.
 */
export const PREFERENCES_GROUP = 'preferences';

/**
 * بادئة مفاتيح التفضيلات: `pref.<userId>.<اسم المفتاح>`.
 *
 * لماذا يدخل `userId` في المفتاح: `localStorage` كان **لكل جهاز**، ومشاركة تفضيل
 * واحد بين كل المستخدمين كانت ستغيّر السلوك (إخفاء عنصر من القائمة عند مستخدم
 * يخفيه عند الجميع). التقسيم بالمستخدم يحفظ السلوك الحالي حرفيًا ويضيف الانتقال
 * بين الأجهزة فقط.
 *
 * لماذا بادئة مفروضة في الخادم: هذا المسار الوحيد في الوحدة الذي لا يشترط صلاحية
 * `settings.update` (وإلا لتعذّر على مستخدم عادي حفظ تفضيلاته). البادئة — المُركّبة
 * في الخادم من هوية الجلسة لا من جسم الطلب — تجعل الوصول إلى `company.*` أو
 * `backup.*` أو `accounting.periodLock` مستحيلًا عبره.
 */
export function preferenceKey(userId: number, key: string): string {
  return `pref.${userId}.${key}`;
}

/** الحد الأقصى لطول قيمة تفضيل واحد — حارس حجم، لا قاعدة عمل. */
const MAX_PREFERENCE_VALUE_LENGTH = 200_000;

export class SettingsService {
  /**
   * كل تفضيلات مستخدم واحد، بمفاتيحها المجرّدة (بلا البادئة) — الشكل الذي تتوقّعه
   * الواجهة، وهو نفس شكل مفاتيح `localStorage` السابقة تمامًا.
   */
  async getPreferences(userId: number): Promise<Record<string, string>> {
    const prefix = preferenceKey(userId, '');
    const rows = await prisma.setting.findMany({
      where: { group: PREFERENCES_GROUP, key: { startsWith: prefix } },
    });
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key.slice(prefix.length)] = r.value;
    return out;
  }

  /**
   * حفظ تفضيلات مستخدم واحد. لا `recordAudit` هنا عمدًا: التفضيلات تُكتب مع كل
   * تبديل شريط جانبي أو تغيير ملف طباعة، وتسجيلها كان سيغرق سجلّ التدقيق بضجيج
   * يخفي الأحداث المالية الحقيقية التي وُجد السجلّ لأجلها.
   */
  async setPreferences(userId: number, entries: Array<{ key: string; value: string }>) {
    const usable = entries.filter((e) => e.value.length <= MAX_PREFERENCE_VALUE_LENGTH);
    if (usable.length === 0) return { saved: 0 };

    await prisma.$transaction(
      usable.map((e) => {
        const key = preferenceKey(userId, e.key);
        return prisma.setting.upsert({
          where: { key },
          update: { value: e.value },
          create: { key, value: e.value, group: PREFERENCES_GROUP },
        });
      }),
    );
    return { saved: usable.length };
  }

  /**
   * كل إعدادات النظام مجمّعة حسب المجموعة.
   *
   * مجموعة `preferences` مستثناة: هي تفضيلات شخصية لكل مستخدم على حدة، تُقرأ من
   * `GET /settings/preferences` وحده. إدراجها هنا كان سيكشف تفضيلات بقية المستخدمين
   * لكل من يملك `settings.read`، ويُضخّم استجابة تقرأها صفحة الإعدادات واستوديو
   * القوالب عند كل فتح.
   */
  async getAll() {
    const rows = await prisma.setting.findMany({
      where: { group: { not: PREFERENCES_GROUP } },
      orderBy: { group: 'asc' },
    });
    const grouped: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      (grouped[r.group] ??= {})[r.key] = r.value;
    }
    return { settings: rows, grouped };
  }

  async get(key: string) {
    return prisma.setting.findUnique({ where: { key } });
  }

  /** تحديث/إنشاء عدة إعدادات دفعة واحدة. */
  async updateMany(updates: { key: string; value: string; group?: string }[], req: Request) {
    const results = await prisma.$transaction(
      updates.map((u) =>
        prisma.setting.upsert({
          where: { key: u.key },
          update: { value: u.value },
          create: { key: u.key, value: u.value, group: u.group ?? 'general' },
        }),
      ),
    );
    // تاريخ قفل الفترة مخزَّن كإعداد ومُخبَّأ في الذاكرة — أبطل التخبئة فورًا
    // حتى لا يعمل الحارس بقيمة قديمة بعد تغيير القفل.
    invalidatePeriodLockCache();
    await recordAudit({ req, action: 'UPDATE', module: 'settings', newValue: updates.map((u) => u.key) });
    return results;
  }
}

export const settingsService = new SettingsService();
