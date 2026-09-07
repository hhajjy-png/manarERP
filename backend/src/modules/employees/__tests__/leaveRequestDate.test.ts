import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    leave: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { leaveSchema } from '../employees.schema';
import { employeesService } from '../employees.service';
import type { Request } from 'express';

/**
 * Leave Request — Editable Request Date v1.
 *
 * العقد المحروس: «تاريخ تقديم الطلب» صار حقلًا يملكه المستخدم ويُحفظ مع سجل الإجازة،
 * بدل أن يكتبه القالب بتاريخ اليوم عند كل طباعة. ما تثبته هذه الاختبارات:
 *   • المخطط يقبله كتاريخ DATE-ONLY مُشدَّد، ويبقى اختياريًا (سجلّات ما قبل الحزمة).
 *   • القيمة تصل إلى `prisma.leave.create` **كما أُرسلت** — لا تاريخ اليوم يحلّ محلّها.
 *   • لا علاقة له بتاريخي الإجازة ولا بعدد أيامها: طلب مُقدَّم قبل الإجازة أو بعدها
 *     يُقبل، و`days` يبقى مشتقًّا من التاريخين وحدهما.
 */

const p = prisma as unknown as { leave: { create: ReturnType<typeof vi.fn> } };
const REQ = { user: { id: 1 } } as unknown as Request;

const BASE = { employeeId: 1, type: 'ANNUAL' as const, startDate: '2026-08-01', endDate: '2026-08-05' };

beforeEach(() => {
  vi.clearAllMocks();
  p.leave.create.mockResolvedValue({ id: 10 });
});

describe('leaveSchema.requestDate', () => {
  it('يقبل تاريخًا بصيغة DATE-ONLY القانونية', () => {
    const r = leaveSchema.safeParse({ body: { ...BASE, requestDate: '2026-07-28' } });
    expect(r.success).toBe(true);
  });

  it('يرفض الصيغة المعروضة (DD/MM/YYYY) كسائر حقول التاريخ المُشدَّدة', () => {
    const r = leaveSchema.safeParse({ body: { ...BASE, requestDate: '28/07/2026' } });
    expect(r.success).toBe(false);
  });

  it('اختياري — الحمولة القديمة بلا الحقل ما تزال صالحة', () => {
    expect(leaveSchema.safeParse({ body: { ...BASE } }).success).toBe(true);
  });

  it('لا يُقيَّد بتاريخي الإجازة — يُقبل قبلهما وبعدهما', () => {
    expect(leaveSchema.safeParse({ body: { ...BASE, requestDate: '2026-06-01' } }).success).toBe(true);
    expect(leaveSchema.safeParse({ body: { ...BASE, requestDate: '2026-09-30' } }).success).toBe(true);
  });
});

describe('requestLeave — يحفظ تاريخ التقديم المختار حرفيًا', () => {
  it('يمرّر القيمة المُرسَلة إلى قاعدة البيانات بلا استبدال بتاريخ اليوم', async () => {
    const body = leaveSchema.parse({ body: { ...BASE, requestDate: '2026-07-28' } }).body;
    await employeesService.requestLeave(body, REQ);

    const data = p.leave.create.mock.calls[0][0].data;
    expect(data.requestDate).toEqual(body.requestDate);
    // حارس ضد أي حقن لتاريخ اليوم: القيمة ليست اليوم (الاختبار يجري بعد 2026-07-28).
    expect(data.requestDate).not.toEqual(new Date(new Date().toDateString()));
  });

  it('لا يمسّ عدد الأيام ولا الحالة — ما يزالان مشتقَّين كما كانا', async () => {
    const body = leaveSchema.parse({ body: { ...BASE, requestDate: '2026-06-01' } }).body;
    await employeesService.requestLeave(body, REQ);

    const data = p.leave.create.mock.calls[0][0].data;
    expect(data.days).toBe(5);
    expect(data.status).toBe('PENDING');
  });

  it('غيابه لا يكسر الإنشاء — السجل يُحفظ بلا الحقل', async () => {
    const body = leaveSchema.parse({ body: { ...BASE } }).body;
    await employeesService.requestLeave(body, REQ);

    const data = p.leave.create.mock.calls[0][0].data;
    expect(data.requestDate).toBeUndefined();
    expect(data.days).toBe(5);
  });
});
