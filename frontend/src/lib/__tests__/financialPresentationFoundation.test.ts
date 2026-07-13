/**
 * Financial Number & Date Presentation Standardization — Phase B (Shared Foundation).
 *
 * العقد الذي تحرسه هذه الاختبارات:
 *   1. **أرقام غربية دائمًا** — في اللغتين. الإعداد يختار الرمز (KWD / د.ك) لا شكل الرقم.
 *   2. ثلاث منازل ثابتة، وفاصلة آلاف، ونقطة عشرية — مهما كانت القيمة.
 *   3. السالب: `-1,250.000` (الإشارة قبل الرقم، لا أقواس ولا إشارة لاحقة).
 *   4. **الصفر قيمة، لا فراغ**: `0` ⇒ `0.000`. و`—` للقيمة غير المنطبقة وحدها.
 *   5. التاريخ `DD/MM/YYYY` بلا انزياح منطقة زمنية، والنطاق «من … إلى …».
 */
import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatMoneyCell,
  formatMoneyParts,
  formatNumber,
  MONEY_CELL_EMPTY,
} from '../format';
import { formatDate, formatDateTime, formatDateRange, formatDisplayDate, formatMonthLabel, formatMonthYear } from '../date';

const WESTERN_ONLY = /^[-\d,.\s]+$/; // لا رقم عربي شرقي واحد

describe('المال — الشكل الرسمي', () => {
  it.each([
    [0, '0.000'],
    [1, '1.000'],
    [12.5, '12.500'],
    [999.999, '999.999'],
    [1000, '1,000.000'],
    [12455, '12,455.000'],
    [-1250, '-1,250.000'],
    [1000000.125, '1,000,000.125'],
  ])('%p ⇒ %s', (input, expected) => {
    expect(formatNumber(input)).toBe(expected);
    expect(formatMoneyCell(input)).toBe(expected);
  });

  it('بطاقة الملخص: الرقم أولًا ثم الرمز — لا العكس', () => {
    expect(formatCurrency(12455)).toBe('12,455.000 KWD');
    expect(formatCurrency(12455)).not.toBe('KWD 12,455.000');
    expect(formatCurrency(-1250)).toBe('-1,250.000 KWD');
  });
});

describe('أرقام غربية دائمًا — القرار المعتمد', () => {
  it('العربية تغيّر **الرمز** لا شكل الرقم', () => {
    expect(formatCurrency(12455, { language: 'arabic' })).toBe('12,455.000 د.ك');
    expect(formatCurrency(12455, { language: 'english' })).toBe('12,455.000 KWD');
  });

  it('لا يظهر رقم عربي شرقي في أي لغة (الميزة السابقة أُلغيت عمدًا)', () => {
    for (const lang of ['arabic', 'english'] as const) {
      const { number } = formatMoneyParts(1234567.891, { language: lang });
      expect(number).toBe('1,234,567.891');
      expect(number).toMatch(WESTERN_ONLY);
      expect(number).not.toMatch(/[٠-٩٬٫]/);
    }
  });

  it('جزءا المبلغ يُركّبان معًا فيعطيان الصيغة الكاملة نفسها', () => {
    const { number, currency } = formatMoneyParts(12455, { language: 'arabic' });
    expect(`${number} ${currency}`).toBe(formatCurrency(12455, { language: 'arabic' }));
  });
});

describe('خلية الجدول — بلا رمز عملة', () => {
  it('لا تحمل KWD ولا د.ك إطلاقًا (الرمز في العنوان مرّة واحدة)', () => {
    expect(formatMoneyCell(12455)).toBe('12,455.000');
    expect(formatMoneyCell(12455)).not.toContain('KWD');
    expect(formatMoneyCell(12455)).not.toContain('د.ك');
  });

  it('**الصفر الحقيقي قيمة**: 0 ⇒ 0.000 — ولا يتحوّل إلى شرطة', () => {
    expect(formatMoneyCell(0)).toBe('0.000');
    expect(formatMoneyCell(-0)).toBe('0.000');
    expect(formatMoneyCell(0)).not.toBe(MONEY_CELL_EMPTY);
  });

  it('غير المنطبق وحده يعطي —', () => {
    expect(formatMoneyCell(null)).toBe('—');
    expect(formatMoneyCell(undefined)).toBe('—');
    expect(formatMoneyCell('')).toBe('—');
  });

  it('القيمة الفاسدة لا تُعرض NaN ولا undefined', () => {
    for (const bad of [NaN, Infinity, 'abc', {}]) {
      const out = formatMoneyCell(bad);
      expect(out).toBe('—');
      expect(out).not.toMatch(/NaN|undefined|null|Infinity/);
    }
  });

  it('النصّ الرقمي يُنسَّق كرقم (لا يُعرض خامًا)', () => {
    expect(formatMoneyCell('12455')).toBe('12,455.000');
  });
});

describe('التاريخ', () => {
  it('تاريخ فقط ⇒ DD/MM/YYYY بلا انزياح منطقة زمنية', () => {
    expect(formatDisplayDate('2026-01-31')).toBe('31/01/2026');
    expect(formatDisplayDate('2026-02-28')).toBe('28/02/2026');
    expect(formatDisplayDate('2026-12-01')).toBe('01/12/2026');
    expect(formatDate('2026-01-31')).toBe('31/01/2026');
  });

  it('لا صيغة ISO ولا أمريكية للمستخدم', () => {
    const out = formatDisplayDate('2026-01-31');
    expect(out).not.toContain('-');
    expect(out).not.toBe('01/31/2026');
  });

  it('تاريخ ووقت: ٢٤ ساعة، بلا AM/PM وبلا حرف T', () => {
    const out = formatDateTime(new Date(2026, 0, 31, 14, 35));
    expect(out).toBe('31/01/2026 14:35');
    expect(out).not.toMatch(/AM|PM|[TZ]/);
  });

  it('النطاق: من … إلى … (وEnglish)', () => {
    expect(formatDateRange('2026-01-01', '2026-01-31')).toBe('من 01/01/2026 إلى 31/01/2026');
    expect(formatDateRange('2026-01-01', '2026-01-31', 'en')).toBe('From 01/01/2026 to 31/01/2026');
  });

  it('حدّ ناقص في النطاق يظهر — لا يُحذف (فلا تُقرأ الفترة مغلقة وهي مفتوحة)', () => {
    expect(formatDateRange('2026-01-01', null)).toBe('من 01/01/2026 إلى —');
  });

  it('الشهر والسنة: «يناير 2026» بأرقام غربية', () => {
    expect(formatMonthYear(1, 2026)).toBe('يناير 2026');
    expect(formatMonthLabel('2026-01')).toBe('يناير 2026');
    expect(formatMonthLabel('2026-01')).not.toMatch(/[٠-٩]/);
    expect(formatMonthLabel('2026-01')).not.toBe('Jan-26');
  });
});
