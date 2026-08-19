/**
 * تبويب «نظرة عامة» — حالة التصنيف وسياق التقرير ومعادلة الميزانية.
 *
 * البانر الأول في الصفحة يقول صراحةً إن النظام **لا يدّعي** توافقًا رسميًا. موضعه في
 * الأعلى مقصود: أهم معلومة على هذه الشاشة ليست النسبة المئوية، بل أن الرقم لا يعني
 * قبولًا من أي جهة.
 */
import { MetricChip, SectionCard, StatusChip } from '../explorer/ExplorerKit';
import { MoneyText } from '../../config/modules';
import { useT } from '../../lib/i18n';
import type { XbrlReadinessReport } from './xbrlTypes';

function dateText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

export default function XbrlOverviewTab({ report }: { report: XbrlReadinessReport }) {
  const { t } = useT();
  const { taxonomy, context, equation, trialBalance, score } = report;

  return (
    <div className="xbrl-tab">
      {!score.officialTaxonomyInstalled && (
        <div className="xbrl-notice" role="note">
          <span className="material-symbols-outlined" aria-hidden="true">info</span>
          <div>
            <strong>{t('xbrl.notice.no_official_title')}</strong>
            <p>{t('xbrl.notice.no_official_body')}</p>
          </div>
        </div>
      )}

      <div className="xbrl-overview-grid">
        <SectionCard title={t('xbrl.overview.taxonomy')} icon="schema">
          {taxonomy ? (
            <dl className="xbrl-kv">
              <div><dt>{t('xbrl.field.taxonomy_name')}</dt><dd>{taxonomy.nameAr}</dd></div>
              <div><dt>{t('xbrl.field.taxonomy_code')}</dt><dd className="ltr">{taxonomy.code}</dd></div>
              <div><dt>{t('xbrl.field.version')}</dt><dd className="ltr">{taxonomy.version}</dd></div>
              <div><dt>{t('xbrl.field.jurisdiction')}</dt><dd>{t(`xbrl.jurisdiction.${taxonomy.jurisdiction}`)}</dd></div>
              <div>
                <dt>{t('xbrl.field.status')}</dt>
                <dd>
                  <StatusChip tone={taxonomy.status === 'ACTIVE' ? 'green' : 'neutral'}>
                    {t(`xbrl.taxonomy_status.${taxonomy.status}`)}
                  </StatusChip>
                </dd>
              </div>
              <div>
                <dt>{t('xbrl.field.official')}</dt>
                <dd>
                  <StatusChip tone={taxonomy.isOfficial ? 'green' : 'orange'} icon={taxonomy.isOfficial ? 'verified' : 'help'}>
                    {t(taxonomy.isOfficial ? 'xbrl.official.yes' : 'xbrl.official.no')}
                  </StatusChip>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="xbrl-muted">{t('xbrl.overview.no_taxonomy')}</p>
          )}
        </SectionCard>

        <SectionCard title={t('xbrl.overview.context')} icon="event_note">
          {context ? (
            <dl className="xbrl-kv">
              <div><dt>{t('xbrl.field.entity')}</dt><dd>{context.entityName}</dd></div>
              <div><dt>{t('xbrl.field.entity_id')}</dt><dd className="ltr">{context.entityIdentifier ?? '—'}</dd></div>
              <div><dt>{t('xbrl.field.fiscal_year')}</dt><dd className="ltr">{context.fiscalYear}</dd></div>
              <div><dt>{t('xbrl.field.period')}</dt><dd className="ltr">{dateText(context.periodStart)} — {dateText(context.periodEnd)}</dd></div>
              <div>
                <dt>{t('xbrl.field.comparative')}</dt>
                <dd className="ltr">
                  {context.comparativePeriodStart
                    ? `${dateText(context.comparativePeriodStart)} — ${dateText(context.comparativePeriodEnd)}`
                    : '—'}
                </dd>
              </div>
              <div><dt>{t('xbrl.field.currency')}</dt><dd className="ltr">{context.currency} · {context.decimals}</dd></div>
            </dl>
          ) : (
            <p className="xbrl-muted">{t('xbrl.overview.no_context')}</p>
          )}
        </SectionCard>

        <SectionCard title={t('xbrl.overview.equation')} icon="balance">
          <dl className="xbrl-kv">
            <div><dt>{t('xbrl.field.assets')}</dt><dd><MoneyText value={equation.assets} /></dd></div>
            <div><dt>{t('xbrl.field.liabilities')}</dt><dd><MoneyText value={equation.liabilities} /></dd></div>
            <div><dt>{t('xbrl.field.equity')}</dt><dd><MoneyText value={equation.equity} /></dd></div>
            <div><dt>{t('xbrl.field.net_result')}</dt><dd><MoneyText value={equation.netResult} /></dd></div>
            <div><dt>{t('xbrl.field.equity_total')}</dt><dd><MoneyText value={equation.totalEquityWithResult} /></dd></div>
            <div>
              <dt>{t('xbrl.field.equation_state')}</dt>
              <dd>
                <StatusChip tone={equation.isBalanced ? 'green' : 'red'} icon={equation.isBalanced ? 'check_circle' : 'error'}>
                  {t(equation.isBalanced ? 'xbrl.equation.balanced' : 'xbrl.equation.unbalanced')}
                </StatusChip>
              </dd>
            </div>
          </dl>
        </SectionCard>

        <SectionCard title={t('xbrl.overview.trial_balance')} icon="account_balance">
          <dl className="xbrl-kv">
            <div><dt>{t('xbrl.field.total_debit')}</dt><dd><MoneyText value={trialBalance.totalDebit} /></dd></div>
            <div><dt>{t('xbrl.field.total_credit')}</dt><dd><MoneyText value={trialBalance.totalCredit} /></dd></div>
            <div><dt>{t('xbrl.field.difference')}</dt><dd><MoneyText value={trialBalance.difference} /></dd></div>
            <div>
              <dt>{t('xbrl.field.tb_state')}</dt>
              <dd>
                <StatusChip tone={trialBalance.isBalanced ? 'green' : 'red'} icon={trialBalance.isBalanced ? 'check_circle' : 'error'}>
                  {t(trialBalance.isBalanced ? 'xbrl.equation.balanced' : 'xbrl.equation.unbalanced')}
                </StatusChip>
              </dd>
            </div>
          </dl>
          <p className="xbrl-hint">{t('xbrl.overview.source_note')}</p>
        </SectionCard>
      </div>

      <SectionCard title={t('xbrl.overview.progress')} icon="donut_large">
        <div className="xbrl-progress">
          <div className="xbrl-progress-bar" role="img" aria-label={t('xbrl.overview.progress_aria', { percent: score.mappedPercentage })}>
            <span style={{ width: `${Math.min(100, Math.max(0, score.mappedPercentage))}%` }} />
          </div>
          <span className="xbrl-progress-value ltr">{score.mappedPercentage}%</span>
        </div>
        <div className="xbrl-progress-legend">
          <MetricChip tone="green">{t('xbrl.kpi.mapped')}: {score.mapped}</MetricChip>
          <MetricChip tone="red">{t('xbrl.kpi.unmapped')}: {score.unmapped}</MetricChip>
          <MetricChip tone="orange">{t('xbrl.kpi.needs_review')}: {score.needsReview}</MetricChip>
          <MetricChip tone="neutral">{t('xbrl.kpi.not_applicable')}: {score.notApplicable}</MetricChip>
        </div>
        <p className="xbrl-hint">{t('xbrl.overview.progress_note')}</p>
      </SectionCard>
    </div>
  );
}
