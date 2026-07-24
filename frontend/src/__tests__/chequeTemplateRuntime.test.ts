import { describe, it, expect } from 'vitest';
import {
  resolveChequeTemplate,
  resolveRuntimeValues,
  MOCK_RUNTIME_DATA,
  type RuntimeTemplateInput,
} from '../modules/chequeTemplateRuntime';
import type { DesignerField, DesignerSurfaceSpec } from '../modules/chequeTemplateDesigner';

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };

function field(overrides: Partial<DesignerField> & { id: string }): DesignerField {
  return {
    label: '',
    value: '',
    x: 10,
    y: 10,
    width: 20,
    height: 6,
    rotation: 0,
    fontSize: 12,
    fontWeight: 400,
    textAlign: 'left',
    color: '#000000',
    zIndex: 1,
    visible: true,
    ...overrides,
  };
}

function template(fields: DesignerField[]): RuntimeTemplateInput {
  return { surface: SURFACE, fields };
}

describe('resolveRuntimeValues', () => {
  it('returns the mock data when nothing is provided', () => {
    expect(resolveRuntimeValues()).toEqual(MOCK_RUNTIME_DATA);
  });

  it('overrides mock keys with provided values', () => {
    const merged = resolveRuntimeValues({ beneficiary: 'مستفيد آخر' });
    expect(merged.beneficiary).toBe('مستفيد آخر');
    expect(merged.amount).toBe(MOCK_RUNTIME_DATA.amount);
  });
});

describe('resolveChequeTemplate — text resolution', () => {
  it('binds a semantic field to the mock runtime value', () => {
    const model = resolveChequeTemplate(template([field({ id: 'beneficiary', value: 'placeholder' })]));
    const f = model.fields.find((x) => x.id === 'beneficiary');
    expect(f?.binding).toBe('beneficiary');
    expect(f?.text).toBe('شركة الخليج للمقاولات');
  });

  it('keeps the static value for a non-semantic (layout-only) field', () => {
    const model = resolveChequeTemplate(template([field({ id: 'note', value: 'ملاحظة ثابتة' })]));
    const f = model.fields.find((x) => x.id === 'note');
    expect(f?.binding).toBeNull();
    expect(f?.text).toBe('ملاحظة ثابتة');
  });

  it('lets provided runtime data override the mock', () => {
    const model = resolveChequeTemplate(template([field({ id: 'amount' })]), { amount: '9,999.000 KD' });
    expect(model.fields[0].text).toBe('9,999.000 KD');
  });
});

describe('resolveChequeTemplate — explicit binding', () => {
  it('binds a field by its explicit binding key', () => {
    const model = resolveChequeTemplate(template([field({ id: 'f1', binding: 'chequeDate', value: 'x' })]));
    const f = model.fields[0];
    expect(f.binding).toBe('chequeDate');
    expect(f.text).toBe(MOCK_RUNTIME_DATA.chequeDate);
  });

  it('treats "custom" binding as static and overrides id-inference', () => {
    const model = resolveChequeTemplate(template([field({ id: 'beneficiary', binding: 'custom', value: 'نص يدوي' })]));
    const f = model.fields[0];
    expect(f.binding).toBeNull();
    expect(f.text).toBe('نص يدوي');
  });

  it('treats "none" binding as static and ignores id-inference', () => {
    const model = resolveChequeTemplate(template([field({ id: 'beneficiary', binding: 'none', value: 'ثابت' })]));
    expect(model.fields[0].binding).toBeNull();
    expect(model.fields[0].text).toBe('ثابت');
  });
});

