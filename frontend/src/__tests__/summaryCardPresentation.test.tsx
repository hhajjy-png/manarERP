// @vitest-environment jsdom
/**
 * Phase C — بطاقات الملخص والمقاييس المالية على الشاشة.
 *
 * العقد:
 *   1. الرقم أوّلًا ثم الرمز في **سطر واحد**: `12,455.000 KWD`.
 *   2. الرمز يتبع **إعداد لغة العملة** (KWD / د.ك) — والأرقام **غربية دائمًا**.
 *   3. الصفر قيمة (`0.000 KWD`) لا فراغ، والسالب إشارته **قبل** الرقم.
 *   4. البطاقات **غير المالية** (أعداد، نِسَب) لا تتأثر إطلاقًا.
 *   5. `PrivateAmount` يبقى متوافقًا للخلف: نصّ مُنسَّق مسبقًا يُعرض كما هو.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

import PrivateAmount from '../components/PrivateAmount';
import { KpiStat } from '../components/KpiStat';
import { money, moneyParts, MoneyText, TextWithMoney } from '../config/modules';

// وضع الخصوصية مطفأ كي تُقرأ القيمة الحقيقية لا الأقنعة.
vi.mock('../stores/uiStore', () => ({ useUI: () => false }));

let currencyLanguage: 'english' | 'arabic' = 'english';
vi.mock('../stores/settingsStore', () => ({
  currentCurrencyLanguage: () => currencyLanguage,
  useSettings: (sel: (s: Record<string, unknown>) => unknown) => sel({ currencyLanguage }),
}));

beforeEach(() => { currencyLanguage = 'english'; });
afterEach(cleanup);

describe('بطاقة الملخص — الشكل الرسمي', () => {
  it('12455 ⇒ «12,455.000 KWD» — الرقم قبل الرمز، لا العكس', () => {
    render(<PrivateAmount value={12455} />);
    const el = screen.getByText('12,455.000 KWD');
    expect(el).toBeInTheDocument();
    expect(el.textContent).not.toBe('KWD 12,455.000');
  });

  it('الصفر قيمة: «0.000 KWD» — لا يختفي ولا يصير شرطة', () => {
    render(<PrivateAmount value={0} />);
    expect(screen.getByText('0.000 KWD')).toBeInTheDocument();
  });

  it('السالب: الإشارة قبل الرقم، بلا أقواس محاسبية', () => {
    render(<PrivateAmount value={-1250} />);
    const el = screen.getByText('-1,250.000 KWD');
    expect(el).toBeInTheDocument();
    expect(el.textContent).not.toContain('(');
    expect(el.textContent).not.toMatch(/1,250\.000-/);
  });

  it('مبلغ ضخم يبقى كاملًا: لا اختصار ولا قصّ ولا حذف منازل', () => {
    render(<PrivateAmount value={1250000000.125} />);
    const el = screen.getByText('1,250,000,000.125 KWD');
    const number = el.textContent!.replace(' KWD', '');
    expect(number).toBe('1,250,000,000.125');          // بلا اختصار (1.25B) وبلا قصّ
    expect(number).not.toMatch(/[BMK…]|\.\.\./);
  });

  it('القيمة والرمز في حاوية لا تسمح بالالتفاف (money-cell)', () => {
    const { container } = render(<PrivateAmount value={12455} />);
    expect(container.querySelector('.money-cell')).toBeInTheDocument();
  });
});

describe('إعداد لغة العملة — يغيّر الرمز وحده', () => {
  it('عربي ⇒ «12,455.000 د.ك» بأرقام **غربية**', () => {
    currencyLanguage = 'arabic';
    render(<PrivateAmount value={12455} />);
    const el = screen.getByText('12,455.000 د.ك');
    expect(el).toBeInTheDocument();
    expect(el.textContent).not.toMatch(/[٠-٩]/); // لا رقم عربي شرقي
  });

  it('الأرقام نفسها في اللغتين — الفرق في الرمز فقط', () => {
    currencyLanguage = 'english';
    expect(money(12455)).toBe('12,455.000 KWD');
    currencyLanguage = 'arabic';
    expect(money(12455)).toBe('12,455.000 د.ك');
    expect(moneyParts(12455).number).toBe('12,455.000');
  });
});

describe('KpiStat — الرقم والوحدة inline', () => {
  it('يعرض «12,455.000» و«KWD» في نفس البطاقة بلا التفاف', () => {
    const parts = moneyParts(12455);
    const { container } = render(
      <KpiStat icon="payments" tone="green" label="الإجمالي" value={parts.number} unit={parts.currency} />,
    );
    const value = container.querySelector('.kpistat-value');
    expect(value?.textContent).toBe('12,455.000KWD'); // عنصران متجاوران، سطر واحد
    expect(value?.textContent).not.toContain('KWD 12,455');
  });
});

describe('غير المالي لا يتأثر', () => {
  it('عدد الموظفين والنِّسَب تبقى كما هي — بلا رمز عملة ولا ثلاث منازل', () => {
    render(
      <>
        <KpiStat icon="group" tone="blue" label="الموظفون" value="125" />
        <KpiStat icon="percent" tone="indigo" label="الإنجاز" value="92%" />
      </>,
    );
    const emp = screen.getByText('125');
    expect(emp.textContent).not.toContain('KWD');
    expect(emp.textContent).not.toBe('125.000');
    expect(screen.getByText('92%')).toBeInTheDocument();
  });
});

describe('PrivateAmount — التوافق للخلف', () => {
  it('نصّ مُنسَّق مسبقًا يُعرض كما هو (لا رمز مكرَّر)', () => {
    render(<PrivateAmount value="12,455.000 KWD" />);
    expect(screen.getByText('12,455.000 KWD')).toBeInTheDocument();
  });

  it('خاصية `currency` الصريحة ما زالت تتقدّم على الإعداد', () => {
    currencyLanguage = 'arabic';
    render(<PrivateAmount value={1} currency="KWD" />);
    expect(screen.getByText('1.000 KWD')).toBeInTheDocument();
  });
});


describe('العزل ثنائي الاتجاه — السبب الحقيقي لظهور «KWD 255.000»', () => {
  it('MoneyText يلفّ المبلغ بصنف العزل فيبقى الرقم أوّلًا داخل واجهة عربية', () => {
    const { container } = render(<MoneyText value={255} />);
    const el = container.querySelector('.money-cell');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('255.000 KWD');
  });

  it('MoneyText يتبع إعداد الرمز', () => {
    currencyLanguage = 'arabic';
    const { container } = render(<MoneyText value={150} />);
    expect(container.querySelector('.money-cell')).toHaveTextContent('150.000 د.ك');
  });

  it('الصفر والسالب داخل MoneyText', () => {
    const { container: z } = render(<MoneyText value={0} />);
    expect(z.querySelector('.money-cell')).toHaveTextContent('0.000 KWD');
    const { container: n } = render(<MoneyText value={-37886.9} />);
    expect(n.querySelector('.money-cell')).toHaveTextContent('-37,886.900 KWD');
  });

  it('TextWithMoney يعزل المبلغ **داخل جملة عربية** ولا يفقد حرفًا من النصّ', () => {
    const { container } = render(
      <TextWithMoney text="مديونيات متأخرة أكثر من 90 يوم: 87,940.000 KWD منذ فترة" />,
    );
    const isolated = container.querySelectorAll('.money-cell');
    expect(isolated).toHaveLength(1);
    expect(isolated[0]).toHaveTextContent('87,940.000 KWD');
    expect(container.textContent).toBe('مديونيات متأخرة أكثر من 90 يوم: 87,940.000 KWD منذ فترة');
  });

  it('جملة بلا مبلغ: لا عزل ولا نصّ ضائع', () => {
    const { container } = render(<TextWithMoney text="لا توجد تنبيهات حالية" />);
    expect(container.querySelectorAll('.money-cell')).toHaveLength(0);
    expect(container.textContent).toBe('لا توجد تنبيهات حالية');
  });

  it('يعزل **كل** مبلغ في الجملة — النمط ليس ذا حالة', () => {
    const { container } = render(<TextWithMoney text="المسدد 100.000 KWD والمتبقي 250.500 KWD" />);
    expect(container.querySelectorAll('.money-cell')).toHaveLength(2);
  });
});


describe('TextWithMoney — تصليب وقت التشغيل (انحدار حقيقي وقع)', () => {
  // توصيات لوحة المعلومات لا تحمل `message` إطلاقًا؛ الحقل الغائب على `.split()` أسقط
  // اللوحة كلها إلى RootErrorBoundary.
  it('undefined لا يُسقط الشاشة — ولا يخترع نصًّا', () => {
    const { container } = render(<TextWithMoney text={undefined} />);
    expect(container.textContent).toBe('');
  });

  it('null والنصّ الفارغ كذلك', () => {
    expect(render(<TextWithMoney text={null} />).container.textContent).toBe('');
    cleanup();
    expect(render(<TextWithMoney text="" />).container.textContent).toBe('');
  });

  it('لا يحوّل الغياب إلى «—» ولا إلى «undefined»', () => {
    const { container } = render(<TextWithMoney text={undefined} />);
    expect(container.textContent).not.toContain('undefined');
    expect(container.textContent).not.toContain('—');
  });

  it('النصّ الصحيح ما زال يعمل بعد التصليب', () => {
    const { container } = render(<TextWithMoney text="المتبقي 250.500 KWD" />);
    expect(container.querySelectorAll('.money-cell')).toHaveLength(1);
  });
});
