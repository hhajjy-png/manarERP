import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  computePeriod,
  defaultPeriod,
  type FinancialPeriod,
  type FinancialPeriodPreset,
} from '../lib/financialPeriod';

/**
 * الفترة المالية العامة — سياق React على مستوى التطبيق.
 *
 * ── لماذا `sessionStorage` تحديدًا، لا `localStorage` ولا لا-شيء ──────────────
 *
 * القاعدة الأصلية تبقى كما هي: **لا تُحفظ سنة تاريخية بين جلسات التطبيق**. فتح
 * التطبيق من جديد يجب أن يبدأ دائمًا من الافتراضي الآمن (السنة حتى اليوم)، وإلا
 * بقي المستخدم عالقًا في 2025 بعد أسابيع دون أن يدري.
 *
 * لكن السياق وحده كان يخسر الاختيار عند **إعادة تحميل النافذة** أيضًا — وهي ليست
 * جلسة جديدة: في وضع التطوير تُعيد Vite تحميل الصفحة عند أي تعديل ملف واجهة، وفي
 * الإنتاج قد يُعيد المستخدم التحميل يدويًا. فيعود صامتًا إلى السنة الحالية بينما
 * يظن أنه ما زال يراجع 2025 — وهو ما جعل سجلات 2025 تبدو «مفقودة».
 *
 * `sessionStorage` هي الحدّ الفاصل الصحيح تمامًا: تنجو من إعادة التحميل، وتُمحى
 * تلقائيًا عند إغلاق النافذة/التطبيق. `localStorage` كانت ستخالف القاعدة الأصلية.
 *
 * ما يُخزَّن هو **المُدخَل** (preset + السنة/النطاق) لا الفترة المحسوبة: الإعدادات
 * النسبية («السنة حتى اليوم»، «الشهر الحالي») يجب أن تُعاد حسابتها مقابل تاريخ اليوم
 * عند كل إقلاع، لا أن تُجمَّد على لحظة اختيارها.
 */

interface PeriodContextValue {
  period: FinancialPeriod;
  /** يضبط preset جاهزًا (سنة حالية/سابقة، شهر…، أو all). */
  setPreset: (preset: FinancialPeriodPreset) => void;
  /** يختار سنة محددة (preset='year'). */
  setYear: (year: number) => void;
  /** يضبط نطاقًا مخصصًا (preset='custom'). */
  setCustomRange: (fromDate: string, toDate: string) => void;
  /** يعيد إلى الافتراضي الآمن: السنة الحالية حتى اليوم. */
  resetToCurrentYear: () => void;
}

const FinancialPeriodContext = createContext<PeriodContextValue | null>(null);

/** مفتاح الجلسة. يُمحى تلقائيًا بإغلاق النافذة — لا يعيش بين تشغيلَين للتطبيق. */
export const PERIOD_SESSION_KEY = 'manar.financialPeriod';

/** المُدخَل المُخزَّن — لا الفترة المحسوبة (انظر الشرح أعلى الملف). */
interface StoredPeriodInput {
  preset: FinancialPeriodPreset;
  selectedYear?: number;
  fromDate?: string;
  toDate?: string;
}

const VALID_PRESETS: readonly FinancialPeriodPreset[] = [
  'current-year', 'previous-year', 'current-month', 'previous-month',
  'year-to-date', 'year', 'custom', 'all',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * يقرأ المُدخَل المخزَّن ويُعيد حسابه مقابل تاريخ اليوم.
 *
 * أي قيمة مشوَّهة (JSON تالف، preset مجهول، `custom` بلا نطاق، سنة خارج المدى)
 * تُعامَل كغياب فتعود إلى الافتراضي الآمن — لا تُرمى ولا تُطبَّق جزئيًا.
 */
function readStoredPeriod(): FinancialPeriod | null {
  try {
    const raw = sessionStorage.getItem(PERIOD_SESSION_KEY);
    if (!raw) return null;
    const input = JSON.parse(raw) as Partial<StoredPeriodInput> | null;
    if (!input || !input.preset || !VALID_PRESETS.includes(input.preset)) return null;
    if (input.preset === 'custom' && !(ISO_DATE.test(input.fromDate ?? '') && ISO_DATE.test(input.toDate ?? ''))) return null;
    if (input.preset === 'year') {
      const y = input.selectedYear;
      if (!Number.isInteger(y) || (y as number) < 2000 || (y as number) > 2100) return null;
    }
    return computePeriod({
      preset: input.preset,
      selectedYear: input.selectedYear,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  } catch {
    return null;
  }
}

function writeStoredPeriod(input: StoredPeriodInput): void {
  try { sessionStorage.setItem(PERIOD_SESSION_KEY, JSON.stringify(input)); } catch { /* حصة ممتلئة/محجوبة — الفترة تبقى في الذاكرة */ }
}

export function FinancialPeriodProvider({ children }: { children: ReactNode }) {
  // التهيئة مرة واحدة: مُدخَل هذه الجلسة إن وُجد، وإلا الافتراضي الآمن.
  const [period, setPeriod] = useState<FinancialPeriod>(() => readStoredPeriod() ?? defaultPeriod());

  /** المسار الوحيد لتغيير الفترة: يحسب ويُخزّن معًا فلا ينحرف المعروض عن المحفوظ. */
  const apply = useCallback((input: StoredPeriodInput) => {
    setPeriod(computePeriod(input));
    writeStoredPeriod(input);
  }, []);

  const setPreset = useCallback((preset: FinancialPeriodPreset) => {
    apply({ preset });
  }, [apply]);

  const setYear = useCallback((year: number) => {
    apply({ preset: 'year', selectedYear: year });
  }, [apply]);

  const setCustomRange = useCallback((fromDate: string, toDate: string) => {
    apply({ preset: 'custom', fromDate, toDate });
  }, [apply]);

  // مطابق حرفيًا لـ`defaultPeriod()` (السنة حتى اليوم) — نفس الدلالة السابقة.
  const resetToCurrentYear = useCallback(() => {
    apply({ preset: 'year-to-date' });
  }, [apply]);

  const value = useMemo<PeriodContextValue>(
    () => ({ period, setPreset, setYear, setCustomRange, resetToCurrentYear }),
    [period, setPreset, setYear, setCustomRange, resetToCurrentYear],
  );

  return <FinancialPeriodContext.Provider value={value}>{children}</FinancialPeriodContext.Provider>;
}

/** يقرأ الفترة العامة. يرمي خارج المزوّد لكشف الاستخدام الخاطئ مبكرًا. */
export function useFinancialPeriod(): PeriodContextValue {
  const ctx = useContext(FinancialPeriodContext);
  if (!ctx) throw new Error('useFinancialPeriod يجب أن يُستخدم داخل FinancialPeriodProvider');
  return ctx;
}
