import { describe, it, expect } from 'vitest';
import {
  buildInvoiceWhere,
  buildProjectShares,
  projectDisplayName,
  UNASSIGNED_PROJECT_ID,
} from '../collectionAnalysis.dataset';
import { UNASSIGNED_LABEL } from '../collectionAnalysis.engine';

/* الدوال المختبَرة هنا نقيّة رغم سكناها في طبقة البيانات — لا Prisma في أيٍّ منها. */

const NAMES = new Map<number, string>([
  [5, 'مصنع أ — موقع 1'],
  [6, 'مصنع ب — موقع 2'],
]);

describe('buildProjectShares', () => {
  it('فاتورة بلا بنود تذهب كاملةً إلى «غير محدّد»', () => {
    expect(buildProjectShares(undefined, NAMES)).toEqual([
      { projectId: UNASSIGNED_PROJECT_ID, projectName: UNASSIGNED_LABEL, ratio: 1 },
    ]);
  });

  it('يوزّع بنسبة قيم البنود ومجموع الحصص = 1 بالضبط', () => {
    const shares = buildProjectShares(new Map([[5, 750], [6, 250]]), NAMES);
    expect(shares).toHaveLength(2);
    expect(shares.find((s) => s.projectId === 5)!.ratio).toBeCloseTo(0.75, 10);
    expect(shares.reduce((s, x) => s + x.ratio, 0)).toBe(1);
  });

  it('يصحّح انحراف الجمع العشري على أكبر حصّة فيبقى المجموع 1 تمامًا', () => {
    // ثلاثة أثلاث: 1/3 × 3 لا تساوي 1 في الثنائي بلا تصحيح.
    const shares = buildProjectShares(new Map([[5, 100], [6, 100], [7, 100]]), NAMES);
    expect(shares.reduce((s, x) => s + x.ratio, 0)).toBe(1);
  });

  it('يتجاهل البنود غير الموجبة، ويسقط إلى «غير محدّد» حين لا يبقى مقام موجب', () => {
    const mixed = buildProjectShares(new Map([[5, 100], [6, -40]]), NAMES);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].projectId).toBe(5);

    const empty = buildProjectShares(new Map([[5, -10]]), NAMES);
    expect(empty[0].projectId).toBe(UNASSIGNED_PROJECT_ID);
  });

  it('بند بلا اتفاقية سعر يحمل اسم «غير محدّد» لا اسمًا مفقودًا', () => {
    const shares = buildProjectShares(new Map([[UNASSIGNED_PROJECT_ID, 500]]), NAMES);
    expect(shares[0].projectName).toBe(UNASSIGNED_LABEL);
  });
});

describe('projectDisplayName', () => {
  it('يدمج المصنع والموقع، ويكتفي بالمتاح عند غياب أحدهما', () => {
    expect(projectDisplayName({ asphaltPlant: 'مصنع أ', contractLocation: 'الجهراء' })).toBe('مصنع أ — الجهراء');
    expect(projectDisplayName({ asphaltPlant: 'مصنع أ', contractLocation: '  ' })).toBe('مصنع أ');
    expect(projectDisplayName({ asphaltPlant: '', contractLocation: '' })).toBe(UNASSIGNED_LABEL);
  });
});

describe('buildInvoiceWhere', () => {
  it('يطبّق قاعدة فاتورة المبيعات الفعّالة دائمًا — لا تُعاد كتابتها هنا', () => {
    const where = buildInvoiceWhere({});
    expect(where.direction).toBe('SALES');
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('يضيف المدى والعميل والعقد فقط — بقيّة الفلاتر تحليلية وتُطبَّق في المحرّك', () => {
    const where = buildInvoiceWhere({
      invoiceFrom: '2024-01-01',
      invoiceTo: '2024-12-31',
      customerId: 3,
      contractId: 9,
      // فلاتر تحليلية: يجب ألّا تظهر في شرط SQL.
      settlement: 'PAID',
      collectionYear: 2025,
      projectId: 5,
    });
    expect(where.customerId).toBe(3);
    expect(where.contractId).toBe(9);
    expect(where.issueDate).toBeDefined();
    expect(where).not.toHaveProperty('settlement');
    expect(where).not.toHaveProperty('collectionYear');
    expect(where).not.toHaveProperty('projectId');
  });

  it('بلا مدى: لا شرط تاريخ إطلاقًا (كل الفترات)', () => {
    expect(buildInvoiceWhere({})).not.toHaveProperty('issueDate');
  });
});
