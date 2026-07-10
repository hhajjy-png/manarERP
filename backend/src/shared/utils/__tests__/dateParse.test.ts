import { describe, it, expect } from 'vitest';
import { parseImportDate } from '../dateParse';

/** يقارن مكوّنات التاريخ المحلية — لا `toISOString` (تُزيح اليوم بتوقيت +03:00). */
function expectLocalDate(actual: Date | null, year: number, month: number, day: number) {
  expect(actual).toBeInstanceOf(Date);
  expect([actual!.getFullYear(), actual!.getMonth() + 1, actual!.getDate()]).toEqual([year, month, day]);
  // منتصف الليل محليًا
  expect([actual!.getHours(), actual!.getMinutes()]).toEqual([0, 0]);
}

describe('parseImportDate — DD/MM/YYYY (عرف الكويت)', () => {
  it('13/05/2024 → 13 May 2024', () => {
    expectLocalDate(parseImportDate('13/05/2024'), 2024, 5, 13);
  });

  it('05/03/2024 → 5 March 2024, NOT 3 May (الالتباس يُحسم DD/MM)', () => {
    const d = parseImportDate('05/03/2024');
    expectLocalDate(d, 2024, 3, 5);
    expect(d!.getMonth() + 1).not.toBe(5);
  });

  it('يقبل الشرطة والنقطة كفاصل', () => {
    expectLocalDate(parseImportDate('13-05-2024'), 2024, 5, 13);
    expectLocalDate(parseImportDate('13.05.2024'), 2024, 5, 13);
  });

  it('يقبل يومًا/شهرًا بخانة واحدة', () => {
    expectLocalDate(parseImportDate('5/3/2024'), 2024, 3, 5);
  });

  it('31/12/2024 — الحد الأعلى لليوم', () => {
    expectLocalDate(parseImportDate('31/12/2024'), 2024, 12, 31);
  });
});

describe('parseImportDate — ISO', () => {
  it('2024-03-05 → 5 March 2024', () => {
    expectLocalDate(parseImportDate('2024-03-05'), 2024, 3, 5);
  });

  it('يقبل ISO كامل ويأخذ جزء التاريخ فقط', () => {
    expectLocalDate(parseImportDate('2024-03-05T14:30:00.000Z'), 2024, 3, 5);
  });
});

describe('parseImportDate — Excel serial', () => {
  // مرساة موثّقة: اليوم 45292 = 01/01/2024 في نظام تأريخ 1900.
  it('61 → 1 March 1900 (أول رقم بعد خلل 1900)', () => {
    expectLocalDate(parseImportDate(61), 1900, 3, 1);
  });

  it('يرفض الأرقام داخل نطاق خلل 1900 بدل إرجاع تاريخ منزاح بيوم', () => {
    expect(parseImportDate(1)).toBeNull();
    expect(parseImportDate(59)).toBeNull();
    expect(parseImportDate(60)).toBeNull(); // 29/02/1900 — يوم لا وجود له
  });

  it('45292 → 1 January 2024', () => {
    expectLocalDate(parseImportDate(45292), 2024, 1, 1);
  });

  it('45657 → 31 December 2024', () => {
    expectLocalDate(parseImportDate(45657), 2024, 12, 31);
  });

  it('45291 → 31 December 2023', () => {
    expectLocalDate(parseImportDate(45291), 2023, 12, 31);
  });

  it('يقبل الرقم التسلسلي حين يصل كنص', () => {
    expectLocalDate(parseImportDate('45657'), 2024, 12, 31);
  });

  it('يتجاهل الجزء الكسري (الوقت داخل اليوم)', () => {
    expectLocalDate(parseImportDate(45657.75), 2024, 12, 31);
  });

  it('يرفض الأرقام التسلسلية خارج المدى', () => {
    expect(parseImportDate(0)).toBeNull();
    expect(parseImportDate(-5)).toBeNull();
    expect(parseImportDate(99_999_999)).toBeNull();
  });

  it('يرفض رقمًا شاردًا في عمود تاريخ بدل تحويله إلى 1900', () => {
    expect(parseImportDate(5)).toBeNull();
  });
});

describe('parseImportDate — كائن Date', () => {
  it('يمرّر تاريخًا صالحًا مع تطبيع الوقت إلى منتصف الليل', () => {
    expectLocalDate(parseImportDate(new Date(2024, 4, 13, 17, 45)), 2024, 5, 13);
  });

  it('يرفض Invalid Date', () => {
    expect(parseImportDate(new Date('nonsense'))).toBeNull();
  });
});

describe('parseImportDate — أسماء الشهور', () => {
  it('29 May 2026', () => {
    expectLocalDate(parseImportDate('29 May 2026'), 2026, 5, 29);
  });

  it('1 September 2024', () => {
    expectLocalDate(parseImportDate('1 September 2024'), 2024, 9, 1);
  });

  it('يرفض اسم شهر غير معروف', () => {
    expect(parseImportDate('29 Mayy 2026')).toBeNull();
  });
});

describe('parseImportDate — تواريخ غير صالحة', () => {
  it('يرفض يومًا لا وجود له في التقويم بدل أن يتدحرج للشهر التالي', () => {
    expect(parseImportDate('31/02/2024')).toBeNull(); // new Date(2024,1,31) → 2 Mar
    expect(parseImportDate('31/04/2024')).toBeNull(); // أبريل 30 يومًا
    expect(parseImportDate('2024-02-30')).toBeNull();
  });

  it('يقبل 29 فبراير في سنة كبيسة ويرفضها في غيرها', () => {
    expectLocalDate(parseImportDate('29/02/2024'), 2024, 2, 29);
    expect(parseImportDate('29/02/2025')).toBeNull();
  });

  it('يرفض الشهر خارج 1..12', () => {
    expect(parseImportDate('05/13/2024')).toBeNull(); // MM/DD أمريكية — لا تُخمَّن
  });

  it('يرفض نصًا حرًّا', () => {
    expect(parseImportDate('غير محدد')).toBeNull();
    expect(parseImportDate('N/A')).toBeNull();
    expect(parseImportDate('13/05/24')).toBeNull(); // سنة بخانتين — ملتبسة
  });
});

describe('parseImportDate — قيم ناقصة', () => {
  it('يعيد null للقيم الفارغة', () => {
    expect(parseImportDate(null)).toBeNull();
    expect(parseImportDate(undefined)).toBeNull();
    expect(parseImportDate('')).toBeNull();
    expect(parseImportDate('   ')).toBeNull();
  });
});

describe('parseImportDate — انحدار: السلوك القديم كان يخزّن تاريخًا خاطئًا بصمت', () => {
  it('new Date("05/03/2024") كانت تعطي مايو؛ المحلّل الجديد يعطي مارس', () => {
    expect(new Date('05/03/2024').getMonth() + 1).toBe(5); // السلوك المعطوب، للتوثيق
    expect(parseImportDate('05/03/2024')!.getMonth() + 1).toBe(3);
  });

  it('new Date("13/05/2024") كانت Invalid Date؛ المحلّل الجديد يقرأها', () => {
    expect(Number.isNaN(new Date('13/05/2024').getTime())).toBe(true);
    expectLocalDate(parseImportDate('13/05/2024'), 2024, 5, 13);
  });
});
