import { useFinancialPeriod } from '../../context/FinancialPeriodContext';
import './current-status-badge.css';

/**
 * وسم «حالة حالية» يظهر فقط حين تكون الفترة المختارة سنة سابقة أو «كل الفترات».
 *
 * يوضع على البطاقات المصنّفة Current Status (لا تتبع الفترة العالمية): مقارنات
 * هذا/الشهر الماضي، العقود النشطة، تنبيهات/توقّعات Executive، نشاط اليوم. الغرض
 * منع التضليل البصري فقط — لا يغيّر أي منطق. لا يظهر في السنة الحالية (لا حاجة).
 */
export default function CurrentStatusBadge({ label = 'حالة حالية' }: { label?: string }) {
  const { period } = useFinancialPeriod();
  if (!period.isHistorical && !period.isAllPeriods) return null;
  return (
    <span className="current-status-badge" title="هذا المؤشر لا يتبع الفترة المختارة — يعرض الحالة الحالية دائمًا">
      <span className="material-symbols-outlined" aria-hidden>schedule</span>
      {label}
    </span>
  );
}
