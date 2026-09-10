import { describe, it, expect } from 'vitest';
import { rowGroupLayout } from '../reportRowGroups';

const rows = (...ids: (string | null)[]) => ids.map((g, i) => ({ n: i, g }));

describe('rowGroupLayout (الواجهة) — كتل متجاورة فقط', () => {
  it('كتلة من أربعة ⇒ 4 ثم ثلاثة أصفار', () => {
    expect(rowGroupLayout(rows('a', 'a', 'a', 'a'), 'g').map((c) => c.span)).toEqual([4, 0, 0, 0]);
  });

  it('معرّف يعود بعد صفّ غريب ⇒ كتلتان مستقلّتان', () => {
    expect(rowGroupLayout(rows('a', 'a', null, 'a', 'a'), 'g').map((c) => c.span)).toEqual([2, 0, 1, 2, 0]);
  });

  it('صفّ وحيد بمعرّف، والمعرّفات الفارغة المتتالية لا تُجمَّع', () => {
    expect(rowGroupLayout(rows('a', null, null, '', 'b'), 'g')).toEqual(Array(5).fill({ span: 1, grouped: false }));
  });

  it('مجموعتان متلاصقتان بمعرّفين مختلفين لا تندمجان', () => {
    expect(rowGroupLayout(rows('a', 'a', 'b', 'b', 'b'), 'g').map((c) => c.span)).toEqual([2, 0, 3, 0, 0]);
  });
});
