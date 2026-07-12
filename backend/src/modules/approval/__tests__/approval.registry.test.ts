import { describe, it, expect, beforeAll, vi } from 'vitest';
import { approvalEngine } from '../../../shared/services/approval.service';
import { registerApprovalModules } from '../approval.registry';

/**
 * تفعيل محرّك الاعتماد وقت التشغيل.
 *
 * قبل هذه الحزمة لم يكن `register()` يُستدعى ولا مرّة خارج الاختبارات، فكان `hasModule()`
 * كاذبًا لكل نوع كيان، وكان `GET /api/approval-history/:type/:id` يردّ **400 على كل طلب**.
 * ميزة كاملة ومختبَرة وغير قابلة للوصول.
 *
 * ما تثبته هذه الاختبارات:
 *   • الأنواع الثلاثة مسجَّلة، وغيرها يُرفض كما كان.
 *   • المحرّك **لا يملك كتابة الحالة** — الخدمات المجالية تملكها. أي محاولة لتنفيذ انتقال
 *     عبره تفشل بصوت عالٍ بدل أن تكتب حالة ثانية منافسة.
 *   • `recordTransition` يكتب **سطرًا واحدًا** ولا شيء غيره: لا حالة، لا تدقيق، لا صلاحيات.
 */

beforeAll(() => {
  registerApprovalModules();
});

const REGISTERED = ['expense', 'invoice', 'payroll'] as const;

describe('تسجيل الوحدات', () => {
  it('الأنواع الثلاثة مسجَّلة — سجلّ الاعتماد لم يعد يرفضها', () => {
    for (const entityType of REGISTERED) {
      expect(approvalEngine.hasModule(entityType)).toBe(true);
    }
  });

  it('الأنواع غير المدعومة ما زالت مرفوضة — التسجيل لم يفتح الباب لكل شيء', () => {
    for (const unknown of ['cheque', 'contract', 'customer', 'equipment', '', 'Expense']) {
      expect(approvalEngine.hasModule(unknown)).toBe(false);
    }
  });

  it('لكل نوع صلاحية عرض سجلّ — لا سجلّ مكشوف بلا حارس', () => {
    // الفعل هو `read` لا `view` (انظر ACTIONS في constants.ts). المفتاح غير الموجود لا يفشل
    // بصوت عالٍ — بل **يحجب السجلّ عن الجميع** إلا مدير النظام. الحارس هنا يمنع عودته.
    expect(approvalEngine.getHistoryPermission('expense')).toBe('expenses.read');
    expect(approvalEngine.getHistoryPermission('invoice')).toBe('invoices.read');
    expect(approvalEngine.getHistoryPermission('payroll')).toBe('payroll.read');
  });

  it('التسجيل مُتماثل — استدعاؤه مرّتين لا يرمي (createApp يُستدعى لكل اختبار)', () => {
    expect(() => registerApprovalModules()).not.toThrow();
    expect(() => registerApprovalModules()).not.toThrow();
    expect(approvalEngine.hasModule('expense')).toBe(true);
  });
});

describe('حدود المحرّك — الحالة ملك المجال', () => {
  it('تنفيذ انتقال عبر المحرّك يفشل بصوت عالٍ بدل كتابة حالة منافسة', async () => {
    const tx = {
      expense: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'PENDING' }) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ role: { name: 'SYSTEM_ADMIN', rolePermissions: [] } }),
      },
    } as never;

    await expect(
      approvalEngine.transition(
        { entityType: 'expense', entityId: 1, action: 'approve', userId: 1 },
        tx,
      ),
    ).rejects.toThrow(/belong to its own service/i);
  });

  it('الفاتورة بلا انتقالات — الاعتماد فيها ترحيل محاسبي لا نقل حالة', async () => {
    const tx = {
      invoice: { findUniqueOrThrow: vi.fn().mockResolvedValue({ status: 'UNPAID' }) },
    } as never;

    // لا انتقال مطابق ⇒ المحرّك يرفض قبل أن يمسّ شيئًا. هذا مقصود: تسجيلها في آلة حالات
    // كان سيتطلّب اختراع حالة «معتمدة» غير موجودة في المخطط.
    await expect(
      approvalEngine.transition(
        { entityType: 'invoice', entityId: 1, action: 'approve', userId: 1 },
        tx,
      ),
    ).rejects.toThrow(/لا يمكن تنفيذ الإجراء/);
  });
});

describe('recordTransition — تسجيل فقط', () => {
  function fakeTx() {
    return {
      approvalHistory: { create: vi.fn().mockResolvedValue({ id: 1 }) },
      auditLog:        { create: vi.fn() },
      expense:         { update: vi.fn() },
      user:            { findUnique: vi.fn() },
    };
  }

  it('يكتب سطر سجلّ واحدًا — ولا تدقيقًا ولا حالة ولا فحص صلاحية', async () => {
    const tx = fakeTx();
    await approvalEngine.recordTransition(
      {
        entityType: 'expense',
        entityId:   7,
        action:     'approve',
        fromStatus: 'PENDING',
        toStatus:   'APPROVED',
        userId:     3,
        metadata:   { amount: 120 },
      },
      tx as never,
    );

    expect(tx.approvalHistory.create).toHaveBeenCalledTimes(1);
    const row = tx.approvalHistory.create.mock.calls[0][0].data;
    expect(row).toMatchObject({
      entityType: 'expense', entityId: 7, action: 'approve',
      fromStatus: 'PENDING', toStatus: 'APPROVED', userId: 3,
    });
    expect(JSON.parse(row.metadataJson)).toEqual({ amount: 120 });

    // ← جوهر التصميم: المحرّك لا يكتب تدقيقًا ثانيًا (الخدمة المجالية تكتبه مع الـ IP)،
    //   ولا يكتب الحالة (كتبتها الخدمة أصلًا)، ولا يستعلم عن الصلاحيات (المسار فحصها).
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.expense.update).not.toHaveBeenCalled();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
  });

  it('fromStatus === toStatus مسموح — الفاتورة تُعتمد بلا نقل حالة', async () => {
    const tx = fakeTx();
    await approvalEngine.recordTransition(
      { entityType: 'invoice', entityId: 2, action: 'approve', fromStatus: 'UNPAID', toStatus: 'UNPAID', userId: 1 },
      tx as never,
    );
    const row = tx.approvalHistory.create.mock.calls[0][0].data;
    expect(row.fromStatus).toBe('UNPAID');
    expect(row.toStatus).toBe('UNPAID');
  });

  it('نوع غير مسجَّل: لا يُكتب سطر ولا يُرمى خطأ — خطأ توصيل لا يُسقط اعتمادًا ناجحًا', async () => {
    const tx = fakeTx();
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      approvalEngine.recordTransition(
        { entityType: 'cheque', entityId: 1, action: 'approve', fromStatus: 'A', toStatus: 'B', userId: 1 },
        tx as never,
      ),
    ).resolves.toBeUndefined();
    expect(tx.approvalHistory.create).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled(); // يُحذَّر منه، لا يُبتلع صامتًا
    spy.mockRestore();
  });

  it('فشل الكتابة لا يُسقط المعاملة — الاعتماد وقع فعلًا', async () => {
    const tx = fakeTx();
    tx.approvalHistory.create.mockRejectedValueOnce(new Error('db is locked'));
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      approvalEngine.recordTransition(
        { entityType: 'payroll', entityId: 5, action: 'pay', fromStatus: 'APPROVED', toStatus: 'PAID', userId: 1 },
        tx as never,
      ),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
