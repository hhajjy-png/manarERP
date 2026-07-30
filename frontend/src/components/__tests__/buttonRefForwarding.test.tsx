// @vitest-environment jsdom
/**
 * انحدار: CalendarDayButton Ref Compatibility v1
 *
 * ملف shadcn `ui/button.tsx` كان مكتوبًا لاصطلاح **React 19** (‏`ref` خاصية عادية)
 * بينما المشروع على **React 18.3.1**، حيث ينتزع `createElement` الـref ولا يُمرّره
 * لمكوّن دالة — فيُطبع «Function components cannot be given refs»، ويبقى
 * `ref.current` في `CalendarDayButton` فارغًا فتتعطّل حركة التركيز بين الأيام بصمت.
 *
 * TypeScript لم يلتقطه لأن النوع كان `ComponentProps<"button">` وهو يتضمّن `ref`.
 * لذلك الحارس هنا **سلوكي** (يفحص التشغيل) لا نوعي.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRef, useRef, useEffect, useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import DateInput from '../DateInput';

// ── التقاط تحذير React ───────────────────────────────────────────────────────
const REF_WARNING = /Function components cannot be given refs/i;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
});

/** كل ما طُبع على console.error أثناء الاختبار، مُسطَّحًا كنصّ واحد. */
const loggedErrors = () =>
  consoleErrorSpy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');

// ── 1) عقد الـref على Button نفسه ────────────────────────────────────────────

