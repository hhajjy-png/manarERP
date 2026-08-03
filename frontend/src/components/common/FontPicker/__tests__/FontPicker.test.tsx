// @vitest-environment jsdom
/**
 * FontPicker — تحقّق من بنود «Validation» في حزمة v2 على المكوّن الحقيقي.
 *
 * ما يثبته هذا الملف
 * ──────────────────
 *   · كل خطوط السجل تظهر في المنتقي.
 *   · المعاينة تستعمل **الخط الحقيقي** — أي أن `font-family` على عنصر المعاينة
 *     يحمل عائلة ذلك الخط بعينه، لا خط الواجهة الموروث. jsdom لا يُصيّر خطوطًا،
 *     فالمقيس هنا هو ما يُصرّح به المكوّن — وهو بالضبط ما يقرأه المتصفح.
 *   · البحث يعمل («trad» ⇒ Traditional Arabic).
 *   · لوحة المفاتيح والاختيار وحالة اللاشيء.
 *
 * ما لا يثبته: الشكل المُصيَّر. لا تُدَّعى أي معاينة بصرية هنا.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import FontPicker from '../FontPicker';
import {
  getEnabledFonts,
  getFont,
  getUIFonts,
  type FontId,
  type FontMeta,
} from '../../../../styles/fontRegistry';

const ALL = getEnabledFonts();

function open(): HTMLElement {
  fireEvent.click(screen.getByRole('button'));
  return screen.getByRole('listbox');
}

/** صفوف الخيارات الحالية بترتيب العرض. */
function optionRows(): HTMLElement[] {
  return screen.queryAllByRole('option');
}

/** نص العيّنة داخل صف — العنصر الذي يحمل `font-family` الخط. */
function previewOf(row: HTMLElement): HTMLElement {
  const el = row.querySelector<HTMLElement>('.fpk-opt-preview');
  if (!el) throw new Error('صف بلا عنصر معاينة');
  return el;
}

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
});

describe('FontPicker — العرض', () => {
  it('يعرض عنصرًا نائبًا حين لا قيمة', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    expect(screen.getByRole('button')).toHaveTextContent('اختر خطًا…');
  });

  it('كل خطوط السجل المُفعَّلة تظهر عند الفتح', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const names = optionRows().map((r) => r.getAttribute('data-font-id'));
    expect(names).toEqual(ALL.map((f) => f.id));
    expect(names).toHaveLength(12);
  });

  it('معاينة كل صف تُصرّح عائلة ذلك الخط بعينه', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    for (const row of optionRows()) {
      const meta = ALL.find((f) => f.id === row.getAttribute('data-font-id')) as FontMeta;
      expect(previewOf(row).style.fontFamily).toContain(meta.family);
    }
  });

  it('لا صفَّين يتشاركان نفس عائلة المعاينة — المعاينات متمايزة فعلًا', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const families = optionRows().map((r) => previewOf(r).style.fontFamily);
    expect(new Set(families).size).toBe(families.length);
  });

  it('المعاينة تأخذ مقاس الخط وارتفاع سطره من بياناته لا مقاسًا موحَّدًا', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const row = optionRows().find((r) => r.getAttribute('data-font-id') === 'ptBoldHeading')!;
    const meta = getFont('ptBoldHeading');
    expect(previewOf(row).style.fontSize).toBe(`${meta.defaultSize}px`);
    expect(previewOf(row).style.lineHeight).toBe(String(meta.defaultLineHeight));
  });

  it('يعرض نص المعاينة الخاص بكل خط، ويحترم التجاوز الموحَّد', () => {
    const { unmount } = render(<FontPicker value={null} onChange={onChange} />);
    open();
    expect(previewOf(optionRows()[0])).toHaveTextContent('شركة المنار الدولية');
    unmount();

    render(<FontPicker value={null} onChange={onChange} previewText="نص المستند" />);
    open();
    for (const row of optionRows()) {
      expect(previewOf(row)).toHaveTextContent('نص المستند');
    }
  });

  it('الزرّ يعرض اسم المختار بخطّه هو، وتصنيفه بالعربية', () => {
    render(<FontPicker value="amiri" onChange={onChange} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('Amiri');
    expect(trigger).toHaveTextContent('رسمي');
    expect(trigger.querySelector<HTMLElement>('.fpk-trigger-name')!.style.fontFamily).toContain(
      'Amiri',
    );
  });

  it('قيمة محفوظة تشير إلى خط غير مسجَّل تُعرض ولا تُبتلع', () => {
    render(<FontPicker value="font-was-removed" onChange={onChange} />);
    const trigger = screen.getByRole('button');
    expect(trigger).toHaveTextContent('font-was-removed');
    expect(trigger.querySelector('.fpk-unknown')).not.toBeNull();
  });

  it('الصف المختار معلَّم لقارئ الشاشة', () => {
    render(<FontPicker value="cairo" onChange={onChange} />);
    open();
    const selected = optionRows().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('data-font-id')).toBe('cairo');
  });
});