describe('resolveChequeTemplate — layout', () => {
  it('computes final mm geometry from the surface size', () => {
    const model = resolveChequeTemplate(template([field({ id: 'x', x: 20, y: 30, width: 40, height: 6 })]));
    const g = model.fields[0].geometry;
    expect(g.xMm).toBeCloseTo(35.6, 3); // 20% of 178mm
    expect(g.yMm).toBeCloseTo(26.7, 3); // 30% of 89mm
    expect(g.widthMm).toBeCloseTo(71.2, 3); // 40% of 178mm
    expect(g.heightMm).toBeCloseTo(5.34, 3); // 6% of 89mm
    expect(model.surface.widthMm).toBe(178);
    expect(model.surface.heightMm).toBe(89);
  });

  it('normalizes rotation into [0, 360)', () => {
    const model = resolveChequeTemplate(template([
      field({ id: 'a', rotation: -20 }),
      field({ id: 'b', rotation: 370 }),
    ]));
    const a = model.fields.find((x) => x.id === 'a');
    const b = model.fields.find((x) => x.id === 'b');
    expect(a?.geometry.rotationDeg).toBeCloseTo(340, 6);
    expect(b?.geometry.rotationDeg).toBeCloseTo(10, 6);
  });

  it('orders fields by ascending zIndex (painting order)', () => {
    const model = resolveChequeTemplate(template([
      field({ id: 'top', zIndex: 9 }),
      field({ id: 'bottom', zIndex: 1 }),
      field({ id: 'mid', zIndex: 5 }),
    ]));
    expect(model.fields.map((f) => f.id)).toEqual(['bottom', 'mid', 'top']);
  });
});

describe('resolveChequeTemplate — validation & graceful handling', () => {
  it('flags an empty template as an error and returns no fields', () => {
    const model = resolveChequeTemplate(template([]));
    expect(model.fields).toHaveLength(0);
    expect(model.meta.hasErrors).toBe(true);
    expect(model.issues.some((i) => i.code === 'EMPTY_TEMPLATE')).toBe(true);
  });

  it('flags an invalid/missing template as an error', () => {
    const model = resolveChequeTemplate(null);
    expect(model.meta.hasErrors).toBe(true);
    expect(model.issues.some((i) => i.code === 'INVALID_TEMPLATE' && i.severity === 'error')).toBe(true);
    expect(model.fields).toHaveLength(0);
  });

  it('clamps an out-of-range position and warns', () => {
    const model = resolveChequeTemplate(template([field({ id: 'p', x: 150, y: -10 })]));
    const g = model.fields[0].geometry;
    expect(g.xPercent).toBe(100);
    expect(g.yPercent).toBe(0);
    expect(model.issues.some((i) => i.code === 'INVALID_POSITION' && i.severity === 'warning')).toBe(true);
  });

  it('corrects an invalid size and warns', () => {
    const model = resolveChequeTemplate(template([field({ id: 's', width: 0, height: 999 })]));
    const g = model.fields[0].geometry;
    expect(g.widthPercent).toBe(10); // defaulted
    expect(g.heightPercent).toBe(100); // clamped
    expect(model.issues.some((i) => i.code === 'INVALID_SIZE')).toBe(true);
  });

  it('flags an invisible field and excludes it from visibleFields', () => {
    const model = resolveChequeTemplate(template([
      field({ id: 'shown' }),
      field({ id: 'hidden', visible: false }),
    ]));
    expect(model.fields).toHaveLength(2);
    expect(model.visibleFields.map((f) => f.id)).toEqual(['shown']);
    expect(model.issues.some((i) => i.code === 'INVISIBLE_FIELD' && i.fieldId === 'hidden')).toBe(true);
  });

  it('skips a malformed field object but still resolves the valid ones', () => {
    const fields = [null as unknown as DesignerField, field({ id: 'ok', value: 'ثابت' })];
    const model = resolveChequeTemplate(template(fields));
    expect(model.fields.map((f) => f.id)).toEqual(['ok']);
    expect(model.issues.some((i) => i.code === 'MISSING_FIELD_PROPS' && i.severity === 'error')).toBe(true);
  });

  it('defaults a non-finite font size to a safe value', () => {
    const model = resolveChequeTemplate(template([field({ id: 'f', fontSize: NaN as unknown as number })]));
    expect(model.fields[0].font.sizePx).toBe(12);
  });
});
