// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// نتحكّم في حالة القفل عبر تزييف الخطاف بدل نداء الشبكة.
vi.mock('../../../hooks/usePeriodLock', () => ({
  usePeriodLock: vi.fn(),
}));

import { usePeriodLock } from '../../../hooks/usePeriodLock';
import HistoricalDateNotice from '../HistoricalDateNotice';

const mockLock = usePeriodLock as unknown as ReturnType<typeof vi.fn>;
const nextYear = new Date().getFullYear() + 1;
const lastYear = new Date().getFullYear() - 1;

beforeEach(() => {
  mockLock.mockReturnValue({ lockBeforeDate: null, canOverride: false, loading: false });
});

describe('HistoricalDateNotice', () => {
  it('لا شيء لتاريخ في السنة الحالية', () => {
    const { container } = render(<HistoricalDateNotice date={`${new Date().getFullYear()}-06-01`} />);
    expect(container.firstChild).toBeNull();
  });

  it('يعرض تنبيه السنة السابقة لفاتورة 2024', () => {
    render(<HistoricalDateNotice date={`${lastYear}-12-15`} />);
    expect(screen.getByText(new RegExp(`سنة مالية سابقة \\(${lastYear}\\)`))).toBeInTheDocument();
  });

  it('يعرض رسالة القفل حين يكون التاريخ مقفولًا بلا تجاوز', () => {
    mockLock.mockReturnValue({ lockBeforeDate: `${nextYear}-01-01`, canOverride: false, loading: false });
    render(<HistoricalDateNotice date={`${lastYear}-05-01`} />);
    expect(screen.getByText(/الفترة المالية مقفلة/)).toBeInTheDocument();
  });

  it('يعرض تنبيه التجاوز حين يملك المستخدم صلاحية التجاوز', () => {
    mockLock.mockReturnValue({ lockBeforeDate: `${nextYear}-01-01`, canOverride: true, loading: false });
    render(<HistoricalDateNotice date={`${lastYear}-05-01`} />);
    expect(screen.getByText(/سيتجاوز|سيتجاوز القفل/)).toBeInTheDocument();
  });

  it('enforcesLock=false يمنع رسالة القفل (مستند غير مُرحَّل مثل الشيك)', () => {
    mockLock.mockReturnValue({ lockBeforeDate: `${nextYear}-01-01`, canOverride: false, loading: false });
    render(<HistoricalDateNotice date={`${lastYear}-05-01`} enforcesLock={false} />);
    // لا رسالة قفل — يبقى فقط تنبيه السنة السابقة.
    expect(screen.queryByText(/مقفلة/)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`سنة مالية سابقة`))).toBeInTheDocument();
  });
});
