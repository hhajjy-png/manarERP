import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { getRequestActor, RequestActor } from '../../core/context/requestContext';
import { toLocalDateString } from '../../core/utils/dateWindows';
import { ROLES } from '../../config/constants';

type Client = Prisma.TransactionClient | typeof prisma;

/** مفتاح الإعداد الذي يحمل تاريخ القفل. فارغ/غائب = لا يوجد قفل. */
export const LOCK_SETTING_KEY = 'finance.lockBeforeDate';

/** صلاحية تجاوز قفل الفترة. كل تجاوز يُسجَّل في Audit Log. */
export const OVERRIDE_PERMISSION = 'financial.overrideLock';

/** إجراء Audit المستخدم عند تجاوز القفل. */
export const OVERRIDE_AUDIT_ACTION = 'PERIOD_LOCK_OVERRIDE';

/** وصف العملية المحمية — يظهر في رسالة الخطأ وفي سجل التدقيق. */
export interface LockedOperation {
  /** ما الذي يحاول المستخدم فعله، بالعربية: 'ترحيل قيد'، 'حذف مصروف'... */
  operation: string;
  /** الوحدة المتأثرة (invoices | expenses | payroll | accounting | ...). */
  module: string;
  entityId?: string | number;
}

// ─── ذاكرة مؤقتة للإعداد ──────────────────────────────────────────────────────
// الحارس يعمل داخل كل معاملة ترحيل؛ قراءة الإعداد من القرص في كل مرة هدر.
// TTL قصير + إبطال صريح عند تحديث الإعدادات يجعل النافذة القصوى للتضارب ثوانٍ.

const CACHE_TTL_MS = 15_000;
let cache: { value: Date | null; loadedAt: number } | null = null;

/** يُستدعى من `settings.service` بعد أي تحديث للإعدادات. */
export function invalidatePeriodLockCache(): void {
  cache = null;
}

/** يحوّل 'YYYY-MM-DD' إلى بداية اليوم بالتوقيت المحلي (لا UTC — التواريخ محلية في هذا النظام). */
function parseLockValue(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * تاريخ القفل الحالي، أو `null` إذا لم يُضبط.
 * أي خطأ في القراءة يُرفع للأعلى (fail-closed): من الأفضل رفض الترحيل
 * على أن نسمح بكتابة في فترة مقفلة لأن قراءة الإعداد فشلت.
 */
export async function getLockBeforeDate(client: Client = prisma): Promise<Date | null> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.value;

  const row = await client.setting.findUnique({ where: { key: LOCK_SETTING_KEY } });
  const value = row?.value ? parseLockValue(row.value) : null;
  cache = { value, loadedAt: Date.now() };
  return value;
}

/** هل التاريخ يقع قبل حدّ القفل؟ المقارنة على مستوى اليوم. */
export function isBeforeLock(date: Date, lockBefore: Date): boolean {
  return startOfLocalDay(date).getTime() < startOfLocalDay(lockBefore).getTime();
}

function canOverride(actor: RequestActor): boolean {
  return actor.roleName === ROLES.SYSTEM_ADMIN || actor.permissions.includes(OVERRIDE_PERMISSION);
}

// تواريخ محلية — انظر التحذير في `toLocalDateString`.
const fmt = toLocalDateString;

/**
 * الحارس المركزي لقفل الفترة.
 *
 * يُستدعى قبل أي كتابة محاسبية مؤرَّخة: ترحيل قيد، عكس قيد، إنشاء/تعديل/حذف
 * مستند مالي. يُركَّب أساسًا داخل `createBalancedJournal` و`transactions.postEntry`
 * ثم يُستدعى صراحةً في المسارات غير المحاسبية (حذف فاتورة، تعديل مصروف...).
 *
 * السلوك:
 * - خارج دورة طلب HTTP → يمرّ فورًا دون قراءة الإعداد.
 *   القفل ضابط تنظيمي على المستخدمين، لا على النظام نفسه؛ ولا يوجد فاعل نمنعه
 *   أو نسجّل تجاوزه. المسارات غير الطلبية (seed، سكربتات الاستيراد) لا تُرحِّل GL
 *   أصلًا. الفحص أولًا يجعل الحارس بلا كلفة استعلام في تلك المسارات وفي الاختبارات.
 *   إن احتاجت مهمة خلفية مستقبلية إلى الخضوع للقفل، غلّفها بـ `runWithRequestActor`.
 * - لا قفل مضبوط → يمرّ.
 * - التاريخ ≥ حدّ القفل → يمرّ.
 * - فاعل يملك `financial.overrideLock` (أو مدير النظام) → يمرّ **ويُسجَّل التجاوز**
 *   في نفس المعاملة، فإن فشلت العملية لم يبقَ سجل تجاوز كاذب.
 * - غير ذلك → 403.
 */
export async function assertPeriodOpen(
  client: Client,
  date: Date,
  meta: LockedOperation,
): Promise<void> {
  const actor = getRequestActor();
  if (!actor) return;

  const lockBefore = await getLockBeforeDate(client);
  if (!lockBefore || !isBeforeLock(date, lockBefore)) return;

  if (!canOverride(actor)) {
    throw AppError.forbidden(
      `الفترة المحاسبية مقفلة قبل ${fmt(lockBefore)}. ` +
        `لا يمكن ${meta.operation} بتاريخ ${fmt(date)}. ` +
        'راجع مدير النظام لفتح الفترة أو منحك صلاحية التجاوز.',
    );
  }

  await client.auditLog.create({
    data: {
      userId: actor.userId ?? null,
      action: OVERRIDE_AUDIT_ACTION,
      module: meta.module,
      entityId: meta.entityId != null ? String(meta.entityId) : null,
      newValue: JSON.stringify({
        operation: meta.operation,
        transactionDate: fmt(date),
        lockBeforeDate: fmt(lockBefore),
        overriddenBy: actor.userId ?? null,
        roleName: actor.roleName ?? null,
      }),
      ipAddress: actor.ip,
    },
  });
}

/** حالة القفل للواجهة — تُستهلك في شاشة الإعدادات وفي تنبيهات النماذج. */
export async function describeLock(): Promise<{
  lockBeforeDate: string | null;
  canOverride: boolean;
}> {
  const lockBefore = await getLockBeforeDate();
  const actor = getRequestActor();
  return {
    lockBeforeDate: lockBefore ? fmt(lockBefore) : null,
    canOverride: actor ? canOverride(actor) : false,
  };
}
