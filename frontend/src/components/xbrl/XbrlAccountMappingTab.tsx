/**
 * تبويب «ربط الحسابات».
 *
 * الجدول يعرض دليل الحسابات كما هو **دون تعديله**: الرمز والاسم والرصيد للقراءة فقط،
 * وما يُكتب هو سطر الربط وحده. لا عمود قابل للتحرير يمسّ الحساب نفسه.
 *
 * لا يُعرض أي وسم حكومي: عمود «المفهوم» فارغ ما لم يُدخل المستخدم أو يستورد تصنيفًا.
 */
import { useMemo, useState } from 'react';
import { Button, EmptyState, FilterChip, SearchBox, SectionCard, StatusChip } from '../explorer/ExplorerKit';
import { MoneyCell } from '../../config/modules';
import { useT } from '../../lib/i18n';
import { MAPPING_STATUS_TONE, type XbrlAccountRow, type XbrlMappingStatus } from './xbrlTypes';

type StatusFilter = 'ALL' | XbrlMappingStatus;

const FILTERS: StatusFilter[] = ['ALL', 'UNMAPPED', 'MAPPED', 'NEEDS_REVIEW', 'NOT_APPLICABLE'];

export default function XbrlAccountMappingTab({
  accounts,
  canManage,
  hasTaxonomy,
  onEdit,
}: {
  accounts: XbrlAccountRow[];
  canManage: boolean;
  hasTaxonomy: boolean;
  onEdit: (account: XbrlAccountRow) => void;
}) {
  const { t } = useT();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const counts = useMemo(() => {
    const base: Record<StatusFilter, number> = {
      ALL: accounts.length, MAPPED: 0, UNMAPPED: 0, NEEDS_REVIEW: 0, NOT_APPLICABLE: 0,
    };
    for (const a of accounts) base[a.mappingStatus] += 1;
    return base;
  }, [accounts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter !== 'ALL' && a.mappingStatus !== filter) return false;
      if (!term) return true;
      return (
        a.code.toLowerCase().includes(term) ||
        a.name.toLowerCase().includes(term) ||
        (a.conceptCode ?? '').toLowerCase().includes(term)
      );
    });
  }, [accounts, filter, search]);

  return (
    <div className="xbrl-tab">
      <SectionCard
        title={t('xbrl.tab.accounts')}
        icon="account_tree"
        actions={
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder={t('xbrl.accounts.search')}
            ariaLabel={t('xbrl.accounts.search')}
          />
        }
      >
        <div className="xbrl-filters">
          {FILTERS.map((key) => (
            <FilterChip key={key} active={filter === key} count={counts[key]} onClick={() => setFilter(key)}>
              {t(key === 'ALL' ? 'xbrl.filter.all' : `xbrl.status.${key}`)}
            </FilterChip>
          ))}
        </div>

        {!hasTaxonomy && (
          <div className="xbrl-notice xbrl-notice--warn" role="note">
            <span className="material-symbols-outlined" aria-hidden="true">warning</span>
            <div><p>{t('xbrl.accounts.no_taxonomy')}</p></div>
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyState icon="search_off" title={t('xbrl.accounts.empty_title')} message={t('xbrl.accounts.empty_body')} />
        ) : (
          <div className="xbrl-table-wrap">
            <table className="xbrl-table">
              <thead>
                <tr>
                  <th scope="col">{t('xbrl.col.account_code')}</th>
                  <th scope="col">{t('xbrl.col.account_name')}</th>
                  <th scope="col">{t('xbrl.col.account_type')}</th>
                  <th scope="col" className="num">{t('xbrl.col.balance')}</th>
                  <th scope="col">{t('xbrl.col.mapping_status')}</th>
                  <th scope="col">{t('xbrl.col.concept')}</th>
                  <th scope="col">{t('xbrl.col.notes')}</th>
                  {canManage && <th scope="col" className="actions">{t('xbrl.col.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr key={a.accountId}>
                    <td className="ltr mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td>{t(`xbrl.account_type.${a.type}`)}</td>
                    <td className="num"><MoneyCell value={a.balance} /></td>
                    <td>
                      <StatusChip tone={MAPPING_STATUS_TONE[a.mappingStatus]}>
                        {t(`xbrl.status.${a.mappingStatus}`)}
                      </StatusChip>
                    </td>
                    <td>
                      {a.conceptCode ? (
                        <span className="xbrl-concept-cell">
                          <span className="ltr mono">{a.conceptCode}</span>
                          <span className="xbrl-muted">{a.conceptLabelAr}</span>
                        </span>
                      ) : (
                        <span className="xbrl-muted">—</span>
                      )}
                    </td>
                    <td className="xbrl-muted">{a.notes ?? '—'}</td>
                    {canManage && (
                      <td className="actions">
                        <Button small icon="link" onClick={() => onEdit(a)} disabled={!hasTaxonomy}>
                          {t(a.mappingId ? 'xbrl.action.edit_mapping' : 'xbrl.action.map')}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
