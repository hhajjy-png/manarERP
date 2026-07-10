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
 * لماذا سياق لا مخزن مُبقى (persisted)؟
 * القاعدة صريحة: لا تُحفظ سنة تاريخية بين جلسات التطبيق. الاختيار يعيش أثناء الجلسة
 * وينتقل بين الصفحات (حالة في الجذر تنجو من التنقّل)، لكن إعادة التشغيل تعيد التهيئة
 * إلى الافتراضي (السنة حتى اليوم). لا قراءة ولا كتابة إلى localStorage إطلاقًا.
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

export function FinancialPeriodProvider({ children }: { children: ReactNode }) {
  // التهيئة مرة واحدة عند التركيب — تعتمد على `new Date()` وقت الإقلاع فقط.
  const [period, setPeriod] = useState<FinancialPeriod>(() => defaultPeriod());

  const setPreset = useCallback((preset: FinancialPeriodPreset) => {
    setPeriod(computePeriod({ preset }));
  }, []);

  const setYear = useCallback((year: number) => {
    setPeriod(computePeriod({ preset: 'year', selectedYear: year }));
  }, []);

  const setCustomRange = useCallback((fromDate: string, toDate: string) => {
    setPeriod(computePeriod({ preset: 'custom', fromDate, toDate }));
  }, []);

  const resetToCurrentYear = useCallback(() => {
    setPeriod(defaultPeriod());
  }, []);

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
