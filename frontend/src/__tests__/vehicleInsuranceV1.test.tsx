// @vitest-environment jsdom
/**
 * Vehicle Insurance Management v1 — حارس واجهة تأمين المركبات.
 *
 * ما تُثبته هذه المجموعة تحديدًا:
 *   • الجدول الرئيسي يعرض أعمدة الحزمة، ويلوّن الصف حسب نطاق التنبيه (7 / 15 / 30 /
 *     منتهية) مع بقاء الحالة **نصًّا** في عمودها — فلا معلومة تُنقل باللون وحده.
 *   • بطاقات المؤشرات الأربعة تُقرأ من `/vehicle-insurance/summary` لا من الجدول.
 *   • تبويب سجل الحوادث يُحمّل من نقطة نهاية الحوادث.
 *   • لا زرّ حذف في الشاشة كلها (السجل التاريخي محفوظ بالتصميم).
 *   • جذر الصفحة يحمل `xpl-scope` مع `xpl-page` — بدونه تفقد توكينات ExplorerKit
 *     تعريفها فتصير الأزرار بيضاء على أبيض (السابقة المسجَّلة في وحدة المستحقات).
 *   • CSS الصفحة بلا ألوان حرفية، ومحدّداته لا تتسرّب إلى صفحات أخرى.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

vi.mock('../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

import { api } from '../api/client';
import VehicleInsurance from '../pages/VehicleInsurance';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

const SUMMARY = {
  insuredVehicles: 4,
  expired: 1,
  expiringSoon: 2,
  due7: 1,
  due15: 1,
  due30: 0,
  totalCost: 1250.5,
  totalCostAllPolicies: 4000,
  totalPolicies: 9,
  totalAccidents: 3,
};

const policy = (over: Record<string, unknown> = {}) => ({
  id: 1,
  equipmentId: 1,
  equipment: { id: 1, code: 'EQ-01', name: 'قلاب', plateNumber: '1/12345' },
  policyNumber: 'POL-1001',
  insurerName: 'الخليج للتأمين',
  coverageType: 'COMPREHENSIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  cost: 250,
  notes: null,
  daysRemaining: 100,
  urgency: 'VALID',
  status: 'VALID',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const ROWS = [
  policy({ id: 1, equipmentId: 1, policyNumber: 'POL-EXPIRED', daysRemaining: -6, urgency: 'EXPIRED', status: 'EXPIRED' }),
  policy({
    id: 2,
    equipmentId: 2,
    equipment: { id: 2, code: 'EQ-02', name: 'شيول', plateNumber: '2/54321' },
    policyNumber: 'POL-DUE7',
    daysRemaining: 4,
    urgency: 'DUE_7',
    status: 'EXPIRING_SOON',
  }),
  policy({
    id: 3,
    equipmentId: 3,
    equipment: { id: 3, code: 'EQ-03', name: 'حفار', plateNumber: '3/11111' },
    policyNumber: 'POL-DUE15',
    daysRemaining: 13,
    urgency: 'DUE_15',
    status: 'EXPIRING_SOON',
  }),
  policy({
    id: 4,
    equipmentId: 4,
    equipment: { id: 4, code: 'EQ-04', name: 'مدحلة', plateNumber: '4/22222' },
    policyNumber: 'POL-VALID',
    daysRemaining: 300,
    urgency: 'VALID',
    status: 'VALID',
    insurerName: 'وربة للتأمين',
  }),
];

const ACCIDENTS = [
  {
    id: 11,
    equipmentId: 1,
    equipment: { id: 1, code: 'EQ-01', name: 'قلاب', plateNumber: '1/12345' },
    accidentDate: '2026-05-05',
    description: 'اصطدام خفيف في الصندوق الخلفي',
    repairCost: 75.5,
    notes: null,
    createdAt: '2026-05-05T00:00:00.000Z',
  },
];

function routeGet(url: string) {
  if (url === '/vehicle-insurance/summary') return Promise.resolve({ data: { data: SUMMARY } });
  if (url === '/vehicle-insurance/equipment-options') {
    return Promise.resolve({ data: { data: ROWS.map((r) => r.equipment) } });
  }
  if (url === '/vehicle-insurance/insurers') {
    return Promise.resolve({ data: { data: ['الخليج للتأمين', 'وربة للتأمين'] } });
  }
  if (url === '/vehicle-insurance/accidents') return Promise.resolve({ data: { data: ACCIDENTS } });
  if (url === '/vehicle-insurance') return Promise.resolve({ data: { data: ROWS } });
  return Promise.resolve({ data: { data: [] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.get.mockImplementation((url: string) => routeGet(url));
});

const PAGE_SRC = readFileSync('src/pages/VehicleInsurance.tsx', 'utf8');
const PAGE_CSS = readFileSync('src/pages/VehicleInsurance.css', 'utf8');

describe('تأمين المركبات — الجدول الرئيسي', () => {
  it('يعرض صفًّا لكل مركبة مؤمَّن عليها برقم الوثيقة وشركة التأمين', async () => {
    render(<VehicleInsurance />);

    await waitFor(() => expect(screen.getByText('POL-EXPIRED')).toBeInTheDocument());
    expect(screen.getByText('POL-DUE7')).toBeInTheDocument();
    expect(screen.getByText('POL-DUE15')).toBeInTheDocument();
    expect(screen.getByText('POL-VALID')).toBeInTheDocument();
    // الاسم يظهر في الجدول وفي قائمة تصفية الشركات معًا — لذا getAllByText.
    expect(screen.getAllByText('الخليج للتأمين').length).toBeGreaterThan(0);
    expect(screen.getAllByText('وربة للتأمين').length).toBeGreaterThan(0);
  });

  it('يلوّن الصف حسب نطاق التنبيه، والحالة تبقى نصًّا في عمودها', async () => {
    render(<VehicleInsurance />);
    await waitFor(() => expect(screen.getByText('POL-EXPIRED')).toBeInTheDocument());

    const rowOf = (policyNumber: string) => screen.getByText(policyNumber).closest('tr')!;

    expect(rowOf('POL-EXPIRED').className).toContain('vins-row--expired');
    expect(rowOf('POL-DUE7').className).toContain('vins-row--due7');
    expect(rowOf('POL-DUE15').className).toContain('vins-row--due15');
    expect(rowOf('POL-VALID').className).toContain('vins-row--valid');

    // اللون تعزيز لا بديل: نص الحالة موجود داخل الصف نفسه.
    expect(within(rowOf('POL-EXPIRED')).getByText('منتهي')).toBeInTheDocument();
    expect(within(rowOf('POL-DUE7')).getByText('ينتهي قريبًا')).toBeInTheDocument();
    expect(within(rowOf('POL-VALID')).getByText('ساري')).toBeInTheDocument();
  });

  it('يعرض الأيام المتبقية نصًّا مفهومًا في الاتجاهين', async () => {
    render(<VehicleInsurance />);
    await waitFor(() => expect(screen.getByText('POL-EXPIRED')).toBeInTheDocument());

    expect(screen.getByText('منتهية منذ 6 يوم')).toBeInTheDocument();
    expect(screen.getByText('متبقٍّ 4 يوم')).toBeInTheDocument();
  });

  it('يطلب الجدول والمؤشرات وقائمة الشركات وخيارات المعدات — كلها من نقاط نهاية الوحدة', async () => {
    render(<VehicleInsurance />);
    await waitFor(() => expect(screen.getByText('POL-EXPIRED')).toBeInTheDocument());

    const urls = mockApi.get.mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain('/vehicle-insurance');
    expect(urls).toContain('/vehicle-insurance/summary');
    expect(urls).toContain('/vehicle-insurance/insurers');
    expect(urls).toContain('/vehicle-insurance/equipment-options');
    // لا يستهلك وحدة المعدات — من يملك صلاحية التأمين لا يحتاج `equipment.read`.
    expect(urls.some((u: string) => u === '/equipment')).toBe(false);
  });
});

describe('تأمين المركبات — المؤشرات', () => {
  it('يعرض المؤشرات الأربعة المطلوبة من نقطة نهاية الملخّص', async () => {
    render(<VehicleInsurance />);

    await waitFor(() => expect(screen.getByText('المركبات المؤمَّن عليها')).toBeInTheDocument());
    expect(screen.getByText('وثائق منتهية')).toBeInTheDocument();
    expect(screen.getByText('تنتهي قريبًا')).toBeInTheDocument();
    expect(screen.getByText('إجمالي تكلفة التأمين')).toBeInTheDocument();
    // العدد يأتي من الملخّص (4 مركبات · 9 وثائق محفوظة) لا من طول الجدول.
    expect(screen.getByText('9 وثيقة')).toBeInTheDocument();
  });
});

describe('تأمين المركبات — سجل الحوادث', () => {
  it('يحمّل الحوادث من نقطة نهاية الحوادث عند فتح التبويب', async () => {
    localStorage.setItem('vins:tab', JSON.stringify('accidents'));
    render(<VehicleInsurance />);

    await waitFor(() =>
      expect(screen.getByText('اصطدام خفيف في الصندوق الخلفي')).toBeInTheDocument(),
    );
    const urls = mockApi.get.mock.calls.map((c: any[]) => c[0]);
    expect(urls).toContain('/vehicle-insurance/accidents');
  });
});

describe('تأمين المركبات — حدود الوحدة في الواجهة', () => {
  it('لا زرّ حذف ولا نداء DELETE في الشاشة — السجل التاريخي محفوظ', () => {
    expect(PAGE_SRC).not.toMatch(/api\.delete/);
    expect(PAGE_SRC).not.toMatch(/variant="danger"/);
    expect(PAGE_SRC).not.toMatch(/icon="delete"/);
  });

  it('لا تكتب الصفحة في أي وحدة أخرى — نقاط النهاية كلها تحت /vehicle-insurance', () => {
    const writes = [...PAGE_SRC.matchAll(/api\.(?:post|patch|put)\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]);
    expect(writes.length).toBeGreaterThan(0);
    for (const url of writes) {
      expect(url.startsWith('/vehicle-insurance/')).toBe(true);
    }
  });

  it('التجديد يستدعي إنشاء وثيقة جديدة لا تعديل القديمة', () => {
    // زرّ التجديد يفتح نموذج الإنشاء (نفس النموذج) — لا مسار PATCH خلفه.
    expect(PAGE_SRC).toMatch(/function openRenew/);
    expect(PAGE_SRC).toMatch(/id="vins-policy-create"/);
  });
});

describe('تأمين المركبات — سلامة الأنماط', () => {
  it('جذر الصفحة يحمل `xpl-scope` مع `xpl-page`', () => {
    const roots = [...PAGE_SRC.matchAll(/className="([^"]*\bxpl-page\b[^"]*)"/g)].map((m) => m[1]);
    expect(roots.length).toBeGreaterThan(0);
    for (const cls of roots) expect(cls).toContain('xpl-scope');
  });

  it('لا لون مكتوب يدويًا في CSS الصفحة — التوكينات وحدها', () => {
    const css = PAGE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css.match(/\brgba?\(/g) ?? []).toEqual([]);
  });

  it('لا محدّد ExplorerKit عالمي يتسرّب من CSS الصفحة', () => {
    const css = PAGE_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const leaked = [...css.matchAll(/^\s*(\.xpl-[\w-]+[^{]*)\{/gm)].map((m) => m[1].trim());
    expect(leaked).toEqual([]);
  });
});
