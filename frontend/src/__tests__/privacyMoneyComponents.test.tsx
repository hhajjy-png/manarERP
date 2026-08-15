// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import PrivateAmount from '../components/PrivateAmount';
import { MoneyText, MoneyCell } from '../config/modules';
import { useUI } from '../stores/uiStore';

/**
 * تغطية مركّزة لأهم مكوّنات عرض الأموال — `PrivateAmount` (الأصل) و`MoneyText`/
 * `MoneyCell` (المكوّنان المشتركان في `config/modules.tsx` المُستخدَمان في عشرات
 * الشاشات: الفواتير، الرواتب، المحاسبة، تحليل التحصيلات...).
 *
 * تثبت أن الثلاثة تشترك فعليًا في `privacyMode` من المخزن نفسه — لا نسخة محلية،
 * ولا حالة مبنية مرّة واحدة عند التحميل — وأن التبديل المتكرر لا يُفقد التزامن.
 */

afterEach(() => {
  cleanup();
  useUI.setState({ privacyMode: true }); // العودة إلى الافتراضي بين الاختبارات
});

function maskSpan(container: HTMLElement) {
  return container.querySelector('.pm-mask');
}
function realSpan(container: HTMLElement) {
  return container.querySelector('.pm-real');
}

describe('PrivateAmount — المصدر المشترك', () => {
  it('مقفل افتراضيًا: القناع ظاهر والقيمة الحقيقية مخفية', () => {
    const { container } = render(<PrivateAmount value={1250} />);
    expect(maskSpan(container)).toBeVisible();
    expect(realSpan(container)).not.toBeVisible();
    expect(maskSpan(container)).toHaveTextContent('🔒');
    expect(realSpan(container)).toHaveTextContent('1,250.000');
  });

  it('التبديل من المخزن يكشف القيمة فورًا بلا إعادة تركيب', () => {
    const { container } = render(<PrivateAmount value={1250} />);
    act(() => useUI.getState().togglePrivacy());
    expect(realSpan(container)).toBeVisible();
    expect(maskSpan(container)).not.toBeVisible();
  });
});

describe('MoneyText — يتبع نفس مخزن الخصوصية (لا نظام موازٍ)', () => {
  it('مقفل افتراضيًا: القناع ظاهر، الرقم الحقيقي غير مرئي', () => {
    const { container } = render(<MoneyText value={5890} />);
    expect(maskSpan(container)).toBeVisible();
    expect(realSpan(container)).not.toBeVisible();
    expect(realSpan(container)).toHaveTextContent('5,890.000');
  });

  it('إخفاء ← إظهار ← إخفاء: يبقى متّسقًا مع المخزن في كل مرّة', () => {
    const { container } = render(<MoneyText value={999} />);

    expect(maskSpan(container)).toBeVisible();

    act(() => useUI.getState().togglePrivacy());
    expect(realSpan(container)).toBeVisible();
    expect(maskSpan(container)).not.toBeVisible();

    act(() => useUI.getState().togglePrivacy());
    expect(maskSpan(container)).toBeVisible();
    expect(realSpan(container)).not.toBeVisible();

    act(() => useUI.getState().togglePrivacy());
    expect(realSpan(container)).toBeVisible();
    expect(maskSpan(container)).not.toBeVisible();
  });

  it('عنصر واحد مشترك بين عدّة مبالغ في نفس الشاشة — تبديل واحد يكشفها كلّها', () => {
    const { container } = render(
      <div>
        <MoneyText value={100} />
        <MoneyText value={200} />
        <MoneyCell value={300} />
      </div>,
    );
    expect(container.querySelectorAll('.pm-mask')).toHaveLength(3);
    container.querySelectorAll('.pm-mask').forEach((el) => expect(el).toBeVisible());

    act(() => useUI.getState().togglePrivacy());
    container.querySelectorAll('.pm-real').forEach((el) => expect(el).toBeVisible());
    container.querySelectorAll('.pm-mask').forEach((el) => expect(el).not.toBeVisible());
  });
});

describe('MoneyCell — خليّة الجدول (بلا رمز عملة)', () => {
  it('مقفل افتراضيًا: القناع ظاهر بلا رمز عملة داخله', () => {
    const { container } = render(<MoneyCell value={12455} />);
    expect(maskSpan(container)).toBeVisible();
    expect(realSpan(container)).toHaveTextContent('12,455.000');
    expect(realSpan(container)?.textContent).not.toMatch(/KWD|د\.ك/);
  });

  it('الصفر قيمة حقيقية — يُقنَّع مثل أي مبلغ آخر', () => {
    const { container } = render(<MoneyCell value={0} />);
    expect(realSpan(container)).toHaveTextContent('0.000');
    expect(maskSpan(container)).toBeVisible();
  });

  it('«—» غير المنطبق ليس رقمًا ماليًا — لا يُقنَّع أبدًا ويبقى ظاهرًا مباشرة', () => {
    const { container } = render(<MoneyCell value={null} />);
    expect(container).toHaveTextContent('—');
    expect(maskSpan(container)).toBeNull();
    expect(realSpan(container)).toBeNull();

    act(() => useUI.getState().togglePrivacy());
    expect(container).toHaveTextContent('—'); // لا يتغيّر مع التبديل
  });
});
