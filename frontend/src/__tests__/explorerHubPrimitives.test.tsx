// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DrawerHeaderCard,
  DrawerQuickActions,
  DrawerInfoGrid,
} from '../components/explorer/ExplorerKit';

describe('DrawerHeaderCard', () => {
  it('renders title, status and KPI tiles', () => {
    render(
      <DrawerHeaderCard
        icon="person"
        title="عميل تجريبي"
        status={{ tone: 'green', label: 'نشط' }}
        kpis={[
          { label: 'الرصيد الحالي', value: 'KWD 100.000' },
          { label: 'عدد الفواتير', value: 8 },
        ]}
      />,
    );
    expect(screen.getByText('عميل تجريبي')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();
    expect(screen.getByText('الرصيد الحالي')).toBeInTheDocument();
    expect(screen.getByText('KWD 100.000')).toBeInTheDocument();
    expect(screen.getByText('عدد الفواتير')).toBeInTheDocument();
  });

  it('omits the status chip when no status is given', () => {
    const { container } = render(<DrawerHeaderCard icon="person" title="بدون حالة" />);
    expect(container.querySelector('.xpl-chip')).toBeNull();
    expect(container.querySelector('.xpl-drawer-kpis')).toBeNull();
  });
});

describe('DrawerQuickActions', () => {
  it('renders nothing when the action list is empty', () => {
    const { container } = render(<DrawerQuickActions actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders actions and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <DrawerQuickActions
        actions={[{ key: 'edit', icon: 'edit', label: 'تعديل', onClick }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('honors disabled', () => {
    render(
      <DrawerQuickActions
        actions={[{ key: 'x', icon: 'delete', label: 'حذف', onClick: () => {}, disabled: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'حذف' })).toBeDisabled();
  });
});

describe('DrawerInfoGrid', () => {
  it('drops empty items and renders the rest', () => {
    render(
      <DrawerInfoGrid
        title="معلومات"
        items={[
          { label: 'الكود', value: 'C-1' },
          { label: 'الهاتف', value: '' },
          { label: 'النوع', value: null },
          { label: 'المدينة', value: '—' },
        ]}
      />,
    );
    expect(screen.getByText('الكود')).toBeInTheDocument();
    expect(screen.getByText('C-1')).toBeInTheDocument();
    expect(screen.queryByText('الهاتف')).toBeNull();
    expect(screen.queryByText('النوع')).toBeNull();
    expect(screen.queryByText('المدينة')).toBeNull();
  });

  it('renders nothing when every item is empty', () => {
    const { container } = render(
      <DrawerInfoGrid items={[{ label: 'أ', value: '' }, { label: 'ب', value: null }]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
