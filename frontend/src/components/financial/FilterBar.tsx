import { ReactNode } from 'react';

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
          <input type="date" value={fromDate ?? ''} onChange={e => onFromDate(e.target.value)} />
        </div>
      )}
      {onToDate && (
        <div className="filter-field">
          <label>إلى تاريخ</label>
          <input type="date" value={toDate ?? ''} onChange={e => onToDate(e.target.value)} />
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
