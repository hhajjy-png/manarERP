import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    customer:  { findMany: vi.fn() },
    invoice:   { findMany: vi.fn() },
    employee:  { findMany: vi.fn() },
    equipment: { findMany: vi.fn() },
    expense:   { findMany: vi.fn() },
    cheque:    { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { searchService } from '../search.service';

/**
 * البحث الشامل — الصلاحيات والخصوصية.
 *
 * البحث ليس وحدة بذاتها بل **إسقاط لما يملك المستخدم قراءته**. فالقاعدة الحاكمة: ما لا
 * يُقرأ **لا يُستعلَم عنه أصلًا** — الحجب عند الاستعلام لا عند العرض.
 */

const p = prisma as unknown as Record<string, { findMany: ReturnType<typeof vi.fn> }>;

const ALL = ['customers.read', 'invoices.read', 'employees.read', 'equipment.read', 'expenses.read', 'cheques.read'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(p)) p[key].findMany.mockResolvedValue([]);
});

describe('الصلاحيات', () => {
  it('لا يُستعلَم عن كيان بلا صلاحية قراءته', async () => {
    await searchService.search('احمد', { roleName: 'ACCOUNTANT', permissions: ['invoices.read'] });
    expect(p.invoice.findMany).toHaveBeenCalledTimes(1);
    // البقية لم تُلمس — لا استعلام، لا تسريب، لا حِمل.
    expect(p.customer.findMany).not.toHaveBeenCalled();
    expect(p.employee.findMany).not.toHaveBeenCalled();
    expect(p.equipment.findMany).not.toHaveBeenCalled();
    expect(p.expense.findMany).not.toHaveBeenCalled();
    expect(p.cheque.findMany).not.toHaveBeenCalled();
  });

  it('مدير النظام يبحث في كل الكيانات بلا مفاتيح صريحة', async () => {
    await searchService.search('احمد', { roleName: 'SYSTEM_ADMIN', permissions: [] });
    for (const key of Object.keys(p)) expect(p[key].findMany).toHaveBeenCalledTimes(1);
  });

  it('مستخدم بلا أي صلاحية قراءة: نتيجة فارغة، لا خطأ ولا استعلام', async () => {
    const results = await searchService.search('احمد', { roleName: 'VIEWER', permissions: [] });
    expect(results).toEqual([]);
    for (const key of Object.keys(p)) expect(p[key].findMany).not.toHaveBeenCalled();
  });
});

describe('المصطلح', () => {
  it('أقل من حرفين: لا استعلام إطلاقًا — حرف واحد يطابق كل شيء', async () => {
    for (const term of ['', ' ', 'ا', '  a  ']) {
      const results = await searchService.search(term, { roleName: 'SYSTEM_ADMIN', permissions: [] });
      expect(results).toEqual([]);
    }
    for (const key of Object.keys(p)) expect(p[key].findMany).not.toHaveBeenCalled();
  });

  it('يُشذَّب قبل الاستعلام', async () => {
    await searchService.search('  احمد  ', { roleName: 'SYSTEM_ADMIN', permissions: [] });
    const where = p.customer.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('احمد');
    expect(JSON.stringify(where)).not.toContain(' احمد ');
  });

  it('سقف صارم لكل كيان — لا يتحوّل البحث إلى مسح للقاعدة', async () => {
    await searchService.search('اح', { roleName: 'SYSTEM_ADMIN', permissions: [] });
    for (const key of Object.keys(p)) {
      expect(p[key].findMany.mock.calls[0][0].take).toBe(5);
    }
  });
});

describe('الخصوصية — حقول العرض والتنقّل فقط', () => {
  it('الموظف: لا رقم مدني ولا هاتف ولا راتب — لا في الاستعلام ولا في النتيجة', async () => {
    await searchService.search('احمد', { roleName: 'SYSTEM_ADMIN', permissions: [] });
    const call = JSON.stringify(p.employee.findMany.mock.calls[0][0]);
    for (const forbidden of ['civilId', 'phone', 'salary', 'address', 'iban', 'accountNumber']) {
      expect(call).not.toContain(forbidden);
    }
  });

  it('النتيجة تحمل ما يكفي للعرض والتنقّل فقط', async () => {
    p.customer.findMany.mockResolvedValue([{ id: 3, name: 'شركة الوفاق', code: 'C-003' }]);
    const [hit] = await searchService.search('الوفاق', { roleName: 'SYSTEM_ADMIN', permissions: ALL });
    expect(hit).toEqual({
      type: 'customer',
      id: 3,
      title: 'شركة الوفاق',
      subtitle: 'C-003',
      route: '/customers?highlight=3',
    });
    expect(Object.keys(hit)).toHaveLength(5); // لا حقل زائد يتسرّب
  });
});

describe('النتائج', () => {
  it('تُدمج نتائج الكيانات في قائمة واحدة، ولكلٍّ مسار يفتحه', async () => {
    p.invoice.findMany.mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-2026-001', status: 'UNPAID', customer: { name: 'الوفاق' } },
    ]);
    p.cheque.findMany.mockResolvedValue([
      { id: 9, chequeNumber: '000123', beneficiaryName: 'مؤسسة الخليج', status: 'ISSUED' },
    ]);
    const results = await searchService.search('00', { roleName: 'SYSTEM_ADMIN', permissions: ALL });
    expect(results.map((r) => r.type).sort()).toEqual(['cheque', 'invoice']);
    expect(results.find((r) => r.type === 'invoice')!.route).toBe('/invoices?highlight=1');
    expect(results.find((r) => r.type === 'cheque')!.route).toBe('/cheques?highlight=9');
  });

  it('حقل اختياري فارغ لا يُنتج عنوانًا فارغًا', async () => {
    // اسم المعدّة اختياري في المخطط — الرمز هو الهوية البديلة.
    p.equipment.findMany.mockResolvedValue([{ id: 4, name: null, code: 'EQ-004', status: 'ACTIVE' }]);
    const [hit] = await searchService.search('EQ', { roleName: 'SYSTEM_ADMIN', permissions: ALL });
    expect(hit.title).toBe('EQ-004');
  });
});
