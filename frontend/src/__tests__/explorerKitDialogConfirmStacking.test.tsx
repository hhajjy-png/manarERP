// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import FormDialog from '../components/FormDialog';

afterEach(cleanup);

// Extract the z-index of a CSS rule block (first matching `selector { … }`).
function zIndexOf(css: string, selector: string): number {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
  );
  const block = css.match(re);
  if (!block) throw new Error(`selector ${selector} not found`);
  const z = block[1].match(/z-index:\s*(\d+)/);
  if (!z) throw new Error(`z-index not found for ${selector}`);
  return Number(z[1]);
}

// Regression for: opening an ExplorerKit add/edit Dialog, typing, then pressing
// "إلغاء" popped a "تغييرات غير محفوظة" ConfirmModal that was rendered BELOW the
// dialog overlay (modal-overlay z-index 50 < xpl-dialog-overlay 410), so the
// dialog's backdrop swallowed the clicks and the user got stuck.
describe('Confirm/secondary modals stack above ExplorerKit surfaces', () => {
  it('.modal-overlay z-index is above the ExplorerKit dialog and drawer overlays', () => {
    // vitest runs with cwd = frontend/
    const themeCss = readFileSync('src/app/theme.css', 'utf8');
    const xplCss = readFileSync('src/components/explorer/explorer-kit.css', 'utf8');
    const modalZ = zIndexOf(themeCss, '.modal-overlay');
    const dialogZ = zIndexOf(xplCss, '.xpl-dialog-overlay');
    const drawerZ = zIndexOf(xplCss, '.xpl-drawer-overlay');

    expect(modalZ).toBeGreaterThan(dialogZ);
    expect(modalZ).toBeGreaterThan(drawerZ);
  });
});

function DialogHarness(): JSX.Element {
  const [open, setOpen] = useState(true);
  if (!open) return <div>__closed__</div>;
  return (
    <FormDialog
      title="إضافة عميل"
      skin="explorer"
      icon="person"
      endpoint="/customers"
      fields={[{ name: 'name', label: 'label.name' }]}
      onClose={() => setOpen(false)}
      onSaved={() => {}}
    />
  );
}

describe('ExplorerKit FormDialog — unsaved-changes confirm flow', () => {
  it('cancel with changes → confirm → "continue editing" keeps the dialog and data', () => {
    const { container } = render(<DialogHarness />);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'حسن' } });
    expect(input.value).toBe('حسن');

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByText('تغييرات غير محفوظة')).toBeInTheDocument();

    // "العودة" = keep editing → confirm dismissed, dialog + typed data remain
    fireEvent.click(screen.getByRole('button', { name: 'العودة' }));
    expect(screen.queryByText('تغييرات غير محفوظة')).not.toBeInTheDocument();
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('حسن');
  });

  it('cancel with changes → "discard changes" closes the dialog', () => {
    render(<DialogHarness />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'مركبة' } });

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByText('تغييرات غير محفوظة')).toBeInTheDocument();

    // "إغلاق بدون حفظ" = discard → onClose fires, dialog unmounts
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق بدون حفظ' }));
    expect(screen.getByText('__closed__')).toBeInTheDocument();
  });
});
