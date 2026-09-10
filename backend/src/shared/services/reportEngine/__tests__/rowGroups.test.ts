import { describe, it, expect } from 'vitest';
import { rowGroupLayout } from '../rowGroups';
import { buildTable } from '../table.template';

const rows = (...ids: (string | null)[]) => ids.map((g, i) => ({ n: i, g }));

describe('rowGroupLayout — كتل متجاورة فقط', () => {
  it('كتلة من أربعة ⇒ 4 ثم ثلاثة أصفار، كلها مجموعة', () => {
    expect(rowGroupLayout(rows('a', 'a', 'a', 'a'), 'g')).toEqual([
      { span: 4, grouped: true }, { span: 0, grouped: true }, { span: 0, grouped: true }, { span: 0, grouped: true },
    ]);
  });

  it('معرّف يعود بعد صفّ غريب ⇒ كتلتان مستقلّتان', () => {
    expect(rowGroupLayout(rows('a', 'a', null, 'a', 'a'), 'g').map((c) => c.span)).toEqual([2, 0, 1, 2, 0]);
  });

  it('صفّ وحيد بمعرّف، والمعرّفات الفارغة المتتالية لا تُجمَّع', () => {
    expect(rowGroupLayout(rows('a', null, null, '', 'b'), 'g')).toEqual(
      Array(5).fill({ span: 1, grouped: false }),
    );
  });

  it('مجموعتان متلاصقتان بمعرّفين مختلفين لا تندمجان', () => {
    expect(rowGroupLayout(rows('a', 'a', 'b', 'b', 'b'), 'g').map((c) => c.span)).toEqual([2, 0, 3, 0, 0]);
  });

  it('مصفوفة فارغة ⇒ فارغة', () => {
    expect(rowGroupLayout([], 'g')).toEqual([]);
  });
});

describe('buildTable — بلا rowGroupKey يبقى الجدول كما كان حرفيًا', () => {
  const columns = [
    { header: 'أ', key: 'n' },
    { header: 'ب', key: 'v', format: 'currency' as const, mergeRowGroup: true },
  ];
  const data = [{ n: 1, v: 10, g: 'x' }, { n: 2, v: 10, g: 'x' }];

  it('تقرير لا يُعلن المجموعة: لا rowspan ولا row-group، والتظليل بالتناوب كما هو', () => {
    const html = buildTable(columns, data);
    expect(html).not.toContain('rowspan');
    expect(html).not.toContain('row-group');
    expect(html).toContain('<tr class="zebra">');
  });

  it('مع rowGroupKey: خليّة واحدة rowspan=2 ولون المجموعة بدل التناوب', () => {
    const html = buildTable(columns, data, undefined, { rowGroupKey: 'g' });
    expect(html.match(/rowspan="2"/g)).toHaveLength(1);
    expect(html.match(/<tr class="row-group">/g)).toHaveLength(2);
    expect(html).not.toContain('zebra');
  });
});
