/**
 * تبويب «ربط القوائم» — بنود القوائم المالية المستقبلية ومفاهيمها.
 *
 * هذه الشاشة **لا تعرض ولا تعدّل** القوائم المالية القائمة في النظام: ما فيها بنود
 * تعريفية لتصنيف مستقبلي. لا رقم واحد هنا مأخوذ من ميزان المراجعة.
 */
import { useMemo, useState } from 'react';
import { EmptyState, FilterChip, SectionCard, StatusChip } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import { STATEMENT_TYPES, type XbrlStatementLine, type XbrlStatementType } from './xbrlTypes';

export default function XbrlStatementTab({
  lines,
  hasTaxonomy,
}: {
  lines: XbrlStatementLine[];
  hasTaxonomy: boolean;
}) {
  const { t } = useT();
  const [type, setType] = useState<XbrlStatementType | 'ALL'>('ALL');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) map.set(line.statementType, (map.get(line.statementType) ?? 0) + 1);
    return map;
  }, [lines]);

  const visible = useMemo(
    () => (type === 'ALL' ? lines : lines.filter((l) => l.statementType === type)),
    [lines, type],
  );

  return (
    <div className="xbrl-tab">
      <SectionCard title={t('xbrl.tab.statements')} icon="lab_profile">
        <div className="xbrl-filters">
          <FilterChip active={type === 'ALL'} count={lines.length} onClick={() => setType('ALL')}>
            {t('xbrl.filter.all')}
          </FilterChip>
          {STATEMENT_TYPES.map((st) => (
            <FilterChip key={st} active={type === st} count={counts.get(st) ?? 0} onClick={() => setType(st)}>
              {t(`xbrl.statement.${st}`)}
            </FilterChip>
          ))}
        </div>

        {!hasTaxonomy ? (
          <EmptyState icon="schema" title={t('xbrl.statements.no_taxonomy_title')} message={t('xbrl.statements.no_taxonomy_body')} />
        ) : visible.length === 0 ? (
          <EmptyState icon="lab_profile" title={t('xbrl.statements.empty_title')} message={t('xbrl.statements.empty_body')} />
        ) : (
          <div className="xbrl-table-wrap">
            <table className="xbrl-table">
              <thead>
                <tr>
                  <th scope="col">{t('xbrl.col.statement')}</th>
                  <th scope="col">{t('xbrl.col.line_code')}</th>
                  <th scope="col">{t('xbrl.col.line_label')}</th>
                  <th scope="col">{t('xbrl.col.parent_line')}</th>
                  <th scope="col">{t('xbrl.col.concept')}</th>
                  <th scope="col">{t('xbrl.col.line_state')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => (
                  <tr key={line.id} className={line.isTotal ? 'is-total' : undefined}>
                    <td>{t(`xbrl.statement.${line.statementType}`)}</td>
                    <td className="ltr mono">{line.lineCode}</td>
                    <td>{line.lineLabelAr}</td>
                    <td className="ltr mono xbrl-muted">{line.parentLineCode ?? '—'}</td>
                    <td>
                      {line.concept ? (
                        <span className="xbrl-concept-cell">
                          <span className="ltr mono">{line.concept.conceptCode}</span>
                          <span className="xbrl-muted">{line.concept.labelAr}</span>
                        </span>
                      ) : (
                        <StatusChip tone="orange">{t('xbrl.statements.unmapped_line')}</StatusChip>
                      )}
                    </td>
                    <td>
                      <StatusChip tone={line.isEnabled ? 'green' : 'neutral'}>
                        {t(line.isEnabled ? 'xbrl.line.enabled' : 'xbrl.line.disabled')}
                      </StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xbrl-hint">{t('xbrl.statements.note')}</p>
      </SectionCard>
    </div>
  );
}