describe('FontPicker — النطاق', () => {
  it('`category` يقيّد المعروض بتصنيف واحد', () => {
    render(<FontPicker value={null} onChange={onChange} category="UI" />);
    open();
    expect(optionRows().map((r) => r.getAttribute('data-font-id'))).toEqual(
      getUIFonts().map((f) => f.id),
    );
  });

  it('`fonts` يتقدّم على `category`', () => {
    const only = [getFont('amiri')];
    render(<FontPicker value={null} onChange={onChange} fonts={only} category="UI" />);
    open();
    expect(optionRows()).toHaveLength(1);
    expect(optionRows()[0].getAttribute('data-font-id')).toBe('amiri');
  });
});

describe('FontPicker — البحث', () => {
  function searchFor(text: string) {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: text } });
  }

  it('«trad» يصل مباشرة إلى Traditional Arabic', () => {
    searchFor('trad');
    expect(optionRows()).toHaveLength(1);
    expect(optionRows()[0].getAttribute('data-font-id')).toBe('traditionalArabic');
  });

  it('البحث بالعربية يعمل مع تطبيع الهمزات', () => {
    searchFor('اميري');
    expect(optionRows().map((r) => r.getAttribute('data-font-id'))).toEqual(['amiri']);
  });

  it('نص غير مطابق يُظهر حالة «لا نتائج» بلا صفوف', () => {
    searchFor('zzzzz');
    expect(optionRows()).toHaveLength(0);
    expect(screen.getByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
  });

  it('مسح نص البحث يعيد القائمة كاملة', () => {
    searchFor('trad');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(optionRows()).toHaveLength(12);
  });

  it('البحث يُعاد ضبطه عند إعادة الفتح', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'trad' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    open();
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(optionRows()).toHaveLength(12);
  });
});

describe('FontPicker — الاختيار ولوحة المفاتيح', () => {
  it('النقر يختار الخط ويمرّر المعرّف وبياناته معًا', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const row = optionRows().find((r) => r.getAttribute('data-font-id') === 'scheherazade')!;
    fireEvent.mouseDown(row);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [id, meta] = onChange.mock.calls[0] as [FontId, FontMeta];
    expect(id).toBe('scheherazade');
    expect(meta).toBe(getFont('scheherazade'));
  });

  it('الاختيار يغلق اللوحة', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    fireEvent.mouseDown(optionRows()[0]);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('سهم لأسفل ثم Enter يختار الصف التالي', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(ALL[1].id);
  });

  it('Escape يغلق بلا اختيار', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter على «لا نتائج» لا يختار شيئًا', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'zzzzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('`disabled` يمنع الفتح', () => {
    render(<FontPicker value={null} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('اللوحة موصولة بقارئ الشاشة: combobox ⇄ listbox ⇄ العنصر النشط', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    const list = open();
    const input = screen.getByRole('combobox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(input.getAttribute('aria-activedescendant')).toBe(optionRows()[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(optionRows()[1].id);
  });

  it('الفتح يضع المؤشر على الخط المختار لا على أول الصفوف', () => {
    render(<FontPicker value="sultan" onChange={onChange} />);
    open();
    const idx = ALL.findIndex((f) => f.id === 'sultan');
    expect(screen.getByRole('combobox').getAttribute('aria-activedescendant')).toBe(
      optionRows()[idx].id,
    );
  });
});

describe('FontPicker — العزل عن بقية النظام', () => {
  it('اسم الخط في السطر العلوي يبقى بخط الواجهة — لا يرث خط العيّنة', () => {
    render(<FontPicker value={null} onChange={onChange} />);
    open();
    for (const row of optionRows()) {
      const name = within(row).getByText(
        ALL.find((f) => f.id === row.getAttribute('data-font-id'))!.displayName,
      );
      expect(name.style.fontFamily).toBe('');
    }
  });
});
