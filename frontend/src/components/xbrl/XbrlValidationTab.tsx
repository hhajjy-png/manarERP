/**
 * تبويب «التحقق» — نتائج محرّك الجاهزية مجمَّعة بالشدّة.
 *
 * كل نتيجة تحمل كودها الثابت ظاهرًا للمستخدم عمدًا: هو ما يُستشهد به في المراجعة وفي
 * اللقطات القديمة، فإخفاؤه يجعل الرسالة العربية وحدها هي المرجع — وهي قابلة للتحسين
 * اللغوي بينما الكود ليس كذلك.
 *
 * تنويه دائم أسفل الشاشة: نجاح كل الفحوص **لا يعني** قبولًا من أي جهة رسمية.
 */
import { EmptyState, SectionCard, StatusChip } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import { SEVERITY_TONE, type XbrlSeverity, type XbrlValidationResult } from './xbrlTypes';

const ORDER: XbrlSeverity[] = ['ERROR', 'WARNING', 'INFO'];

export default function XbrlValidationTab({ validation }: { validation: XbrlValidationResult }) {
  const { t } = useT();

  if (validation.findings.length === 0) {
    return (
      <div className="xbrl-tab">
        <EmptyState icon="task_alt" title={t('xbrl.validation.clean_title')} message={t('xbrl.validation.clean_body')} />
      </div>
    );
  }

  return (
    <div className="xbrl-tab">
      {ORDER.map((severity) => {
        const items = validation.findings.filter((f) => f.severity === severity);
        if (items.length === 0) return null;
        return (
          <SectionCard
            key={severity}
            title={`${t(`xbrl.severity.${severity}`)} (${items.length})`}
            icon={severity === 'ERROR' ? 'error' : severity === 'WARNING' ? 'warning' : 'info'}
          >
            <ul className="xbrl-findings">
              {items.map((finding, index) => (
                <li key={`${finding.code}-${index}`} className={`xbrl-finding xbrl-finding--${severity.toLowerCase()}`}>
                  <div className="xbrl-finding-head">
                    <span className="xbrl-finding-code ltr mono">{finding.code}</span>
                    <StatusChip tone={SEVERITY_TONE[finding.severity]}>{t(`xbrl.severity.${finding.severity}`)}</StatusChip>
                    <StatusChip tone="neutral">{t(`xbrl.category.${finding.category}`)}</StatusChip>
                  </div>
                  <p className="xbrl-finding-msg">{finding.messageAr}</p>
                  {finding.entityIds && finding.entityIds.length > 0 && (
                    <p className="xbrl-finding-meta">
                      {t('xbrl.validation.affected', { count: finding.entityIds.length })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        );
      })}

      <p className="xbrl-hint">{t('xbrl.validation.disclaimer')}</p>
    </div>
  );
}
