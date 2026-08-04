import type { ReactNode } from 'react';
import { MetricCard, Icon, type Tone } from '../explorer/ExplorerKit';
import PrivateAmount from '../PrivateAmount';

/* ════════════════════════════════════════════════════════════════════════════
   قسم تحليلي — الغلاف الموحّد لكل قسم من الأقسام السبعة.

   كل قسم = رقم + عنوان + شريط بطاقات KPI + جدول واحد. البطاقات تُمرَّر مبنيّةً
   من **صفوف الجدول نفسه**، فلا يمكن أن تعرض بطاقة رقمًا لا يظهر تحتها.
   ════════════════════════════════════════════════════════════════════════════ */

export interface SectionKpi {
  key: string;
  icon: string;
  label: string;
  /** قيمة نقدية — تُعرض عبر `PrivateAmount` احترامًا لوضع الخصوصية. */
  money?: number;
  /** قيمة نصية جاهزة (عدد، نسبة، اسم شهر…) — تُستخدم حين لا تكون مبلغًا. */
  text?: string;
  sub?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  trend?: { dir: 'up' | 'down'; text: string; invert?: boolean };
}

interface AnalysisSectionProps {
  /** رقم القسم كما يظهر في العنوان (1…7). */
  index: number;
  icon: string;
  title: string;
  kpis?: SectionKpi[];
  actions?: ReactNode;
  children: ReactNode;
}

export default function AnalysisSection({ index, icon, title, kpis, actions, children }: AnalysisSectionProps) {
  return (
    /* `data-print-section` يجعل القسم وحدة طباعة **معلَنة** لا مجرّد صندوق تخطيط:
       قواعد فواصل الصفحات تستهدفه صراحةً، فلا يُقصّ قسم عبر حافّة ورقة. */
    <section className="fac-section" data-print-section={index} aria-label={title}>
      <header className="fac-section-head">
        <span className="fac-section-index" aria-hidden="true">{index}</span>
        <h2 className="fac-section-title">
          <Icon name={icon} />
          {title}
        </h2>
        {actions && <div className="fac-section-actions">{actions}</div>}
      </header>

      {kpis && kpis.length > 0 && (
        <div className="fac-kpis">
          {kpis.map((k) => (
            <MetricCard
              key={k.key}
              icon={k.icon}
              label={k.label}
              tone={k.tone ?? 'indigo'}
              value={k.money != null ? <PrivateAmount value={k.money} level={1} /> : k.text ?? '—'}
              sub={k.sub}
              trend={k.trend}
              onClick={k.onClick}
              ariaLabel={k.label}
            />
          ))}
        </div>
      )}

      <div className="fac-section-body">{children}</div>
    </section>
  );
}