describe('Button — تمرير الـref', () => {
  it('يصل الـref إلى عنصر <button> الحقيقي في الـDOM، بلا تحذير', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>احفظ</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toBe(screen.getByText('احفظ'));
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('الـref قابل للاستخدام فعليًا: focus() يحرّك التركيز', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>ركّز</Button>);

    ref.current!.focus();
    expect(document.activeElement).toBe(ref.current);
  });

  it('callback ref مدعوم أيضًا', () => {
    let captured: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { captured = el; }}>cb</Button>);
    expect(captured).toBeInstanceOf(HTMLButtonElement);
  });

  it('يبقى Button العادي (بلا ref) يعمل كما هو: variants وsize وclassName وonClick', () => {
    const onClick = vi.fn();
    render(
      <Button variant="destructive" size="sm" className="my-extra" onClick={onClick}>
        احذف
      </Button>,
    );
    const btn = screen.getByText('احذف');

    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('data-slot', 'button');
    expect(btn).toHaveAttribute('data-variant', 'destructive');
    expect(btn).toHaveAttribute('data-size', 'sm');
    expect(btn.className).toContain('my-extra');           // دمج className محفوظ
    expect(btn.className).toContain('bg-destructive');     // صنف الـvariant محفوظ

    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('الافتراضيات دون تمرير variant/size تبقى default/default', () => {
    render(<Button>افتراضي</Button>);
    const btn = screen.getByText('افتراضي');
    expect(btn).toHaveAttribute('data-variant', 'default');
    expect(btn).toHaveAttribute('data-size', 'default');
  });

  it('`asChild` لم يُكسر: يُصيَّر عنصر الابن لا <button>، والـref يصل إليه', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button asChild ref={ref as unknown as React.Ref<HTMLButtonElement>}>
        <a href="#x" data-testid="as-anchor">رابط</a>
      </Button>,
    );
    const el = screen.getByTestId('as-anchor');

    expect(el.tagName).toBe('A');                        // Slot صيّر الابن
    expect(el).toHaveAttribute('data-slot', 'button');   // خصائص Button مُمرَّرة
    expect(el.className).toContain('inline-flex');       // أصناف الـvariant مُطبَّقة
    expect(ref.current).toBe(el);                        // الـref مدموج مع الابن
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('`disabled` ما زال يمنع النقر', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>معطّل</Button>);
    fireEvent.click(screen.getByText('معطّل'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ── 2) التقويم — لا تحذير، ويعمل ─────────────────────────────────────────────

describe('Calendar — لا تحذير ref، والاختيار يعمل', () => {
  it('يُصيَّر بلا تحذير «Function components cannot be given refs»', () => {
    render(<Calendar mode="single" defaultMonth={new Date(2025, 2, 1)} />);
    expect(document.body.querySelector('table')).toBeInTheDocument();
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('اختيار يوم يستدعي onSelect بالتاريخ الصحيح', () => {
    const onSelect = vi.fn();
    render(
      <Calendar mode="single" defaultMonth={new Date(2025, 2, 1)} onSelect={onSelect} />,
    );
    // 31/03/2025 — نفس تاريخ الفاتورة التاريخية التي كشفت هذا المسار.
    fireEvent.click(screen.getByText('31'));

    expect(onSelect).toHaveBeenCalled();
    const picked = onSelect.mock.calls[0][0] as Date;
    expect(picked.getFullYear()).toBe(2025);
    expect(picked.getMonth()).toBe(2);
    expect(picked.getDate()).toBe(31);
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('أزرار الأيام عناصر <button> حقيقية قابلة للتركيز (شرط عمل ref.current.focus)', () => {
    render(<Calendar mode="single" defaultMonth={new Date(2025, 2, 1)} />);
    const day = screen.getByText('15').closest('button');

    expect(day).toBeInstanceOf(HTMLButtonElement);
    day!.focus();
    expect(document.activeElement).toBe(day);
  });

  it('داخل Popover: يفتح ويختار بلا تحذير (نفس تركيب DateCalendarPicker)', () => {
    const onSelect = vi.fn();
    render(
      <Popover>
        <PopoverTrigger>افتح</PopoverTrigger>
        <PopoverContent>
          <Calendar mode="single" defaultMonth={new Date(2025, 2, 1)} onSelect={onSelect} />
        </PopoverContent>
      </Popover>,
    );
    expect(document.body.querySelector('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('افتح'));
    expect(document.body.querySelector('table')).toBeInTheDocument();

    fireEvent.click(screen.getByText('20'));
    expect(onSelect).toHaveBeenCalled();
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });
});

// ── 3) DateInput — الدلالة والصيغة لم تتغيّرا ────────────────────────────────

describe('DateInput — DD/MM/YYYY ودلالة التاريخ سليمة', () => {
  function Harness({ initial = '' }: { initial?: string }) {
    const [v, setV] = useState(initial);
    return (
      <>
        <DateInput value={v} onChange={setV} ariaLabel="تاريخ" />
        <span data-testid="iso">{v || '—'}</span>
      </>
    );
  }

  it('يعرض DD/MM/YYYY ويُصدر YYYY-MM-DD بلا انزلاق يوم', () => {
    render(<Harness initial="2025-03-31" />);
    expect(screen.getByLabelText('تاريخ')).toHaveValue('31/03/2025');
    expect(screen.getByTestId('iso').textContent).toBe('2025-03-31');
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });

  it('الكتابة اليدوية ثم blur تُثبّت نفس التاريخ', () => {
    render(<Harness />);
    const input = screen.getByLabelText('تاريخ');
    fireEvent.change(input, { target: { value: '31/03/2025' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('iso').textContent).toBe('2025-03-31');
  });

  it('فتح تقويم DateInput لا يُنتج تحذير ref', () => {
    render(<Harness initial="2025-03-31" />);
    const calBtn = document.querySelector('.mnr-dateinput__cal') as HTMLButtonElement;
    expect(calBtn).not.toBeNull();

    fireEvent.click(calBtn);
    expect(document.body.querySelector('table')).toBeInTheDocument();
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });
});

// ── 4) حارس مباشر لآلية CalendarDayButton ────────────────────────────────────

describe('آلية CalendarDayButton — ref.current متاح داخل useEffect', () => {
  it('نفس نمط react-day-picker: useRef → <Button ref> → focus() ينجح', () => {
    // يُعيد إنتاج ما يفعله CalendarDayButton حرفيًا؛ قبل الإصلاح كان
    // ref.current يبقى null فلا يقع أي focus.
    const seen: (HTMLButtonElement | null)[] = [];
    function DayLike({ focused }: { focused: boolean }) {
      const ref = useRef<HTMLButtonElement>(null);
      useEffect(() => {
        seen.push(ref.current);
        if (focused) ref.current?.focus();
      }, [focused]);
      return <Button ref={ref}>يوم</Button>;
    }

    render(<DayLike focused />);

    expect(seen[0]).toBeInstanceOf(HTMLButtonElement);   // ← كان null قبل الإصلاح
    expect(document.activeElement).toBe(screen.getByText('يوم'));
    expect(loggedErrors()).not.toMatch(REF_WARNING);
  });
});
