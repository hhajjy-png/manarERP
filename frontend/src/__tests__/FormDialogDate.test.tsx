// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }), put: vi.fn().mockResolvedValue({ data: {} }) },
  errorMessage: (e: unknown) => String(e),
}));

import FormDialog, { type FormField } from '../components/FormDialog';
import { api } from '../api/client';

const post = api.post as unknown as ReturnType<typeof vi.fn>;
const put = api.put as unknown as ReturnType<typeof vi.fn>;

const FIELDS: FormField[] = [{ name: 'hireDate', label: 'field.hire_date', type: 'date', required: true }];

function renderDialog(initial?: Record<string, unknown>, id?: number) {
  return render(
    <FormDialog
      title="موظف"
      fields={FIELDS}
      initial={initial}
      id={id}
      endpoint="/employees"
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
}

function dateField() {
  return screen.getByRole('textbox') as HTMLInputElement;
}
function saveBtn() {
  return screen.getByRole('button', { name: /حفظ|save/i });
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('FormDialog — standardized date fields (config-driven forms, e.g. Equipment/Employee)', () => {
  it('rehydrates an existing ISO datetime as DD/MM/YYYY with NO timezone day shift', () => {
    // 22:00Z would roll to the next day under new Date(...).toISOString() math.
    renderDialog({ hireDate: '2026-07-01T22:00:00.000Z' }, 7);
    expect(dateField().value).toBe('01/07/2026');
    expect(dateField().value).not.toContain('-'); // never raw ISO
  });

  it('creates: typed DD/MM/YYYY is submitted as canonical YYYY-MM-DD', async () => {
    renderDialog();
    fireEvent.change(dateField(), { target: { value: '31/12/2025' } });
    fireEvent.blur(dateField());
    fireEvent.click(saveBtn());
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [endpoint, payload] = post.mock.calls[0];
    expect(endpoint).toBe('/employees');
    expect(payload.hireDate).toBe('2025-12-31');
  });

  it('edit-without-change saves the stored date unchanged (leap day)', async () => {
    renderDialog({ hireDate: '2024-02-29' }, 7);
    expect(dateField().value).toBe('29/02/2024');
    fireEvent.click(saveBtn()); // user edits nothing
    await waitFor(() => expect(put).toHaveBeenCalled());
    const [endpoint, payload] = put.mock.calls[0];
    expect(endpoint).toBe('/employees/7');
    expect(payload.hireDate).toBe('2024-02-29');
  });
});
