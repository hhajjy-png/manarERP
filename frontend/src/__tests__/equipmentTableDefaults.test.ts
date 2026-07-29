// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableSort } from '../hooks/useTableSort';
import { resetRunStartUIState } from '../lib/runStartUIState';
import { MODULES } from '../config/modules';

/**
 * Equipment Data Pack v1 — السلوك الافتراضي لجدول المعدات:
 * كل تشغيل جديد يبدأ من الصفحة الأولى ومن «المدة الباقية» تصاعديًا، وأثناء
 * الجلسة يبقى اختيار المستخدم كما هو.
 */

const PAGE_KEY = 'rp:equipment:page';
const SORT_KEY = 'rp:equipment:sort';
const RUN_FLAG = 'manarERP.run.started';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('إعدادات وحدة المعدات', () => {
  it('الترتيب الافتراضي = المدة الباقية تصاعديًا، ومفتاحه عمود قابل للفرز في الجدول', () => {
    const cfg = MODULES.equipment;
    expect(cfg.defaultSort).toEqual({ by: 'regRemaining', dir: 'asc' });
    const column = cfg.columns.find((c) => c.key === cfg.defaultSort!.by);
    expect(column?.sortable).toBe(true);
  });

  it('«النوع» صار «الشكل» عرضًا فقط — مفتاح العمود والحقل ما زال `type`', () => {
    const cfg = MODULES.equipment;
    expect(cfg.columns.find((c) => c.key === 'type')?.label).toBe('col.eq_shape');
    expect(cfg.fields.find((f) => f.name === 'type')?.label).toBe('field.eq_type');
  });

  it('الحقول الأربعة الجديدة معروضة في الجدول وفي نموذج الإضافة/التعديل', () => {
    const cfg = MODULES.equipment;
    ['chassisNumber', 'manufacturer', 'manufactureYear', 'color'].forEach((key) => {
      expect(cfg.columns.some((c) => c.key === key)).toBe(true);
      expect(cfg.fields.some((f) => f.name === key)).toBe(true);
    });
  });
});

describe('useTableSort — الترتيب الافتراضي لكل وحدة', () => {
  it('بلا اختيار محفوظ يبدأ من الافتراضي المعرَّف للوحدة', () => {
    const { result } = renderHook(() => useTableSort('equipment', undefined, { by: 'regRemaining', dir: 'asc' }));
    expect(result.current.sortBy).toBe('regRemaining');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.getState('regRemaining')).toBe('asc');
  });

  it('الاختيار المحفوظ أثناء الجلسة يتقدّم على الافتراضي', () => {
    localStorage.setItem(SORT_KEY, JSON.stringify({ by: 'code', dir: 'desc' }));
    const { result } = renderHook(() => useTableSort('equipment', undefined, { by: 'regRemaining', dir: 'asc' }));
    expect(result.current.sortBy).toBe('code');
    expect(result.current.sortDir).toBe('desc');
  });

  it('إكمال دورة الفرز و«إعادة التعيين» يعودان إلى الافتراضي لا إلى «بلا فرز»', () => {
    const { result } = renderHook(() => useTableSort('equipment', undefined, { by: 'regRemaining', dir: 'asc' }));
    act(() => result.current.toggle('code')); // asc
    act(() => result.current.toggle('code')); // desc
    act(() => result.current.toggle('code')); // ← الافتراضي
    expect(result.current.sortBy).toBe('regRemaining');
    expect(result.current.sortDir).toBe('asc');

    act(() => result.current.toggle('code'));
    act(() => result.current.reset());
    expect(result.current.sortBy).toBe('regRemaining');
  });

  it('وحدة بلا افتراضي: السلوك السابق كما هو (بلا معطيات فرز)', () => {
    const { result } = renderHook(() => useTableSort('customers'));
    expect(result.current.sortBy).toBeNull();
    act(() => result.current.toggle('name'));
    act(() => result.current.toggle('name'));
    act(() => result.current.toggle('name'));
    expect(result.current.sortBy).toBeNull();
  });
});

describe('resetRunStartUIState — الصفحة الأولى والترتيب الافتراضي عند كل تشغيل', () => {
  it('تشغيل جديد يمسح صفحة المعدات وفرزها المحفوظين', () => {
    localStorage.setItem(PAGE_KEY, '4');
    localStorage.setItem(SORT_KEY, JSON.stringify({ by: 'code', dir: 'desc' }));

    resetRunStartUIState();

    expect(localStorage.getItem(PAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SORT_KEY)).toBeNull();
    expect(sessionStorage.getItem(RUN_FLAG)).toBe('1');

    // ومن ثمّ يقرأ الخطّاف الافتراضي: الصفحة 1 والمدة الباقية تصاعديًا.
    const { result } = renderHook(() => useTableSort('equipment', undefined, MODULES.equipment.defaultSort));
    expect(result.current.sortBy).toBe('regRemaining');
  });

  it('أثناء نفس التشغيل (إعادة تحميل النافذة) لا يُمسّ اختيار المستخدم', () => {
    resetRunStartUIState();
    localStorage.setItem(PAGE_KEY, '3');
    localStorage.setItem(SORT_KEY, JSON.stringify({ by: 'code', dir: 'desc' }));

    resetRunStartUIState();

    expect(localStorage.getItem(PAGE_KEY)).toBe('3');
    expect(JSON.parse(localStorage.getItem(SORT_KEY)!)).toEqual({ by: 'code', dir: 'desc' });
  });

  it('لا يمسّ حالة الوحدات الأخرى', () => {
    localStorage.setItem('rp:customers:page', '5');
    localStorage.setItem('rp:employees:sort', JSON.stringify({ by: 'code', dir: 'asc' }));

    resetRunStartUIState();

    expect(localStorage.getItem('rp:customers:page')).toBe('5');
    expect(localStorage.getItem('rp:employees:sort')).not.toBeNull();
  });
});
