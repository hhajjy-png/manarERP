import { ReactNode } from 'react';
import DateInput from '../DateInput';

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
  return (
    <div className="financial-filter-bar" dir="rtl">
      {children}
      {onFromDate && (
        <div className="filter-field">
          <label>من تاريخ</label>
          <DateInput value={fromDate ?? ''} onChange={onFromDate} />
        </div>
      )}
      {onToDate && (
        <div className="filter-field">
          <label>إلى تاريخ</label>
          <DateInput value={toDate ?? ''} onChange={onToDate} />
        </div>
      )}
      {onSearch && (
        <div className="filter-field">
          <label>بحث</label>
          <input
            type="text"
            value={search ?? ''}
            placeholder="بحث..."
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
