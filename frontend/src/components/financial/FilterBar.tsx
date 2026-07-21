import { ReactNode } from 'react';
import DateInput from '../DateInput';
import { useT } from '../../lib/i18n';

interface FilterBarProps {
  fromDate?: string;
  toDate?: string;
  search?: string;
  onFromDate?: (v: string) => void;
  onToDate?: (v: string) => void;
  onSearch?: (v: string) => void;
  children?: ReactNode;
}

export function FilterBar({ fromDate, toDate, search, onFromDate, onToDate, onSearch, children }: FilterBarProps) {
  const { t } = useT();
  return (
    <div className="financial-filter-bar" dir="rtl">
      {children}
      {onFromDate && (
        <div className="filter-field">
          <label>{t('filter.date_from')}</label>
          <DateInput value={fromDate ?? ''} onChange={onFromDate} />
        </div>
      )}
      {onToDate && (
        <div className="filter-field">
          <label>{t('filter.date_to')}</label>
          <DateInput value={toDate ?? ''} onChange={onToDate} />
        </div>
      )}
      {onSearch && (
        <div className="filter-field">
          <label>{t('action.search')}</label>
          <input
            type="text"
            value={search ?? ''}
            placeholder={t('fc.ph.search')}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
