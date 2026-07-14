// @vitest-environment jsdom
/**
 * Phase D — الجداول المالية والرسوم.
 *
 * العقد:
 *   1. الرمز **مرّة واحدة في عنوان العمود** («مدين (KWD)»)، والخليّة رقم مجرّد.
 *   2. الخليّة معزولة الاتجاه فلا ينقلب ترتيبها في واجهة عربية.
 *   3. **مسار الطباعة لم يتغيّر بحرف**: `formatReportCell` الافتراضي ما زال يُدرج الرمز
 *      في الخليّة — وهو عقد `ReportPrint.tsx` الخارج عن نطاق هذه الحزمة.
 *   4. الصفر قيمة في الجداول أيضًا، وغير المنطبق «—».
 *   5. الرمز يتبع إعداد الشركة في الجداول والتلميحات معًا.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

import { formatReportCell, formatMoneyCell } from '../lib/format';
import { fcMoneyCell, fcMoneyHeader, fcCurrencySymbol } from '../components/financial/financialLabels';
import { MoneyText } from '../config/modules';

let currencyLanguage: 'english' | 'arabic' = 'english';
vi.mock('../stores/settingsStore', () => ({
  currentCurrencyLanguage: () => currencyLanguage,
  useSettings: (sel: (s: Record<string, unknown>) => unknown) => sel({ currencyLanguage }),
}));
vi.mock('../stores/uiStore', () => ({ useUI: () => false }));

beforeEach(() => { currencyLanguage = 'english'; });
afterEach(cleanup);

describe('عنوان العمود يحمل الرمز — مرّة واحدة', () => {
  it('«مدين» ⇒ «مدين (KWD)»', () => {
    expect(fcMoneyHeader('مدين')).toBe('مدين (KWD)');
    expect(fcMoneyHeader('الرصيد')).toBe('الرصيد (KWD)');
  });

  it('يتبع إعداد العملة', () => {
    currencyLanguage = 'arabic';
    expect(fcMoneyHeader('مدين')).toBe('مدين (د.ك)');
    expect(fcCurrencySymbol()).toBe('د.ك');
  });
});

describe('خليّة الجدول — رقم مجرّد', () => {
  it('لا رمز داخل الخليّة إطلاقًا', () => {
    expect(fcMoneyCell(12455)).toBe('12,455.000');
    expect(fcMoneyCell(12455)).not.toContain('KWD');
    currencyLanguage = 'arabic';
    expect(fcMoneyCell(12455)).not.toContain('د.ك');
  });

  it('الصفر قيمة، وغير المنطبق «—»', () => {
    expect(fcMoneyCell(0)).toBe('0.000');
    expect(fcMoneyCell(null)).toBe('—');
    expect(fcMoneyCell(undefined)).toBe('—');
  });

  it('السالب إشارته قبل الرقم، وثلاث منازل دائمًا', () => {
    expect(fcMoneyCell(-1250)).toBe('-1,250.000');
    expect(fcMoneyCell(1000000.125)).toBe('1,000,000.125');
  });

  it('لا NaN ولا Infinity في خليّة', () => {
    expect(fcMoneyCell(NaN)).toBe('—');
    expect(fcMoneyCell(Infinity)).toBe('—');
  });
});

describe('formatReportCell — بوّابة واحدة، وضعان', () => {
  it('الافتراضي (الطباعة): الرمز داخل الخليّة — **العقد لم يتغيّر**', () => {
    expect(formatReportCell(1500.5, { format: 'currency' })).toBe('1,500.500 KWD');
    expect(formatReportCell(1500.5, { format: 'currency' }, { language: 'arabic' })).toBe('1,500.500 د.ك');
  });

  it('وضع الشاشة (`symbol: header`): رقم مجرّد لأن العنوان يحمل الرمز', () => {
    expect(formatReportCell(1500.5, { format: 'currency' }, { symbol: 'header' })).toBe('1,500.500');
    expect(formatReportCell(1500.5, { format: 'currency' }, { language: 'arabic', symbol: 'header' }))
      .not.toContain('د.ك');
  });

  it('الأعمدة غير المالية لا تتأثر بالوضعين', () => {
    expect(formatReportCell(1500.5, {})).toBe('1,500.5');
    expect(formatReportCell(1500.5, {}, { symbol: 'header' })).toBe('1,500.5');
    expect(formatReportCell('نص', {}, { symbol: 'header' })).toBe('نص');
  });

  it('الخليّة الفارغة تبقى فارغة في الوضعين (سلوك قائم)', () => {
    expect(formatReportCell(null, { format: 'currency' })).toBe('');
    expect(formatReportCell(null, { format: 'currency' }, { symbol: 'header' })).toBe('');
  });
});

describe('التلميحات والقيم داخل الجداول — عزل الاتجاه', () => {
  it('MoneyText داخل خليّة يحمل صنف العزل', () => {
    const { container } = render(
      <table><tbody><tr><td><MoneyText value={255} /></td></tr></tbody></table>,
    );
    const cell = container.querySelector('.money-cell');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveTextContent('255.000 KWD');
  });

  it('التلميح يتبع إعداد الرمز (كان يطبع KWD دائمًا)', () => {
    currencyLanguage = 'arabic';
    const { container } = render(<MoneyText value={5890} />);
    expect(container.querySelector('.money-cell')).toHaveTextContent('5,890.000 د.ك');
  });
});

describe('اتساق المُنسّق المشترك', () => {
  it('fcMoneyCell ما هو إلا formatMoneyCell — لا منطق مكرَّر', () => {
    for (const v of [0, 1, 12.5, 999.999, 1000, 12455, -1250, 1000000.125, null, NaN]) {
      expect(fcMoneyCell(v)).toBe(formatMoneyCell(v));
    }
  });
});
